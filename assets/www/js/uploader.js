/* =====================================================================
 *  uploader.js — Carga de archivos de música desde el almacenamiento local
 *  Reproductor de música profesional · mobile-first
 *
 *  Funciones:
 *    - Aceptar mp3/m4a/flac/wav/ogg vía input file o drag-drop
 *    - Leer metadatos ID3 con jsmediatags (embebido localmente)
 *    - Generar portada dinámica si no hay artwork
 *    - Intentar cargar archivo .lrc con el mismo nombre
 *    - Guardar el blob en IndexedDB y devolver un objectURL
 * ===================================================================== */

/* eslint-disable no-unused-vars */
(function () {
  'use strict';

  const Uploader = {
    /* Traduce sin depender de que App.t esté disponible (uploader también
     * se usa en pruebas aisladas). */
    _t(key, fallback) {
      try {
        if (window.App && typeof window.App.t === 'function') {
          const v = window.App.t(key);
          if (v && v !== key) return v;
        }
      } catch (e) {}
      return fallback;
    },

    ACCEPTED: '.mp3,.m4a,.flac,.wav,.ogg,.webm,.opus,audio/*',
    PALETTE: window.COVER_PALETTE || [
      { from: '#7C3AED', to: '#EC4899', angle: 135 }
    ],

    /* ---------- Procesa una lista de File y devuelve tracks ---------- */
    async processFiles(fileList, opts) {
      opts = opts || {};
      const onProgress = typeof opts.onProgress === 'function' ? opts.onProgress : null;
      const isCancelled = typeof opts.isCancelled === 'function' ? opts.isCancelled : () => false;
      const out = [];
      // Separar audio vs lrc para emparejarlos por nombre
      const audios = [];
      const lrcs = {};
      Array.from(fileList).forEach(f => {
        const name = f.name.toLowerCase();
        if (name.endsWith('.lrc') || name.endsWith('.txt')) {
          const key = name.replace(/\.(lrc|txt)$/, '');
          lrcs[key] = f;
        } else if (f.type.startsWith('audio/') || /\.(mp3|m4a|flac|wav|ogg|webm|opus)$/i.test(name)) {
          audios.push(f);
        }
      });

      // Procesar en paralelo con límite de concurrencia para no bloquear.
      // jsmediatags y el parser ID3v2 son asíncronos y pueden ejecutarse
      // concurrentemente; el límite evita saturar la CPU/memoria con muchos archivos.
      // 3–6 trabajadores según el hardware: decodificar portadas y
      // sondear duraciones es trabajo paralelo real, y con 3 fijos un
      // móvil de 8 núcleos importaba a medio gas.
      const CONCURRENCY = Math.min(6, Math.max(3, (navigator.hardwareConcurrency || 4) - 1));
      // Una sola decodificación por portada distinta en todo el lote
      // (en un álbum, las 12 canciones traen la misma imagen).
      const artworkCache = new Map();
      let index = 0;
      let completed = 0;
      const results = new Array(audios.length);
      if (onProgress) onProgress(0, audios.length, '');

      const worker = async () => {
        while (index < audios.length) {
          if (isCancelled()) return;
          const myIdx = index++;
          const file = audios[myIdx];
          try {
            const track = await this.processOne(file, lrcs, artworkCache);
            results[myIdx] = track;
          } catch (e) {
            console.warn('[Aurora] No se pudo procesar', file.name, e);
            results[myIdx] = this.fallbackTrack(file);
          }
          completed++;
          if (onProgress) onProgress(completed, audios.length, file.name);
          await new Promise(r => setTimeout(r, 0));
        }
      };

      // Lanzar N workers concurrentes
      const workers = [];
      for (let i = 0; i < CONCURRENCY; i++) workers.push(worker());
      await Promise.all(workers);

      // Filtrar nulos (por si acaso) y devolver en orden
      for (const t of results) {
        if (t) out.push(t);
      }
      return out;
    },

    /* ---------- Procesa un único File ---------- */
    async processOne(file, lrcsMap, artworkCache) {
      const baseName = file.name.replace(/\.[^.]+$/, '').toLowerCase();
      const id = 't-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8);
      const fromName = this.parseFilename(file.name);

      let meta = {
        title: fromName.title || this.cleanName(file.name),
        artist: fromName.artist || this._t('unknown_artist', 'Artista desconocido'),
        album: this._t('no_album', 'Sin álbum'),
        cover: null,
        lrc: null
      };

      const lrcFile = this.findMatchingLrc(file.name, lrcsMap);
      /* FLAC/OGG/Opus guardan sus metadatos como Vorbis Comment, no
       * como ID3: se leen primero con el lector propio (lee como
       * mucho 1 MB) porque el STREAMINFO de FLAC ya trae la duración
       * exacta y ahorra el sondeo con <audio> de abajo. */
      const isVorbisFile = /\.(flac|ogg|opus)$/i.test(file.name || '') || /audio\/(?:flac|ogg|x-flac)/i.test(file.type || '');
      const vorbis = isVorbisFile ? await this.readVorbisTags(file).catch(() => null) : null;

      /* La duración también es un metadato básico: sin sondearla, la
       * biblioteca mostraba 0:00 hasta reproducir cada canción. Se pide
       * en paralelo con las etiquetas; probeDuration() tiene timeout y
       * ante un archivo corrupto devuelve 0 sin bloquear la importación.
       * Si el lector Vorbis ya la trajo (FLAC), ni se sondea. */
      //  si el lector Vorbis propio ya sacó los tags del primer
      // MB (FLAC/OGG/Opus), jsmediatags sobra: leería el archivo
      // ENTERO (los FLAC son los más grandes) para llegar a los
      // mismos datos. Solo se le llama si falta el título Vorbis.
      const vorbisComplete = !!(vorbis && this.tagText(vorbis.title));
      let [tags, lrcText, duration] = await Promise.all([
        vorbisComplete ? Promise.resolve(null) : this.readTags(file).catch(() => null),
        lrcFile ? this.readTextFile(lrcFile).catch(() => null) : Promise.resolve(null),
        (vorbis && vorbis.duration) ? Promise.resolve(vorbis.duration) : this.probeDuration(file).catch(() => 0)
      ]);

      /* El lector propio rellena lo que falte sin pisar nunca un
       * dato ID3/MP4 válido. */
      if (vorbis) {
        if (!tags) tags = Object.assign({}, vorbis); // copia: no mutar el objeto del lector
        else {
          for (const k of ['title', 'artist', 'album', 'albumartist', 'lyrics', 'genre']) {
            if (!this.tagText(tags[k]) && vorbis[k]) tags[k] = vorbis[k];
          }
          if (!tags.picture && vorbis.picture) tags.picture = vorbis.picture;
        }
        // En Vorbis el año viaja como DATE («2005», «2005-03-01»…);
        // se normaliza en ambos caminos (: también cuando
        // jsmediatags se saltó y «tags» ES el objeto Vorbis).
        if (!this.tagText(tags.year) && vorbis.date) tags.year = vorbis.date;
        if (!this.tagText(tags.year) && vorbis.year) tags.year = vorbis.year;
      }

      let coverSet = null;
      if (tags) {
        const title = this.tagText(tags.title);
        const artist = this.tagText(tags.artist) || this.tagText(tags.albumartist);
        const album = this.tagText(tags.album);
        if (title) meta.title = title;
        if (artist) meta.artist = artist;
        if (album) meta.album = album;
        const genre = this.tagText(tags.genre);
        if (genre) meta.genre = genre.slice(0, 60);
        const yearMatch = String(tags.year || '').match(/\d{4}/);
        if (yearMatch) meta.year = parseInt(yearMatch[0], 10);
        if (tags.picture) {
          // Una decodificación para las tres copias (y compartida
          // con las demás canciones del mismo álbum vía caché).
          const art = await this._artworkForPicture(tags.picture, artworkCache).catch(() => null);
          if (art) { coverSet = art; meta.cover = art.cover; }
        }
        const usltLyrics = this.extractUslt(tags);
        if (usltLyrics) meta.lrc = this.normalizeLyrics(usltLyrics);
        if (!meta.lrc) {
          const syltLyrics = this.extractSylt(tags);
          if (syltLyrics) meta.lrc = syltLyrics;
        }
      }

      if (!meta.lrc) {
        try {
          const customLyrics = await this.readLyricsFromId3v2(file);
          if (customLyrics) {
            const norm = this.normalizeLyrics(customLyrics);
            if (norm && norm.length) meta.lrc = norm;
          }
        } catch (e) {}
      }

      if (lrcText) meta.lrc = this.normalizeLyrics(lrcText);
      if (!meta.cover) meta.cover = this.randomCover();

      const coverIsImage = typeof meta.cover === 'string' && (meta.cover.startsWith('data:') || meta.cover.startsWith('blob:'));
      let coverThumb = null, coverThumbLg = null;
      if (coverIsImage) {
        if (coverSet) {
          // Ya vienen de la única decodificación (no re-decodificar)
          coverThumb = coverSet.coverThumb;
          coverThumbLg = coverSet.coverThumbLg;
        } else {
          try {
            coverThumb = await this.resizeDataUrl(meta.cover, 144);
            coverThumbLg = await this.resizeDataUrl(meta.cover, 384);
          } catch (e) {}
        }
      }

      return {
        id,
        title: meta.title,
        artist: meta.artist,
        album: meta.album,
        duration: duration || 0,
        src: URL.createObjectURL(file),
        cover: meta.cover,
        coverIsImage,
        coverThumb,
        coverThumbLg,
        genre: meta.genre || '',
        year: meta.year || null,
        //  esta pista ya pasó por el lector de tags actual
        // (con género/año): el arranque no tiene que releerla.
        _tagsChecked: true,
        lrc: meta.lrc,
        fileSize: file.size,
        fileName: file.name,
        addedAt: Date.now(),
        _file: file
      };
    },

    resizeDataUrl(dataUrl, size) {
      return new Promise((resolve) => {
        try {
          const img = new Image();
          img.onload = () => {
            try {
              const c = document.createElement('canvas');
              c.width = size;
              c.height = size;
              const ctx = c.getContext('2d');
              const r = Math.max(size / img.width, size / img.height);
              const dw = img.width * r, dh = img.height * r;
              ctx.drawImage(img, (size - dw) / 2, (size - dh) / 2, dw, dh);
              resolve(c.toDataURL('image/jpeg', 0.72));
            } catch (e) { resolve(null); }
          };
          img.onerror = () => resolve(null);
          img.src = dataUrl;
        } catch (e) { resolve(null); }
      });
    },

    tagText(v) {
      if (v == null) return '';
      if (typeof v === 'string') return v.trim();
      if (typeof v === 'number') return String(v);
      if (typeof v === 'object') {
        if (typeof v.data === 'string') return v.data.trim();
        if (Array.isArray(v.data)) {
          return v.data.map((x) => (typeof x === 'string' ? x : '')).join('').trim();
        }
        if (typeof v.text === 'string') return v.text.trim();
        if (typeof v.description === 'string' && typeof v.text !== 'string') return '';
      }
      return '';
    },

    parseFilename(name) {
      const base = name.replace(/\.[^.]+$/, '').replace(/_/g, ' ').trim();
      const m = base.match(/^(?:\d+[\s._-]+)?(.+?)\s[-–—]\s+(.+)$/);
      if (m) return { artist: m[1].trim(), title: m[2].trim() };
      return { artist: '', title: this.cleanName(name) };
    },

    /* ---------- Lee tags ID3 con jsmediatags (cargado desde CDN) ---------- */
    readTags(file) {
      return new Promise((resolve, reject) => {
        if (!window.jsmediatags) return resolve(null);
        try {
          // Solicitamos explícitamente lyrics para asegurar que USLT se lea.
          // jsmediatags por defecto puede no incluir lyrics en algunos builds.
          window.jsmediatags.read(file, {
            tags: ['title', 'artist', 'album', 'year', 'comment', 'track', 'genre', 'picture', 'lyrics', 'composer', 'USLT', 'SYLT'],
            onSuccess: (r) => resolve(r.tags || null),
            onError: (e) => resolve(null)
          });
        } catch (e) { resolve(null); }
      });
    },

    /* ---------- Metadatos Vorbis Comment (FLAC / OGG / Opus) ----------
     * Formato: longitud LE + texto UTF-8 «CLAVE=valor». En FLAC los
     * bloques van tras la firma «fLaC» (tipo 4 = comentario, tipo 6 =
     * portada); en Ogg los paquetes se reconstruyen uniendo segmentos
     * de página (un segmento de 255 bytes continúa en el siguiente).
     * Solo se lee el primer MB: los comentarios viven al principio;
     * una portada mayor simplemente no se extrae y se usa el degradado. */
    /* Lee un Blob como ArrayBuffer vía FileReader: Blob.arrayBuffer()
     * no existe en WebViews antiguos y en algunos entornos devuelve un
     * buffer vacío; FileReader es el camino compatible de siempre. */
    _blobArrayBuffer(blob) {
      return new Promise((resolve, reject) => {
        try {
          if (typeof FileReader !== 'undefined') {
            const r = new FileReader();
            r.onload = () => resolve(r.result);
            r.onerror = () => reject(r.error);
            r.readAsArrayBuffer(blob);
          } else if (blob && typeof blob.arrayBuffer === 'function') {
            blob.arrayBuffer().then(resolve, reject);
          } else reject(new Error('sin lector binario'));
        } catch (e) { reject(e); }
      });
    },

    async readVorbisTags(file) {
      try {
        if (!file || typeof file.slice !== 'function' || !file.size) return null;
        const bytes = new Uint8Array(await this._blobArrayBuffer(file.slice(0, Math.min(file.size, 1024 * 1024))));
        if (this._ascii(bytes, 0, 4) === 'fLaC') return this._parseFlacTags(bytes);
        if (this._ascii(bytes, 0, 4) === 'OggS') return this._parseOggTags(bytes);
        return null;
      } catch (e) { return null; }
    },

    _ascii(bytes, offset, len) {
      let out = '';
      for (let i = 0; i < len && offset + i < bytes.length; i++) out += String.fromCharCode(bytes[offset + i]);
      return out;
    },

    _bytesToBase64(bytes) {
      let binary = '';
      const chunk = 0x8000;
      for (let i = 0; i < bytes.length; i += chunk) {
        binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
      }
      return btoa(binary);
    },

    _parseVorbisComment(bytes, offset) {
      try {
        const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
        const decoder = typeof TextDecoder !== 'undefined' ? new TextDecoder('utf-8') : null;
        const text = (a, b) => {
          const slice = bytes.subarray(a, b);
          return decoder ? decoder.decode(slice) : String.fromCharCode.apply(null, slice);
        };
        let pos = offset || 0;
        const readU32 = () => {
          if (pos + 4 > bytes.length) throw new Error('vorbis truncado');
          const n = view.getUint32(pos, true); pos += 4; return n;
        };
        const vendorLen = readU32(); pos += vendorLen;
        const count = readU32();
        if (count > 512) return null; // comentario absurdo: no es válido
        const fields = {};
        for (let i = 0; i < count; i++) {
          const len = readU32();
          if (len > bytes.length - pos) break;
          const entry = text(pos, pos + len); pos += len;
          const eq = entry.indexOf('=');
          if (eq <= 0) continue;
          const key = entry.slice(0, eq).trim().toLowerCase();
          if (!(key in fields)) fields[key] = entry.slice(eq + 1).trim();
        }
        const out = {};
        /*  género y fecha también se copian del comentario:
 * al saltarnos jsmediatags en FLAC/OGG/Opus estos
 * campos ya solo pueden venir de aquí. */
        for (const k of ['title', 'artist', 'album', 'albumartist', 'genre', 'date', 'lyrics', 'unsyncedlyrics']) {
          if (fields[k]) out[k === 'unsyncedlyrics' ? 'lyrics' : k] = fields[k];
        }
        if (fields.metadata_block_picture) {
          try {
            const raw = atob(fields.metadata_block_picture.replace(/\s+/g, ''));
            const picBytes = new Uint8Array(raw.length);
            for (let i = 0; i < raw.length; i++) picBytes[i] = raw.charCodeAt(i);
            const pic = this._parseFlacPicture(picBytes, 0, picBytes.length);
            if (pic) out.picture = pic;
          } catch (e) {}
        }
        return Object.keys(out).length ? out : null;
      } catch (e) { return null; }
    },

    /* Bloque de imagen FLAC (también viaja en Vorbis, en base64). */
    _parseFlacPicture(bytes, offset, length) {
      try {
        const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
        const end = Math.min(bytes.length, (offset || 0) + (length || 0));
        let pos = offset || 0;
        const readU32 = () => {
          if (pos + 4 > end) throw new Error('imagen truncada');
          const n = view.getUint32(pos, false); pos += 4; return n;
        };
        readU32(); // tipo de imagen (frontal, trasera…)
        const mimeLen = readU32();
        const mime = this._ascii(bytes, pos, mimeLen) || 'image/jpeg'; pos += mimeLen;
        const descLen = readU32(); pos += descLen;
        pos += 16; // ancho, alto, profundidad y colores
        const dataLen = readU32();
        if (!dataLen || pos + dataLen > end) return null;
        return 'data:' + mime + ';base64,' + this._bytesToBase64(bytes.subarray(pos, pos + dataLen));
      } catch (e) { return null; }
    },

    _parseFlacTags(bytes) {
      let offset = 4; // tras «fLaC»
      let tags = null;
      let picture = null;
      let flacDuration = 0;
      while (offset + 4 <= bytes.length) {
        const header = bytes[offset];
        const isLast = !!(header & 0x80);
        const type = header & 0x7f;
        const len = (bytes[offset + 1] << 16) | (bytes[offset + 2] << 8) | bytes[offset + 3];
        const start = offset + 4;
        if (start + len > bytes.length) break; // portada fuera del MB leído
        if (type === 0 && len >= 18) {
          /* STREAMINFO trae frecuencia (20 bits) y nº total de
 * muestras (36 bits): la duración sale gratis de aquí,
 * sin sondear el archivo con un <audio>. */
          const sr = (bytes[start + 10] << 12) | (bytes[start + 11] << 4) | (bytes[start + 12] >> 4);
          const total = (bytes[start + 13] & 0x0f) * 4294967296
            + bytes[start + 14] * 16777216 + bytes[start + 15] * 65536
            + bytes[start + 16] * 256 + bytes[start + 17];
          if (sr > 0 && total > 0) flacDuration = Math.round(total / sr);
        }
        else if (type === 4) tags = this._parseVorbisComment(bytes, start);
        else if (type === 6) picture = this._parseFlacPicture(bytes, start, len);
        offset = start + len;
        if (isLast) break;
      }
      if (tags && picture && !tags.picture) tags.picture = picture;
      if (tags) {
        if (flacDuration) tags.duration = flacDuration;
        return tags;
      }
      if (picture || flacDuration) return { picture: picture || undefined, duration: flacDuration || undefined };
      return tags;
    },

    _parseOggTags(bytes) {
      let offset = 0;
      let chunks = [];
      let total = 0;
      while (offset + 27 <= bytes.length && this._ascii(bytes, offset, 4) === 'OggS') {
        const segCount = bytes[offset + 26];
        let pos = offset + 27 + segCount;
        if (pos > bytes.length) break;
        for (let i = 0; i < segCount; i++) {
          const segLen = bytes[offset + 27 + i];
          if (pos + segLen > bytes.length) return null;
          chunks.push(bytes.subarray(pos, pos + segLen));
          total += segLen;
          pos += segLen;
          if (total > 2 * 1024 * 1024) return null; // sin cabeceras en 2 MB: rendirse
          if (segLen < 255) {
            // Paquete completo: ¿es el comentario Vorbis u OpusTags?
            const packet = new Uint8Array(total);
            let p = 0;
            for (const c of chunks) { packet.set(c, p); p += c.length; }
            chunks = []; total = 0;
            if (packet.length >= 7 && packet[0] === 3 && this._ascii(packet, 1, 6) === 'vorbis') {
              return this._parseVorbisComment(packet, 7);
            }
            if (packet.length >= 8 && this._ascii(packet, 0, 8) === 'OpusTags') {
              return this._parseVorbisComment(packet, 8);
            }
          }
        }
        offset = pos;
      }
      return null;
    },

    /*  aquí vivía limitArtwork (limitar la portada ID3):
 * jamás se llamó; quien lo necesita lo hace en línea. */

    /* Carga una imagen una sola vez. Con tiempo límite: un WebView
     * que ni carga ni da error no puede retener la importación. */
    _loadImage(src) {
      return new Promise((resolve) => {
        let done = false;
        const finish = (img) => { if (!done) { done = true; resolve(img); } };
        try {
          const img = new Image();
          img.onload = () => finish(img);
          img.onerror = () => finish(null);
          img.src = src;
          setTimeout(() => finish(null), 8000);
        } catch (e) { finish(null); }
      });
    },

    /* De UNA decodificación salen las tres copias (800 para el
 * reproductor, 384 y 144 para las listas —: pensadas para
 * pantallas de DPR 3, no 2). Antes cada tamaño
 * decodificaba la imagen entera otra vez: 3 decodificaciones y
 * 3 codificaciones JPEG por canción con portada. Mismos tamaños,
 * calidades y respaldos que resizeDataUrl. */
    async _produceArtwork(dataUrl) {
      const out = { cover: dataUrl, coverThumb: null, coverThumbLg: null };
      const img = await this._loadImage(dataUrl);
      if (!img || !(img.width > 0) || !(img.height > 0)) return out;
      // Copia grande: encajar en 800 sin recorte
      try {
        const w = img.width, h = img.height;
        if (Math.max(w, h) > 800) {
          const k = 800 / Math.max(w, h);
          const c = document.createElement('canvas');
          c.width = Math.max(1, Math.round(w * k));
          c.height = Math.max(1, Math.round(h * k));
          c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
          out.cover = c.toDataURL('image/jpeg', 0.85);
        }
      } catch (e) { /* se queda la original */ }
      // Miniaturas cuadradas con recorte centrado (como resizeDataUrl)
      const thumb = (size) => {
        try {
          const c = document.createElement('canvas');
          c.width = size;
          c.height = size;
          const r = Math.max(size / img.width, size / img.height);
          const dw = img.width * r, dh = img.height * r;
          c.getContext('2d').drawImage(img, (size - dw) / 2, (size - dh) / 2, dw, dh);
          return c.toDataURL('image/jpeg', 0.72);
        } catch (e) { return null; }
      };
      out.coverThumbLg = thumb(384);
      out.coverThumb = thumb(144);
      return out;
    },

    /* Huella barata de una portada (longitud + muestra de hasta 512
 * bytes/caracteres): en un álbum, todas las canciones traen la
 * MISMA imagen incrustada y decodificarla una por canción era
 * el mayor coste de importar carpetas enteras. */
    _artworkKey(picture, dataUrl) {
      let h = 0x811c9dc5;
      const mix = (n) => { h ^= (n & 0xff); h = Math.imul(h, 0x01000193); };
      const data = (picture && typeof picture === 'object') ? picture.data : null;
      let len;
      if (data && typeof data.length === 'number') {
        len = data.length;
        const step = Math.max(1, Math.floor(len / 512));
        for (let i = 0; i < len; i += step) mix(data[i]);
      } else {
        const str = typeof picture === 'string' ? picture : (dataUrl || '');
        len = str.length;
        const step = Math.max(1, Math.floor(len / 512));
        for (let i = 0; i < len; i += step) mix(str.charCodeAt(i));
      }
      return len + ':' + (h >>> 0).toString(36);
    },

    /* Portada completa (grande + miniaturas) con caché por lote:
     * los aciertos comparten hasta la promesa en curso, para que
     * dos trabajadores no decodifiquen la misma imagen a la vez. */
    async _artworkForPicture(picture, cache) {
      const dataUrl = this.pictureToDataURL(picture);
      if (!dataUrl) return null;
      if (!cache) return this._produceArtwork(dataUrl);
      const key = this._artworkKey(picture, dataUrl);
      if (!cache.has(key)) cache.set(key, this._produceArtwork(dataUrl));
      return cache.get(key);
    },

    /* ---------- Convierte la imagen ID3 (APIC) a dataURL ---------- */
    pictureToDataURL(picture) {
      try {
        // El lector Vorbis ya entrega la portada como dataURL.
        if (typeof picture === 'string') return picture.startsWith('data:') ? picture : null;
        const { data, format } = picture;
        const u8 = data instanceof Uint8Array ? data : new Uint8Array(data);
        let binary = '';
        const chunk = 0x8000;
        for (let i = 0; i < u8.length; i += chunk) {
          binary += String.fromCharCode.apply(null, u8.subarray(i, i + chunk));
        }
        return `data:${format || 'image/jpeg'};base64,${btoa(binary)}`;
      } catch (e) { return null; }
    },

    /* ---------- Genera una portada aleatoria ---------- */
    randomCover() {
      const p = this.PALETTE[Math.floor(Math.random() * this.PALETTE.length)];
      return { from: p.from, to: p.to, angle: p.angle || 135 };
    },

    /* ---------- Limpia el nombre del archivo para usar como título ---------- */
    cleanName(name) {
      return name
        .replace(/\.[^.]+$/, '')
        .replace(/^\d+[\s._-]+/, '')      // quita "01 - " del inicio
        .replace(/[_]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
    },

    /* ---------- Emparejamiento inteligente de archivo LRC/TXT ---------- */
    findMatchingLrc(audioFileName, lrcsMap) {
      if (!lrcsMap || !Object.keys(lrcsMap).length) return null;
      const base = audioFileName.replace(/\.[^.]+$/, '').toLowerCase();
      if (lrcsMap[base]) return lrcsMap[base];

      const cleanAudio = this.cleanName(audioFileName).toLowerCase();
      if (lrcsMap[cleanAudio]) return lrcsMap[cleanAudio];

      // \w borraba cirílico/CJK: la letra no se emparejaba con la canción.
      const norm = (x) => x.normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^\p{L}\p{N}]/gu, '');
      const normAudio = norm(cleanAudio);

      for (const [key, file] of Object.entries(lrcsMap)) {
        const normKey = norm(key);
        if (!normAudio || !normKey) continue;
        // Evitar falsos positivos con nombres muy cortos («01», «a»).
        if (normAudio === normKey) return file;
        if (Math.min(normAudio.length, normKey.length) >= 4 &&
            (normAudio.includes(normKey) || normKey.includes(normAudio))) {
          return file;
        }
      }
      return null;
    },

    /* ---------- Lee un archivo de texto (.lrc) ---------- */
    readTextFile(file) {
      return new Promise((resolve, reject) => {
        const r = new FileReader();
        r.onload = () => resolve(r.result);
        r.onerror = reject;
        r.readAsText(file);
      });
    },

    /* Lee la duración real del archivo con un <audio> temporal. */
    probeDuration(file) {
      return new Promise((resolve) => {
        try {
          const a = document.createElement('audio');
          a.preload = 'metadata';
          const url = URL.createObjectURL(file);
          let settled = false;
          let timer = null;
          const finish = (sec) => {
            if (settled) return;
            settled = true;
            if (timer) clearTimeout(timer);
            try { URL.revokeObjectURL(url); } catch (e) {}
            try { a.removeAttribute('src'); a.load(); } catch (e) {}
            resolve(sec > 0 && isFinite(sec) ? Math.round(sec) : 0);
          };
          a.addEventListener('loadedmetadata', () => finish(a.duration));
          a.addEventListener('error', () => finish(0));
          /* Cuatro segundos bastan para metadatos locales; un archivo
           * corrupto o un WebView lento no debe retener la importación. */
          timer = setTimeout(() => finish(0), 4000);
          a.src = url;
        } catch (e) {
          resolve(0);
        }
      });
    },

    /* ---------- Track mínimo de respaldo si todo falla ---------- */
    fallbackTrack(file) {
      const id = 't-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8);
      return {
        id,
        title: this.cleanName(file.name),
        artist: this._t('unknown_artist', 'Artista desconocido'),
        album: this._t('no_album', 'Sin álbum'),
        duration: 0,
        src: URL.createObjectURL(file),
        cover: this.randomCover(),
        coverIsImage: false,
        genre: '',
        year: null,
        lrc: null,
        fileSize: file.size,
        fileName: file.name,
        addedAt: Date.now(),
        _file: file
      };
    },

    /* ---------- Parsea un archivo .lrc externo ---------- */
    async parseLrcFile(file) {
      try {
        const text = await this.readTextFile(file);
        return text.split(/\r?\n/);
      } catch (e) { return []; }
    },

    /* ============================================================
     *  Extracción de letras embebidas en ID3
     * ============================================================ */

    /* Extrae USLT (Unsynchronized Lyrics).
     * jsmediatags puede devolver tags.lyrics como:
     *   - string (texto directo)
     *   - { language, description, text }
     *   - { language, description, lyrics }
     * También puede estar en tags.USLT. */
    extractUslt(tags) {
      const candidates = [tags.lyrics, tags.USLT, tags.LYRICS, tags.UnsynchronizedLyrics];
      for (const c of candidates) {
        if (!c) continue;
        if (typeof c === 'string') {
          if (c.trim().length > 0) return c;
        } else if (typeof c === 'object') {
          const text = c.text || c.lyrics || c.value;
          if (typeof text === 'string' && text.trim().length > 0) return text;
        }
      }
      return null;
    },

    /* Extrae SYLT (Synchronized Lyrics).
     * jsmediatags no parsea SYLT por defecto, pero si está presente
     * lo devolverá como objeto binario. Lo intentamos decodificar. */
    extractSylt(tags) {
      const raw = tags.SYLT || tags.sylt || tags.SynchronizedLyrics;
      if (!raw) return null;

      // Si ya es un array de strings con timestamps, usarlo directamente
      if (Array.isArray(raw) && raw.length && typeof raw[0] === 'string') {
        return raw;
      }

      // Si es un objeto con data (binario), intentar parsear
      if (raw.data && Array.isArray(raw.data)) {
        return this.parseSyltBinary(raw.data, raw.encoding || 0);
      }
      // Si tiene texto ya parseado
      if (raw.text && typeof raw.text === 'string') {
        return this.normalizeLyrics(raw.text);
      }
      return null;
    },

    /* Parsea un SYLT binario (raro, pero por si acaso).
     * Formato: [encoding(1)][language(3)][timestamp_format(1)][content_type(1)][descriptor(null-terminated)]
     * Luego repetido: [text(null-terminated)][timestamp(4 bytes big-endian)] */
    parseSyltBinary(bytes, encoding) {
      try {
        const lines = [];
        let offset = 0;
        // Skip header: encoding(1) + language(3) + timestamp_format(1) + content_type(1) = 6
        // + descriptor (null-terminated)
        offset = 6;
        // Skip descriptor
        while (offset < bytes.length && bytes[offset] !== 0) offset++;
        offset++; // skip null

        // Read sync'd text + timestamp pairs
        while (offset < bytes.length - 4) {
          // Read text (null-terminated, may be UTF-16)
          let text = '';
          const start = offset;
          if (encoding === 1 || encoding === 2) {
            // UTF-16: null-terminated with 2 bytes
            while (offset < bytes.length - 1 && !(bytes[offset] === 0 && bytes[offset+1] === 0)) offset += 2;
            const u16 = new Uint8Array(bytes.slice(start, offset));
            text = new TextDecoder(encoding === 2 ? 'utf-16be' : 'utf-16le').decode(u16);
            offset += 2; // skip null terminator (2 bytes)
          } else {
            // Latin1 or UTF-8: null-terminated with 1 byte
            while (offset < bytes.length && bytes[offset] !== 0) offset++;
            const u8 = new Uint8Array(bytes.slice(start, offset));
            text = new TextDecoder(encoding === 3 ? 'utf-8' : 'latin1').decode(u8);
            offset++; // skip null terminator
          }
          // Read timestamp (4 bytes big-endian, milliseconds if format=1)
          if (offset + 4 > bytes.length) break;
          const ts = (bytes[offset] << 24) | (bytes[offset+1] << 16) | (bytes[offset+2] << 8) | bytes[offset+3];
          offset += 4;
          // Convert milliseconds to [mm:ss.xx]
          const totalSec = ts / 1000;
          const m = Math.floor(totalSec / 60);
          const s = Math.floor(totalSec % 60);
          const cs = Math.floor((totalSec * 100) % 100);
          const stamp = '[' + String(m).padStart(2,'0') + ':' + String(s).padStart(2,'0') + '.' + String(cs).padStart(2,'0') + ']';
          lines.push(stamp + text);
        }
        return lines.length ? lines : null;
      } catch (e) {
        console.debug('[Aurora] SYLT parse falló:', e.message);
        return null;
      }
    },

    /* Normaliza cualquier texto de letras a un array de líneas.
     * - Si ya tiene timestamps LRC [mm:ss.xx], respeta el formato.
     * - Si es texto plano sin timestamps, lo deja como líneas sueltas
     *   (el reproductor las mostrará sin sincronización).
     * - Filtra metadata LRC irrelevante ([ar:], [ti:], etc.) solo si
     *   hay timestamps reales; si no, las mantiene como texto normal. */
    normalizeLyrics(text) {
      if (!text) return null;
      if (Array.isArray(text)) return text;
      // Normalizar saltos de línea
      const lines = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
      // Detectar si hay timestamps LRC reales
      const hasLrcStamps = lines.some(l => /^\s*\[\d+:\d+/.test(l));
      if (hasLrcStamps) {
        // Filtrar metadata LRC como [ar:Artist], [ti:Title], etc.
        // pero mantener líneas con timestamp [mm:ss.xx]
        return lines.filter(l => {
          const trimmed = l.trim();
          if (!trimmed) return true; // mantener líneas vacías para separación visual
          // Si es metadata LRC (no timestamp), filtrar
          if (/^\[(ar|ti|al|by|offset|length|re|ve|id):/i.test(trimmed)) return false;
          return true;
        });
      }
      // Texto plano: devolver líneas tal cual
      return lines;
    },

    /* ============================================================
     *  Parser ID3v2 propio para USLT/SYLT
     * ============================================================
     *  jsmediatags (CDN) no parsea USLT por defecto. Este método
     *  lee los primeros bytes del archivo, localiza el header ID3v2,
     *  itera sobre los frames y extrae USLT (y SYLT si existe).
     *  Soporta ID3v2.3 (4 bytes de tamaño sincronizado) y 2.4.
     * ============================================================ */
    async readLyricsFromId3v2(file) {
      // Leer los primeros 256KB deberían ser suficientes para los tags
      // (típicamente el header + frames caben en los primeros 10-100KB)
      const chunk = file.slice(0, Math.min(file.size, 512 * 1024));
      const buf = await this.readArrayBuffer(chunk);
      const view = new DataView(buf);
      const u8 = new Uint8Array(buf);

      // Verificar header ID3v2: 'I' 'D' '3'
      if (u8[0] !== 0x49 || u8[1] !== 0x44 || u8[2] !== 0x33) {
        return null;  // no es ID3v2
      }
      const majorVersion = u8[3];  // 3 = v2.3, 4 = v2.4
      // Tamaño del tag (synchsafe integer en v2.4, también en v2.3 según spec real)
      // synchsafe: cada byte usa solo 7 bits
      const tagSize = (u8[6] << 21) | (u8[7] << 14) | (u8[8] << 7) | u8[9];
      const headerSize = 10;
      const flags = u8[5];
      /*  el bit de unsync (0x80) se calculaba y nunca se
 * leía: fuera la variable muerta; flags sí se usa (0x40). */

      let offset = headerSize;
      const end = Math.min(headerSize + tagSize, u8.length);

      // Si hay extended header, saltarlo
      if (flags & 0x40) {
        if (offset + 4 > end) return null;
        let extSize;
        if (majorVersion === 4) {
          extSize = (u8[offset] << 21) | (u8[offset+1] << 14) | (u8[offset+2] << 7) | u8[offset+3];
        } else {
          extSize = (u8[offset] << 24) | (u8[offset+1] << 16) | (u8[offset+2] << 8) | u8[offset+3];
        }
        offset += extSize;
      }

      // Iterar frames
      while (offset + 10 <= end) {
        // ID del frame (4 bytes ASCII)
        const frameId = String.fromCharCode(u8[offset], u8[offset+1], u8[offset+2], u8[offset+3]);
        if (frameId.charCodeAt(0) === 0) break;  // padding

        // Tamaño del frame
        let frameSize;
        if (majorVersion === 4) {
          // synchsafe
          frameSize = (u8[offset+4] << 21) | (u8[offset+5] << 14) | (u8[offset+6] << 7) | u8[offset+7];
        } else {
          // v2.3: tamaño normal de 4 bytes big-endian
          frameSize = (u8[offset+4] << 24) | (u8[offset+5] << 16) | (u8[offset+6] << 8) | u8[offset+7];
        }
        /*  los flags del frame se leían en una variable que
 * nadie consultaba; el avance es fijo (10 bytes). */
        offset += 10;  // header del frame

        if (frameSize <= 0 || offset + frameSize > end) {
          break;
        }

        const frameData = u8.subarray(offset, offset + frameSize);

        // Procesar USLT (Unsynchronized Lyrics) - frame oficial
        if (frameId === 'USLT') {
          const text = this.parseUsltFrame(frameData, majorVersion);
          if (text) return text;
        }

        // Procesar SYLT (Synchronized Lyrics) - frame oficial
        if (frameId === 'SYLT') {
          const lines = this.parseSyltFrame(frameData);
          if (lines && lines.length) return lines.join('\n');
        }

        // Procesar TXXX (User-defined text) que contenga letras
        // Algunos codificadores (ffmpeg, iTunes) guardan letras como
        // TXXX con description="USLT", "lyrics", "LYRICS", "UNSYNCED LYRICS", etc.
        if (frameId === 'TXXX') {
          const txxx = this.parseTxxxFrame(frameData);
          if (txxx) {
            const desc = txxx.description.toLowerCase();
            if (desc === 'uslt' || desc === 'lyrics' || desc === 'unsynced lyrics' ||
                desc === 'unsynchronised lyrics' || desc === 'letra' || desc === 'letras') {
              if (txxx.value && txxx.value.trim().length > 0) {
                return txxx.value;
              }
            }
          }
        }

        offset += frameSize;
      }
      return null;
    },

    /* Parsea un frame TXXX (User-defined text).
     * Formato: [encoding(1)][description(null-term)][value(null-term)]
     * Devuelve { description, value } */
    parseTxxxFrame(data) {
      try {
        const encoding = data[0];
        let pos = 1;
        // Description (null-terminated según encoding)
        const descEnd = this.findNullTerminator(data, pos, encoding);
        const descBytes = data.subarray(pos, descEnd);
        const description = this.decodeText(descBytes, encoding);
        pos = descEnd + (encoding === 1 || encoding === 2 ? 2 : 1);
        // Value (resto del frame, null-terminated o hasta el final)
        const valueEnd = this.findNullTerminator(data, pos, encoding);
        const valueBytes = data.subarray(pos, valueEnd);
        const value = this.decodeText(valueBytes, encoding);
        return { description, value };
      } catch (e) {
        return null;
      }
    },

    /* Parsea un frame USLT.
     * Formato: [encoding(1)][language(3)][description(null-term)][lyrics(null-term)] */
    parseUsltFrame(data, id3Version) {
      try {
        const encoding = data[0];
        let pos = 1;
        // Language (3 bytes)
        pos += 3;
        // Description (null-terminated según encoding)
        const descEnd = this.findNullTerminator(data, pos, encoding);
        pos = descEnd + (encoding === 1 || encoding === 2 ? 2 : 1);
        // Lyrics text (resto del frame)
        const textBytes = data.subarray(pos);
        return this.decodeText(textBytes, encoding);
      } catch (e) {
        console.debug('[Aurora] USLT parse error:', e.message);
        return null;
      }
    },

    /* Parsea un frame SYLT.
     * Formato: [encoding(1)][language(3)][timestamp_format(1)][content_type(1)][descriptor(null-term)]
     * Luego repetido: [text(null-term)][timestamp(4 bytes BE)] */
    parseSyltFrame(data) {
      try {
        const encoding = data[0];
        const tsFormat = data[4];  // 1 = milliseconds
        // encoding(1) + language(3) + timestampFormat(1) + contentType(1) = 6
        // Antes empezaba en 5 (contentType), corrompiendo el descriptor si
        // contentType era 0 y desalineando el primer par texto/tiempo.
        let pos = 6;
        // Descriptor (null-terminated)
        const descEnd = this.findNullTerminator(data, pos, encoding);
        pos = descEnd + (encoding === 1 || encoding === 2 ? 2 : 1);

        const lines = [];
        while (pos < data.length - 4) {
          // Text (null-terminated)
          const textEnd = this.findNullTerminator(data, pos, encoding);
          const textBytes = data.subarray(pos, textEnd);
          const text = this.decodeText(textBytes, encoding);
          pos = textEnd + (encoding === 1 || encoding === 2 ? 2 : 1);
          // Timestamp (4 bytes big-endian)
          if (pos + 4 > data.length) break;
          const ts = (data[pos] << 24) | (data[pos+1] << 16) | (data[pos+2] << 8) | data[pos+3];
          pos += 4;
          // Convert to [mm:ss.xx]
          const totalSec = tsFormat === 1 ? ts / 1000 : ts / 1000;  // assume ms
          const m = Math.floor(totalSec / 60);
          const s = Math.floor(totalSec % 60);
          const cs = Math.floor((totalSec * 100) % 100);
          const stamp = '[' + String(m).padStart(2,'0') + ':' + String(s).padStart(2,'0') + '.' + String(cs).padStart(2,'0') + ']';
          lines.push(stamp + text);
        }
        return lines;
      } catch (e) {
        console.debug('[Aurora] SYLT parse error:', e.message);
        return null;
      }
    },

    /* Encuentra el terminador nulo según el encoding */
    findNullTerminator(data, start, encoding) {
      if (encoding === 1 || encoding === 2) {
        // UTF-16: par de bytes nulos
        for (let i = start; i < data.length - 1; i += 2) {
          if (data[i] === 0 && data[i+1] === 0) return i;
        }
      } else {
        // Latin1 / UTF-8: byte nulo
        for (let i = start; i < data.length; i++) {
          if (data[i] === 0) return i;
        }
      }
      return data.length;
    },

    /* Decodifica texto según encoding ID3
     * 0 = ISO-8859-1 (Latin1)
     * 1 = UTF-16 with BOM
     * 2 = UTF-16BE without BOM
     * 3 = UTF-8 */
    decodeText(bytes, encoding) {
      try {
        if (encoding === 0) return new TextDecoder('latin1').decode(bytes);
        if (encoding === 1) {
          // UTF-16 with BOM - detectar endianness
          if (bytes.length >= 2 && bytes[0] === 0xFF && bytes[1] === 0xFE) {
            return new TextDecoder('utf-16le').decode(bytes.subarray(2));
          }
          if (bytes.length >= 2 && bytes[0] === 0xFE && bytes[1] === 0xFF) {
            return new TextDecoder('utf-16be').decode(bytes.subarray(2));
          }
          return new TextDecoder('utf-16le').decode(bytes);
        }
        if (encoding === 2) return new TextDecoder('utf-16be').decode(bytes);
        if (encoding === 3) return new TextDecoder('utf-8').decode(bytes);
        return new TextDecoder('utf-8').decode(bytes);
      } catch (e) {
        // Fallback: tratar como latin1
        let s = '';
        for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
        return s;
      }
    },

    /* Lee un ArrayBuffer desde un File/Blob */
    readArrayBuffer(blob) {
      return new Promise((resolve, reject) => {
        const r = new FileReader();
        r.onload = () => resolve(r.result);
        r.onerror = reject;
        r.readAsArrayBuffer(blob);
      });
    }
  };

  window.AuroraUploader = Uploader;
})();
