/* =====================================================================
 *  js/library.js — Aurora Music Player
 *  Biblioteca: importar, borrar, estado vacío
 *
 *  Parte del refactor (C) de app.js: mismo código, módulos por funcionalidad.
 *  Este archivo se carga tras js/state.js y completa el objeto App con
 *  Object.assign (los scripts son clásicos por compatibilidad webxdc).
 * ===================================================================== */

'use strict';

Object.assign(App, {
    /* ============================================================
     *  Carga de archivos desde el almacenamiento local
     * ============================================================ */
    /* Procesa archivos de audio subidos.
     *   fileList       — FileList o array de File
     *   fromDirectory  — true si se cargó una carpeta entera
     *   targetPlaylistId — ID de playlist a la que añadir las nuevas pistas.
     *                     Si es null, las pistas van SOLO a la biblioteca
     *                     (ya no existe ninguna lista predefinida).
     */
    /* Enlaza archivos .lrc con su canción por nombre base
     * («Tema.lrc» ↔ «Tema.mp3», sin distinguir mayúsculas). Primero
     * busca entre las pistas recién importadas y luego en toda la
     * biblioteca, así también sirve soltar solo los .lrc de una
     * carpeta ya importada. Política: nunca pisa una letra que la
     * pista ya tenga (la de los metadatos o una cargada a mano manda);
     * para sustituirla está el botón de cargar letra de la vista de
     * Letras. Devuelve cuántas se enlazaron. */
    async _attachLrcFiles(lrcFiles, preferredTracks) {
      const baseOf = (name) => String(name || '').replace(/\.[^.]+$/, '').trim().toLowerCase();
      const byBase = new Map();
      const addToMap = (t) => {
        const b = baseOf(t && t.fileName);
        if (b && !byBase.has(b)) byBase.set(b, t);
      };
      (preferredTracks || []).forEach(addToMap);
      this.tracks.forEach(addToMap);
      let attached = 0;
      for (const f of lrcFiles) {
        const t = byBase.get(baseOf(f.name));
        if (!t) continue;
        if (Array.isArray(t.lrc) && t.lrc.length) continue;
        try {
          const text = await f.text();
          const clean = String(text || '').replace(/^﻿/, '');
          if (!clean.trim()) continue;
          const lines = clean.split(/\r?\n/).slice(0, 5000);
          if (!lines.some(l => l.trim())) continue;
          t.lrc = lines;
          t._lrcCache = null;
          this.persistTrack(t);
          attached++;
        } catch (e) { /* archivo ilegible: se salta sin romper la importación */ }
      }
      return attached;
    },

    async handleFileInput(fileList, fromDirectory, targetPlaylistId) {
      if (!fileList || !fileList.length) return;
      if (!window.AuroraUploader || typeof window.AuroraUploader.processFiles !== 'function') {
        this.toast(this.t('toast_load_module_missing'));
        console.error('[Aurora] window.AuroraUploader no está cargado. Revisa que uploader.js se cargue correctamente.');
        return;
      }
      // Dos importaciones simultáneas (arrastrar + selector, o doble toque)
      // mutaban `tracks` a la vez y duplicaban pistas. Una sola a la vez.
      if (this._importing) {
        //  la clave lleva una X por sustituir (nº de archivos).
        this.toast(this.t('toast_processing_files').replace('X', String(fileList.length)));
        return;
      }
      this._importing = true;
      // Los .lrc no son audio: se enlazan con la canción del mismo
      // nombre (ver _attachLrcFiles) en vez de ir al importador. (La
      // (La importación de listas .m3u no existe.)
      const allFiles = Array.from(fileList);
      const lrcFiles = allFiles.filter(f => /\.lrc$/i.test(f.name || ''));
      const mediaFiles = allFiles.filter(f => !/\.m3u8?$/i.test(f.name || '') && !/\.lrc$/i.test(f.name || ''));
      if (!mediaFiles.length) {
        this._importing = false;
        // Solo letras: se enlazan con canciones que ya estén en la
        // biblioteca (soltar los .lrc de una carpeta ya importada).
        if (lrcFiles.length) {
          const n = await this._attachLrcFiles(lrcFiles, []);
          this.toast(n > 0
            ? this.t('toast_lrc_attached').replace('X', String(n))
            : this.t('toast_lrc_none'));
        }
        return;
      }
      const count = mediaFiles.length;
      this._importCancelled = false;
      this.showImportOverlay(0, count, '');
      try {
        const newTracks = await window.AuroraUploader.processFiles(mediaFiles, {
          onProgress: (i, n, name) => this.updateImportOverlay(i, n, name),
          isCancelled: () => this._importCancelled
        });
        const cancelled = this._importCancelled;
        this.hideImportOverlay();
        if (!newTracks.length) {
          this.toast(cancelled ? this.t('toast_import_cancelled').replace('X', '0') : this.t('toast_load_failed'));
          return;
        }

        // #10 Detección de duplicados: comparar por fileName + fileSize.
        // Índice O(1) por clave para que importar 500 archivos no sea O(n²).
        let dupCount = 0;
        const uniqueTracks = [];
        const existingForPlaylist = [];
        const byKey = new Map();
        for (const ex of this.tracks) byKey.set(this._dupKey(ex.fileName, ex.fileSize), ex);
        for (const t of newTracks) {
          const existing = byKey.get(this._dupKey(t.fileName, t.fileSize)) || null;
          if (existing) {
            dupCount++;
            if (t.src && t.src.startsWith('blob:')) {
              URL.revokeObjectURL(t.src);
            }
            // Si se sube a una lista, reutilizar la pista de la biblioteca
            // (p. ej. se quitó de la lista y se vuelve a añadir el mismo archivo).
            existingForPlaylist.push(existing);
          } else {
            uniqueTracks.push(t);
            byKey.set(this._dupKey(t.fileName, t.fileSize), t);
          }
        }
        // Letras .lrc traídas junto al audio: se enlazan por nombre
        // antes de componer los avisos para contarlas en el mismo toast.
        let lrcAttached = 0;
        if (lrcFiles.length) {
          lrcAttached = await this._attachLrcFiles(lrcFiles, [...uniqueTracks, ...existingForPlaylist]);
        }
        const lrcSuffix = lrcAttached > 0
          ? ' · ' + this.t('toast_lrc_attached').replace('X', String(lrcAttached))
          : '';
        // Solo se añaden a una lista concreta cuando la importación se
        // lanza desde la pantalla de esa lista. Las subidas normales
        // (+ / Ajustes / menú) caen en «Mi Música», la lista automática
        // (ver la llamada a _ensureMiMusica más abajo).
        const destPlEarly = targetPlaylistId
          ? this.playlists.find(p => p.id === targetPlaylistId)
          : null;
        const destIdEarly = destPlEarly ? destPlEarly.id : null;
        let readded = 0;
        if (destPlEarly && existingForPlaylist.length) {
          existingForPlaylist.forEach(ex => {
            if (!destPlEarly.trackIds.includes(ex.id)) {
              destPlEarly.trackIds.push(ex.id);
              readded++;
            }
          });
          if (readded > 0) {
            if (typeof this._invalidatePlaylistCover === 'function') this._invalidatePlaylistCover(destPlEarly);
            this.persistPlaylist(destPlEarly);
          }
        }
        if (dupCount > 0 && readded === 0 && uniqueTracks.length === 0) {
          this.toast(dupCount + ' ' + this.t('toast_duplicate_found') + lrcSuffix);
        }
        if (uniqueTracks.length === 0) {
          if (readded > 0) {
            this.renderPlaylists();
            if (this._editingPlaylistId === destIdEarly) this.renderEditPlaylist();
            let msg = readded + ' ' + this.t('toast_added_to_playlist_plural') + ' ' + destPlEarly.name;
            msg += lrcSuffix;
            this.toast(msg);
          }
          // Sin lista destino y sin pistas nuevas (duplicadas):
          // también son «de fuera» y entran en Mi Música.
          if (!targetPlaylistId && existingForPlaylist.length &&
              typeof this._ensureMiMusica === 'function') {
            this._ensureMiMusica(existingForPlaylist.map(t => t.id));
            this.renderPlaylists();
          }
          return;
        }
        const tracksToAdd = uniqueTracks;

        // Añadir todas las pistas a memoria primero (rápido)
        const now = Date.now();
        for (const t of tracksToAdd) {
          t.addedAt = t.addedAt || now;
          this.tracks.push(t);
        }
        this.invalidateTrackIndex();

        // Guardar en IndexedDB en segundo plano para no bloquear la UI/reproducción
        this.persistTracksBatch(tracksToAdd).catch((e) => {
          console.warn('[Aurora] persistencia en segundo plano:', e);
        });

        /* Sin lista destino, las canciones «de fuera» entran en
         * «Mi Música» (se crea sola si es la primera vez), además de
         * vivir en Todas las canciones como siempre. Con lista destino
         * solo van a esa lista. */
        if (!targetPlaylistId && typeof this._ensureMiMusica === 'function') {
          this._ensureMiMusica([...tracksToAdd, ...existingForPlaylist].map(t => t.id));
        }

        // Lista destino opcional (solo si se importa desde una lista).
        const destPl = targetPlaylistId
          ? this.playlists.find(p => p.id === targetPlaylistId)
          : null;
        const destId = destPl ? destPl.id : null;
        if (destPl) {
          tracksToAdd.forEach(t => {
            if (!destPl.trackIds.includes(t.id)) destPl.trackIds.push(t.id);
          });
          if (typeof this._invalidatePlaylistCover === 'function') this._invalidatePlaylistCover(destPl);
          this.persistPlaylist(destPl);
        }

        // Si era el primer track, activarlo como pista actual y cargar el audio
        // (sin reproducir) para que al pulsar Play funcione inmediatamente.
        if (!this.currentTrack && this.tracks.length) {
          this.currentTrack = this.tracks[0];
          this.currentTrackIdx = 0;
          this.queue = this.tracks.map(t => t.id);
          this.queueIdx = 0;
          // Cargar el audio sin reproducir (loadTrackPaused setea audio.src)
          this.loadTrackPaused();
        } else if (!this.playContext || this.playContext.type === 'all') {
          // Solo añadir a la cola si NO hay un contexto de playlist/favoritos activo.
          tracksToAdd.forEach(t => {
            this.queue.push(t.id);
            if (this.shuffle && this._originalQueue) this._originalQueue.push(t.id);
          });
        }
        this.renderPlaylists();
        this.renderQueue();
        this.renderFavorites();
        if (typeof this.renderHome === 'function') this.renderHome();
        if (typeof this.updateChrome === 'function') this.updateChrome();
        // Si estábamos editando la playlist destino, refrescar la vista
        if (this._editingPlaylistId === destId) this.renderEditPlaylist();
        this.hideEmptyState();
        const folderSuffix = fromDirectory ? ' ' + this.t('folder_tag') : '';
        if (this._importCancelled) {
          this.toast(this.t('toast_import_cancelled').replace('X', String(tracksToAdd.length)) + lrcSuffix);
        } else {
          const destMsg = destPl
            ? this.t('toast_added_to_playlist_plural') + ' ' + destPl.name
            : this.t('toast_added_to_library');
          this.toast(tracksToAdd.length + ' ' + destMsg + folderSuffix + lrcSuffix);
        }
        // Con música ya dentro, se vuelve a pedir almacenamiento
        // persistente: algunos navegadores solo lo conceden tras
        // interacción real con la app, no en el primer arranque.
        try {
          if (navigator.storage && typeof navigator.storage.persist === 'function') {
            navigator.storage.persist().then((g) => { this._storagePersisted = !!g; }).catch(() => {});
          }
        } catch (e) {}
        // También al importar parcialmente (cancelado): el marcador debe
        // reflejar lo que realmente quedó guardado.
        this.syncLibCountMarker();
      } catch (e) {
        console.error('[Aurora] Error cargando archivos:', e);
        this._lastError = { msg: 'upload: ' + e.message, ts: Date.now() };
        this.toast(this.t('toast_load_error'));
      } finally {
        this._importing = false;
        this.hideImportOverlay();
      }
    },

    /* Libera todos los objectURL de audio (al cerrar la pestaña). */
    releaseAllUrls() {
      try {
        if (this._urlCache) {
          for (const url of this._urlCache.values()) {
            try { URL.revokeObjectURL(url); } catch (e) {}
          }
          this._urlCache.clear();
        }
        for (const t of (this.tracks || [])) {
          if (t && typeof t.src === 'string' && t.src.startsWith('blob:')) {
            try { URL.revokeObjectURL(t.src); } catch (e) {}
            t.src = null; // se reconstruye desde _file/fileBlob si vuelve
          }
        }
      } catch (e) {}
    },

    /* Clave de duplicado tolerante a mayúsculas/espacios del nombre. */
    _dupKey(fileName, fileSize) {
      return String(fileName || '').trim().toLowerCase() + '|' + (Number(fileSize) || 0);
    },

    showImportOverlay(done, total, name) {
      const el = document.getElementById('importOverlay');
      if (!el) return;
      el.hidden = false;
      this.updateImportOverlay(done, total, name);
      if (!this.tracks.length) this.showImportSkeleton();
    },
    updateImportOverlay(done, total, name) {
      const fill = document.getElementById('importBarFill');
      const count = document.getElementById('importCount');
      const file = document.getElementById('importFileName');
      const n = Math.max(1, total || 1);
      const pct = Math.max(0, Math.min(100, Math.round((done || 0) * 100 / n)));
      if (fill) fill.style.width = pct + '%';
      if (count) count.textContent = (done || 0) + ' / ' + (total || 0);
      if (file) file.textContent = name || '';
    },
    hideImportOverlay() {
      const el = document.getElementById('importOverlay');
      if (el) el.hidden = true;
      const fill = document.getElementById('importBarFill');
      if (fill) fill.style.width = '0%';
      this.hideImportSkeleton();
    },

    _skeletonRowHtml() {
      return '<li class="track-row is-skeleton" aria-hidden="true">' +
        '<div class="row-cover skel"></div>' +
        '<div class="row-text"><div class="skel skel-title"></div><div class="skel skel-sub"></div></div>' +
        '<div class="skel skel-dur"></div>' +
        '</li>';
    },
    showImportSkeleton() {
      if (this.tracks.length) return;
      const html = this._skeletonRowHtml() + this._skeletonRowHtml() + this._skeletonRowHtml();
      const home = document.getElementById('homeContent');
      const hv = document.getElementById('viewHome');
      if (home && hv && hv.classList.contains('is-empty')) {
        home.innerHTML = '<ul class="track-list import-skel" aria-hidden="true">' + html + '</ul>';
      }
    },
    hideImportSkeleton() {
      document.querySelectorAll('.track-row.is-skeleton').forEach(el => el.remove());
      const skelList = document.querySelector('.import-skel');
      if (skelList && !this.tracks.length && typeof this.renderHome === 'function') {
        this.renderHome();
      } else if (skelList) skelList.remove();
    },

    /* Sin findDuplicateTrack (quedó sin llamadores): la
     * deduplicación al importar usa su propio índice. */

    /* #15 #16 Obtener objectURL con cache para reutilizar */
    getTrackUrl(track) {
      if (!track) return null;
      if (this._urlCache.has(track.id)) {
        return this._urlCache.get(track.id);
      }
      //  un objectURL vive solo en su sesión. Los registros de
      // IndexedDB traían guardado el src de la sesión en que se
      // importaron/editaron, y al reabrir es una URL muerta: el
      // <audio> fallaba y el reproductor saltaba de canción en
      // canción avisando de que no se podía reproducir. Antes de
      // el arranque recreaba todas las URLs y lo enmascaraba;
      // ahora la URL se acuña aquí, siempre desde el blob. Solo se
      // respeta un src que NO sea blob: (p. ej. fuente http(s)).
      if (track.src && typeof track.src === 'string' && track.src.startsWith('blob:')) {
        try { URL.revokeObjectURL(track.src); } catch (e) {}
        track.src = null; // muerta: se reconstruye desde el blob
      }
      let url = null;
      if (track._file) {
        url = URL.createObjectURL(track._file);
        track.src = url;
      } else if (track.fileBlob) {
        url = URL.createObjectURL(track.fileBlob);
        track.src = url;
      } else if (track.src) {
        url = track.src;
      }
      if (url) this._urlCache.set(track.id, url);
      return url;
    },

    /* Precarga la siguiente pista en un <audio> NO conectado al grafo EQ. */
    preloadNextTrack() {
      if (!this._gaplessEnabled && !(this.crossfadeEnabled && this.crossfadeDuration > 0)) return;
      let nextIdx = this.queueIdx + 1;
      if (nextIdx >= this.queue.length) {
        if (this.repeat === 'all' && this.queue.length) nextIdx = 0;
        else return;
      }
      if (nextIdx === this.queueIdx) return;
      const nextTrackId = this.queue[nextIdx];
      const nextTrack = this.tracks.find(t => t.id === nextTrackId);
      if (!nextTrack) return;
      const url = this.getTrackUrl(nextTrack);
      if (!url) return;
      if (!this._preloadAudio) {
        this._preloadAudio = new Audio();
        this._preloadAudio.preload = 'auto';
      }
      if (this._preloadAudio.src !== url) {
        this._preloadAudio.src = url;
        this._preloadAudio.load();
      }
    },

    /* Gapless con EQ: mismo <audio> conectado; swap de src ~80 ms antes de ended. */
    gaplessNext() {
      if (!this._gaplessEnabled) return false;
      if (this._sleepEndOfTrack || this._sleepFading) return false;
      if (this.crossfadeEnabled && this.crossfadeDuration > 0) return false;
      if (this.repeat === 'one') return false;
      //  el avance gapless también pasa por la sincronización
      // con la lista (antes solo la hacía next()): si no, una baja
      // de la lista se colaba cuando el cambio era sin pausa.
      if (!this.shuffle && typeof this._syncQueueWithPlaylist === 'function') {
        this._syncQueueWithPlaylist();
      }
      const nextIdx = this._nextQueueIndex(true);
      if (nextIdx == null) return false;
      const nextTrackId = this.queue[nextIdx];
      const nextTrack = this.tracks.find(t => t.id === nextTrackId);
      if (!nextTrack) return false;
      const url = this.getTrackUrl(nextTrack);
      if (!url || !this.audio) return false;
      this._gaplessConsumed = true;
      this._ignoreEndedUntil = Date.now() + 500;
      this._gaplessArmed = false;
      // La saliente llegó a su fin (~80 ms antes del corte): su
      // escucha cuenta como completa ANTES de cambiar.
      if (typeof this.trackPlayCompleted === 'function') this.trackPlayCompleted();
      this.currentTrack = nextTrack;
      this.currentTrackIdx = this.tracks.findIndex(t => t.id === nextTrackId);
      this.queueIdx = nextIdx;
      this.audio.src = url;
      try { this.audio.volume = this.volume; } catch (e) {}
      if (typeof this.restoreLyricsPrefs === 'function') this.restoreLyricsPrefs();
      if (this.playbackRate && this.playbackRate !== 1) {
        try { this.audio.playbackRate = this.playbackRate; } catch (e) {}
      }
      if (typeof this.setBuffering === 'function') this.setBuffering(this.audio.readyState < 3);
      const p = this.audio.play();
      if (p && p.catch) p.catch(() => {});
      this.isPlaying = true;
      // La entrante no pasa por trackPlayStarted() (play() directo):
      // estrena pase de conteo y base de segundos escuchados.
      this._playCounted = false;
      this._currentPlayStart = Date.now();
      this._currentPlayBaseTime = 0;
      this.renderCurrentTrack();
      this.renderLyrics();
      this.updateMediaSession();
      this.updatePlayUI();
      this.preloadNextTrack();
      this.applyNormalization(nextTrack);
      if (typeof this.updateChrome === 'function') this.updateChrome();
      return true;
    },

    /* #6 Normalización de volumen: calcular gain para una pista */
    async computeTrackGain(track) {
      if (!track || this._trackGainCache.has(track.id)) {
        return this._trackGainCache.get(track.id) || 1.0;
      }
      try {
        if (!this.audioCtx) this.initAudioGraph();
        if (!this.audioCtx) return 1.0;
        const file = track._file || track.fileBlob;
        if (!file) return 1.0;
        // No decodificar archivos grandes: decodeAudioData reserva del orden
        // de 10x el tamaño en RAM y puede tumbar el WebView en móviles modestos.
        if (file.size && file.size > 15 * 1024 * 1024) return 1.0;
        const arrayBuffer = await file.arrayBuffer();
        const audioBuffer = await this.audioCtx.decodeAudioData(arrayBuffer);
        // Calcular RMS (root mean square) como medida de volumen
        const channelData = audioBuffer.getChannelData(0);
        let sum = 0;
        const step = Math.max(1, Math.floor(channelData.length / 100000)); // muestrear para velocidad
        let count = 0;
        for (let i = 0; i < channelData.length; i += step) {
          sum += channelData[i] * channelData[i];
          count++;
        }
        const rms = Math.sqrt(sum / count);
        // Solo subir pistas muy bajas. Nunca atenuar: el target 0.1
        // dejaba la música comercial a la mitad de volumen.
        const targetRms = 0.22;
        let gain = 1.0;
        if (rms > 0.001 && rms < targetRms) {
          gain = Math.min(1.8, targetRms / rms);
        }
        this._trackGainCache.set(track.id, gain);
        return gain;
      } catch (e) {
        return 1.0;
      }
    },

    /*  aquí vivían addToHistory/loadHistory/renderHistory:
 * el historial de reproducción (registro, carga y hoja) se
 * retiró entero. */

    async loadSearchHistory() {
      try {
        const stored = await window.AuroraStorage.getSetting('searchHistory');
        this._searchHistory = Array.isArray(stored) ? stored.slice(0, 8) : [];
      } catch (e) { this._searchHistory = []; }
    },

    pushSearchHistory(q) {
      q = String(q || '').trim();
      if (q.length < 2) return;
      const prev = Array.isArray(this._searchHistory) ? this._searchHistory : [];
      this._searchHistory = [q, ...prev.filter(x => x.toLowerCase() !== q.toLowerCase())].slice(0, 8);
      try { window.AuroraStorage.setSetting('searchHistory', this._searchHistory); } catch (e) {}
    },

    clearSearchHistory() {
      this._searchHistory = [];
      try { window.AuroraStorage.setSetting('searchHistory', []); } catch (e) {}
    },

    isPlaceholderAlbum(album) {
      if (!album) return true;
      const a = String(album).trim().toLowerCase();
      const set = new Set(['sin álbum', 'sin album', 'no album', 'unknown album', 'unknown']);
      const dict = window.I18N && window.I18N.no_album;
      if (dict) Object.keys(dict).forEach(k => { if (dict[k]) set.add(String(dict[k]).toLowerCase()); });
      return set.has(a);
    },

    isPlaceholderArtist(artist) {
      if (!artist) return true;
      const a = String(artist).trim().toLowerCase();
      const set = new Set(['artista desconocido', 'unknown artist']);
      const dict = window.I18N && window.I18N.unknown_artist;
      if (dict) Object.keys(dict).forEach(k => { if (dict[k]) set.add(String(dict[k]).toLowerCase()); });
      return set.has(a);
    },

    /*  ¿le falta algo a esta pista que solo se sepa releyendo
 * su archivo? La marca _tagsChecked la pone el importador (y
 * este propio retag) cuando la pista ya pasó por el lector
 * actual, género y año incluidos. Sin marca (bibliotecas
 * anteriores) hay que leerla UNA vez; con marca, releerla en
 * cada arranque era el cuello de botella: miles de lecturas
 * completas + sondeos + reescrituras de IndexedDB para no
 * cambiar nada. Ojo: que no tenga letra NO es motivo (la
 * mayoría de canciones no traen).: tampoco lo son la
 * falta de portada ni el artista placeholder — el archivo no
 * los trae y la condición nunca convergía. */
    _trackNeedsRetag(t) {
      if (!t || !(t._file || t.fileBlob)) return false;
      //  la marca es la única condición. Antes, una pista sin
      // portada en el archivo (o con el artista «desconocido» de
      // verdad) «necesitaba» retag en CADA arranque para siempre:
      // la relectura no puede inventar lo que el archivo no trae.
      return !t._tagsChecked;
    },

    /* Relee tags de pistas ya guardadas (portada, artista, letras).
 * opts.onlyIncomplete (arranque): solo las que lo necesitan
 *el menú «Releer etiquetas» sigue siendo completo.
 * Con tres trabajadores en paralelo, como la importación. */
    async retagExistingTracks(opts) {
      const silent = !!(opts && opts.silent);
      const onlyIncomplete = !!(opts && opts.onlyIncomplete);
      const U = window.AuroraUploader;
      if (!U || typeof U.processOne !== 'function') return 0;
      const targets = this.tracks.filter(t =>
        (t._file || t.fileBlob) && (!onlyIncomplete || this._trackNeedsRetag(t)));
      let updated = 0;
      let idx = 0;
      const worker = async () => {
        while (idx < targets.length) {
          const t = targets[idx++];
          const file = t._file || t.fileBlob;
          try {
            const fresh = await U.processOne(file, null);
            let changed = false;
            //  el texto que el usuario editó a mano (la hoja
            // de edición marca _userEdited) manda sobre el
            // archivo: releer etiquetas no debe deshacer su
            // corrección en el siguiente arranque.
            const userText = !!t._userEdited;
            if (!userText && fresh.title && fresh.title !== t.title) { t.title = fresh.title; changed = true; }
            if (!userText && fresh.artist && !this.isPlaceholderArtist(fresh.artist)) {
              if (t.artist !== fresh.artist) { t.artist = fresh.artist; changed = true; }
            }
            if (!userText && fresh.album && !this.isPlaceholderAlbum(fresh.album)) {
              if (t.album !== fresh.album) { t.album = fresh.album; changed = true; }
            }
            // La portada solo se toca si es otra de verdad: antes
            // se reemplazaba siempre y cada arranque reescribía
            // cada registro de IndexedDB con su blob.
            if (fresh.coverIsImage && fresh.cover && fresh.cover !== t.cover) {
              t.cover = fresh.cover;
              t.coverIsImage = true;
              changed = true;
            }
            //  género y año también se recuperan al re-etiquetar:
            // las bibliotecas anteriores no los guardaban y el
            // catálogo por géneros nacería vacío para ellas.
            if (fresh.genre && fresh.genre !== t.genre) { t.genre = fresh.genre; changed = true; }
            if (fresh.year && fresh.year !== t.year) { t.year = fresh.year; changed = true; }
            if (fresh.lrc && (!t.lrc || (Array.isArray(t.lrc) && !t.lrc.length))) {
              t.lrc = fresh.lrc;
              t._lrcCache = null;
              changed = true;
            }
            if (fresh.src && fresh.src.startsWith('blob:')) {
              try { URL.revokeObjectURL(fresh.src); } catch (e) {}
            }
            // Marcar revisada y guardar la marca aunque nada más
            // cambie: es lo que hace que el próximo arranque la salte.
            const hadFlag = !!t._tagsChecked;
            t._tagsChecked = true;
            if (changed) updated++;
            if (changed || !hadFlag) {
              try { await this.persistTrack(t); } catch (e) {}
            }
          } catch (e) {}
        }
      };
      const workers = [];
      for (let i = 0; i < Math.min(3, targets.length); i++) workers.push(worker());
      await Promise.all(workers);
      if (updated) {
        this.renderPlaylists();
        this.renderQueue();
        this.renderFavorites();
        if (typeof this.renderHome === 'function') this.renderHome();
        if (this.currentTrack) this.renderCurrentTrack();
      }
      if (!silent) {
        this.toast(updated
          ? this.t('toast_retag_done').replace('X', String(updated))
          : this.t('toast_retag_none'));
      }
      if (updated > 0 && typeof this._invalidateArtwork === 'function') this._invalidateArtwork();
      return updated;
    },

    /* Selector de archivos integrado de Delta Chat (webxdc.importFiles).
     * En Delta Chat nativo abre el selector del propio Delta, sin salir
     * al explorador del sistema. Contrato:
     *  - Array (aunque sea vacío): el selector nativo se usó; vacío =
     *    el usuario canceló y NO debe abrirse el <input> detrás.
     *  - null: la API no existe (navegador, stub o Delta antiguo) o
     *    falló; el llamador sigue con su <input type="file"> de siempre. */
    async pickFilesWebxdc(filter) {
      try {
        if (!window.webxdc || window.webxdc._isStub) return null;
        if (typeof window.webxdc.importFiles !== 'function') return null;
        const picked = await window.webxdc.importFiles(filter);
        return Array.from(picked || []);
      } catch (e) {
        return null;
      }
    },

    /* Utilidad para exportar archivos: usa webxdc.sendToChat en Delta
 * Chat o descarga directa en navegador. Devuelve 'chat' si salió
 * por sendToChat, 'download' si fue descarga local y false si
 * falló: los llamantes enseñan su toast según este resultado
 * (: antes ambos éxitos devolvían true y «Compartir» decía
 * «Enviado a Delta Chat» también cuando solo se descargaba). */
    async exportFile({ name, content, mimeType = 'application/json', caption = '' }) {
      if (window.webxdc && typeof window.webxdc.sendToChat === 'function') {
        /* La forma que Delta Chat acepta hoy es { name, blob }. El
 * plainText histórico puede ser rechazado por clientes
 * actuales, y el fallo se tragaba aquí dentro: «Compartir
 * lista» enseñaba «compartida» sin enviar nada. */
        const blob = content instanceof Blob ? content : new Blob([content], { type: mimeType });
        try {
          await window.webxdc.sendToChat({
            file: { name, blob },
            text: caption || name
          });
          return 'chat';
        } catch (err) {
          console.warn('[WebXDC] sendToChat no completado:', err);
          // La spec: ante un error, la promesa se rechaza. Devolvemos
          // false y el llamante avisa de verdad (antes el fallo se
          // tragaba y se enseñaba el toast de éxito igualmente,).
          return false;
        }
      }
      // Fallback para navegador web estándar
      const blob = content instanceof Blob ? content : new Blob([content], { type: mimeType });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = name;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      return 'download';
    },

    /* Toast honesto tras exportFile: enviado al chat, descargado o
 * error, según el tri-estado ([2]). */
    toastExportResult(res) {
      if (res === 'chat') this.toast(this.t('toast_shared_chat'));
      else if (res === 'download') this.toast(this.t('toast_downloaded'));
      else this.toast(this.t('toast_share_error'), 'danger');
    },

    /* Compartir pista (audio o metadatos) en Delta Chat o descargar en navegador */
    async shareTrack(trackId) {
      const id = trackId || (this.currentTrack && this.currentTrack.id);
      if (!id) return;
      const t = this.tracks.find(x => x.id === id) || (this.currentTrack && this.currentTrack.id === id ? this.currentTrack : null);
      if (!t) return;
      this.closeSheet('sheetTrackMenu');
      this.closeSheet('sheetMore');
      this.toast(this.t('toast_preparing_share'));

      try {
        let blob = null;
        if (t._file instanceof Blob) {
          blob = t._file;
        } else if (t.fileBlob instanceof Blob) {
          blob = t.fileBlob;
        } else if (window.AuroraStorage) {
          try {
            const stored = await window.AuroraStorage.getTrack(t.id);
            if (stored && stored.fileBlob instanceof Blob) {
              blob = stored.fileBlob;
            }
          } catch (e) {}
        }

        if (!blob) {
          //  t.src ya no nace al arrancar; se crea bajo demanda.
          const lazyUrl = typeof this.getTrackUrl === 'function' ? this.getTrackUrl(t) : t.src;
          if (lazyUrl && lazyUrl.startsWith('blob:')) {
            try {
              const res = await fetch(lazyUrl);
              blob = await res.blob();
            } catch (e) {}
          }
        }

        const safeTitle = (t.title || 'cancion').replace(/[\\/:*?"<>|]/g, '_');
        const safeArtist = (t.artist || '').replace(/[\\/:*?"<>|]/g, '_');
        let ext = 'mp3';
        if (t.fileName && t.fileName.includes('.')) {
          ext = t.fileName.split('.').pop().toLowerCase();
        }
        const fileName = safeArtist ? `${safeArtist} - ${safeTitle}.${ext}` : `${safeTitle}.${ext}`;
        const caption = `🎵 ${t.title || this.t('unknown_track')} · ${t.artist || this.t('unknown_artist')}`;

        if (blob) {
          const ok = await this.exportFile({
            name: fileName,
            content: blob,
            mimeType: blob.type || 'audio/mpeg',
            caption
          });
          this.toastExportResult(ok);
        } else {
          // Si no hay archivo de audio accesible, enviar metadatos y letra
          const txt = `${caption}\n` +
            (t.album ? `Álbum: ${t.album}\n` : '') +
            (t.duration ? `Duración: ${this.fmtTime(t.duration)}\n` : '') +
            (t.lrc && t.lrc.length ? `\n--- Letra ---\n${t.lrc.join('\n')}` : '');
          const ok = await this.exportFile({
            name: `${safeTitle}.txt`,
            content: txt,
            mimeType: 'text/plain;charset=utf-8',
            caption
          });
          this.toastExportResult(ok);
        }
      } catch (err) {
        console.error('[Aurora] error shareTrack:', err);
        this.toast(this.t('toast_share_error'));
      }
    },

    /* Solo acepta data:image raster en base64; bloquea svg (puede ejecutar
     * scripts si se usa como CSS), comillas y tamaños absurdos. */
    _safeImageDataUrl(v) {
      if (typeof v !== 'string' || v.length > 2 * 1024 * 1024) return false;
      return /^data:image\/(png|jpeg|jpg|webp|gif);base64,[A-Za-z0-9+/=]+$/.test(v);
    },

    /* Persiste múltiples pistas en una sola transacción de IndexedDB.
     * Mucho más rápido que llamar persistTrack() N veces secuencialmente. */
    async persistTracksBatch(tracks) {
      try {
        await window.AuroraStorage.open();
        const db = window.AuroraStorage.db;
        if (!db) {
          // Fallback: persistir una por una
          for (const t of tracks) await this.persistTrack(t);
          return;
        }
        const tx = db.transaction('tracks', 'readwrite');
        const store = tx.objectStore('tracks');
        const promises = [];
        for (const track of tracks) {
          const toSave = Object.assign({}, track);
          //  el objectURL es de sesión; si se persiste, al
          // reabrir es una URL muerta y el reproductor salta de
          // canción en canción sin poder reproducir ninguna.
          delete toSave.src;
          //  campos de trabajo de sesión fuera (ver
          // persistTrack): _lrcCache duplicaba la letra guardada.
          delete toSave._lrcCache;
          delete toSave._lrcCacheKey;
          delete toSave._thumbsHiRes;
          delete toSave._thumbing;
          delete toSave._thumbsDirty;
          if (track._file) {
            toSave.fileBlob = track._file;
            delete toSave._file;
          }
          promises.push(new Promise((resolve, reject) => {
            const req = store.put(toSave);
            req.onsuccess = resolve;
            req.onerror = () => reject(req.error);
          }));
        }
        await Promise.all(promises);
        // Esperar a que la transacción se complete
        await new Promise((resolve, reject) => {
          tx.oncomplete = resolve;
          tx.onerror = () => reject(tx.error);
          tx.onabort = () => reject(tx.error);
        });
      } catch (e) {
        console.warn('[Aurora] persistTracksBatch falló, intentando uno por uno:', e);
        if (this._isQuotaError(e)) {
          this.toast(this.t('toast_storage_full'));
          this.offerFreeStorage();
          return;
        }
        for (const t of tracks) await this.persistTrack(t);
      }
    },

    /* Guarda en localStorage cuántas pistas tiene la biblioteca.
     * Sirve para detectar pérdida de datos: si al arrancar hay 0 pistas
     * pero el marcador dice N > 0, el almacenamiento se borró fuera de
     * la app (o se abrió otra copia) y se avisa en vez de callar. */
    syncLibCountMarker() {
      try {
        if (this.tracks.length > 0) {
          localStorage.setItem('aurora_lib_count', String(this.tracks.length));
        } else {
          localStorage.removeItem('aurora_lib_count');
        }
      } catch (e) {}
    },

    async deleteTrack(trackId, opts) {
      opts = opts || {};
      const idx = this.tracks.findIndex(t => t.id === trackId);
      if (idx < 0) return;
      const wasCurrent = this.currentTrack && this.currentTrack.id === trackId;
      const t = this.tracks[idx];
      const cachedUrl = this._urlCache.get(trackId) || null;
      // El borrado de una pista se puede deshacer durante 8 s: mientras
      // tanto NO se revoca el objectURL ni se toca IndexedDB. Así el audio
      // sigue disponible si el usuario pulsa «Deshacer». Al vencer el
      // plazo (o al borrar otra pista) se confirma el borrado real.
      const canUndo = opts.undo !== false;
      if (canUndo) {
        // Si había otro borrado pendiente, confirmarlo antes de abrir uno
        // nuevo: solo se puede deshacer el último.
        if (typeof this._commitPendingTrackDelete === 'function') this._commitPendingTrackDelete();
        this._pendingTrackDelete = {
          track: t,
          idx,
          wasCurrent,
          cachedUrl,
          favorite: this.favorites.has(trackId),
          playlistIds: this.playlists.filter(pl => pl.trackIds.indexOf(trackId) >= 0).map(pl => pl.id),
          //  posición en la cola (y en la original si hay
          // aleatorio) para que «Deshacer» la devuelva también ahí.
          queuePos: this.queue ? this.queue.indexOf(trackId) : -1,
          origPos: Array.isArray(this._originalQueue) ? this._originalQueue.indexOf(trackId) : -1,
          timer: null
        };
      } else {
        // Borrado definitivo (lote, «borrar todo»): liberar ya.
        if (cachedUrl) {
          try { URL.revokeObjectURL(cachedUrl); } catch (e) {}
          this._urlCache.delete(trackId);
        }
        if (t.src && t.src.startsWith('blob:') && t.src !== cachedUrl) {
          try { URL.revokeObjectURL(t.src); } catch (e) {}
        }
        this.deleteTrackFromStorage(trackId);
        this._purgeTrackTraces(trackId); //  borrado sin deshacer
      }
      // Limpiar también la cache de ganancia normalizada (#6)
      this._trackGainCache.delete(trackId);
      if (typeof this._invalidateArtwork === 'function') this._invalidateArtwork(trackId);
      this.tracks.splice(idx, 1);
      this.invalidateTrackIndex();
      this.syncLibCountMarker();
      // Quitar de la cola
      const qIdx = this.queue.indexOf(trackId);
      if (qIdx >= 0) {
        this.queue.splice(qIdx, 1);
        if (qIdx < this.queueIdx) this.queueIdx--;
        else if (qIdx === this.queueIdx) this.queueIdx = Math.min(this.queueIdx, this.queue.length - 1);
      }
      if (typeof this._removeFromOriginalQueue === 'function') this._removeFromOriginalQueue(trackId);
      // Quitar de playlists.: persistPlaylist va DENTRO del
      // if — antes se guardaban en IndexedDB todas las listas de
      // la app por cada pista borrada, contuviera o no la pista.
      this.playlists.forEach(pl => {
        const i = pl.trackIds.indexOf(trackId);
        if (i >= 0) {
          pl.trackIds.splice(i, 1);
          if (typeof this._invalidatePlaylistCover === 'function') this._invalidatePlaylistCover(pl);
          this.persistPlaylist(pl);
        }
      });
      // Quitar de favoritos
      this.favorites.delete(trackId);
      this.saveFavorites();

      if (wasCurrent) {
        // Detener la reproducción de la pista eliminada
        this.stopPlayback();
        // Saltar a siguiente/anterior en modo pausa, o quedar vacío
        this.skipToNextOrPrevPaused();
      }
      this.renderPlaylists();
      this.renderQueue();
      this.renderFavorites();
      if (typeof this.renderHome === 'function') this.renderHome();
      if (typeof this.updateChrome === 'function') this.updateChrome();
      if (canUndo) {
        const pending = this._pendingTrackDelete;
        pending.timer = setTimeout(() => this._commitPendingTrackDelete(pending), 8000);
        this.toast(this.t('toast_track_deleted'), {
          danger: true,
          ms: 8000,
          action: { label: this.t('undo'), onClick: () => this._undoDeleteTrack(pending) }
        });
      } else {
        this.toast(this.t('toast_track_deleted'), 'danger');
      }
    },

    /*  al confirmar un borrado se purgan también sus
 * huellas: contadores de estadísticas e historial quedaban
 * huérfanos para siempre (y «las más escuchadas» sumaban
 * fantasmas). Con «Deshacer» aún posible NO se toca nada. */
    _purgeTrackTraces(trackId) {
      if (this.stats) {
        let dirty = false;
        if (this.stats.plays && trackId in this.stats.plays) { delete this.stats.plays[trackId]; dirty = true; }
        if (this.stats.skips && trackId in this.stats.skips) { delete this.stats.skips[trackId]; dirty = true; }
        if (dirty && typeof this.saveStats === 'function') this.saveStats();
      }
    },

    /* Confirma (irreversible) el borrado pendiente de una pista. */
    _commitPendingTrackDelete(pending) {
      const p = pending || this._pendingTrackDelete;
      if (!p || p.committed) return;
      // Marca definitiva: si el usuario pulsa «Deshacer» después de que
      // venza el plazo, no se resucita una pista ya borrada de IndexedDB.
      p.committed = true;
      clearTimeout(p.timer);
      if (this._pendingTrackDelete === p) this._pendingTrackDelete = null;
      try { if (p.cachedUrl) URL.revokeObjectURL(p.cachedUrl); } catch (e) {}
      try {
        if (p.track && p.track.src && p.track.src.startsWith('blob:') && p.track.src !== p.cachedUrl) {
          URL.revokeObjectURL(p.track.src);
        }
      } catch (e) {}
      this._urlCache.delete(p.track.id);
      this.deleteTrackFromStorage(p.track.id);
      this._purgeTrackTraces(p.track.id);
    },

    /* Deshace el borrado: devuelve la pista a la biblioteca, a sus listas
     * y a favoritos, en la misma posición que ocupaba. */
    _undoDeleteTrack(pending) {
      const p = pending || this._pendingTrackDelete;
      if (!p || !p.track || p.committed) return;
      // Si hay otro borrado pendiente distinto, este ya se confirmó.
      if (this._pendingTrackDelete && this._pendingTrackDelete !== p) return;
      clearTimeout(p.timer);
      if (this._pendingTrackDelete === p) this._pendingTrackDelete = null;
      const t = p.track;
      const at = Math.max(0, Math.min(p.idx, this.tracks.length));
      this.tracks.splice(at, 0, t);
      this.invalidateTrackIndex();
      this.syncLibCountMarker();
      p.playlistIds.forEach(plId => {
        const pl = this.playlists.find(x => x.id === plId);
        if (pl && pl.trackIds.indexOf(t.id) < 0) {
          pl.trackIds.push(t.id);
          if (typeof this._invalidatePlaylistCover === 'function') this._invalidatePlaylistCover(pl);
          this.persistPlaylist(pl);
        }
      });
      if (p.favorite) {
        this.favorites.add(t.id);
        this.saveFavorites();
      }
      //  …y a la cola, en su posición: antes el «Deshacer»
      // devolvía la canción a la biblioteca y a sus listas,
      // pero la cola la perdía para siempre.
      if (p.queuePos >= 0 && Array.isArray(this.queue) && this.queue.indexOf(t.id) < 0) {
        const atQ = Math.min(p.queuePos, this.queue.length);
        this.queue.splice(atQ, 0, t.id);
        if (atQ <= this.queueIdx) this.queueIdx++;
      }
      if (p.origPos >= 0 && Array.isArray(this._originalQueue) && this._originalQueue.indexOf(t.id) < 0) {
        this._originalQueue.splice(Math.min(p.origPos, this._originalQueue.length), 0, t.id);
      }
      if (this.currentTrack && this.currentTrack.id === t.id) this.updateFavoriteUI();
      this.renderPlaylists();
      this.renderQueue();
      this.renderFavorites();
      if (typeof this.renderHome === 'function') this.renderHome();
      if (typeof this.updateChrome === 'function') this.updateChrome();
      this.toast(this.t('toast_restored'));
    },

    /* ============================================================
     *  Borrar TODAS las pistas de la biblioteca
     * ============================================================ */
    async deleteAllTracks() {
      if (this.tracks.length === 0) {
        this.toast(this.t('no_tracks_loaded'));
        return;
      }
      const okAll = await this.showConfirm({
        message: this.t('delete_all_confirm'),
        okLabel: this.t('confirm_delete')
      });
      if (!okAll) return;
      // Un borrado individual pendiente de deshacer quedaría vivo después
      // de vaciar la biblioteca: confirmarlo antes de borrar todo.
      if (typeof this._commitPendingTrackDelete === 'function') this._commitPendingTrackDelete();

      // 1. Detener reproducción si la hay
      if (this.isPlaying) this.stopPlayback();

      // 2. Liberar todas las objectURLs de la memoria
      for (const t of this.tracks) {
        if (t.src && t.src.startsWith('blob:')) {
          try { URL.revokeObjectURL(t.src); } catch (e) {}
        }
      }
      // ...incluidas las que estén en la cache #15 y la de ganancias #6
      for (const url of this._urlCache.values()) {
        try { URL.revokeObjectURL(url); } catch (e) {}
      }
      this._urlCache.clear();
      this._trackGainCache.clear();

      // 3. Vaciar estado en memoria
      this.tracks = [];
      this.invalidateTrackIndex();
      this.syncLibCountMarker();
      this.queue = [];
      this.queueIdx = 0;
      this._originalQueue = null;
      this.currentTrackIdx = 0;
      this.currentTrack = null;
      this.favorites = new Set();
      this.saveFavorites();

      // 4. Quitar trackIds de todas las playlists (sin borrar las listas)
      this.playlists.forEach(pl => {
        pl.trackIds = [];
        if (typeof this._invalidatePlaylistCover === 'function') this._invalidatePlaylistCover(pl);
        this.persistPlaylist(pl);
      });

      // 5. Limpiar audio
      try {
        if (this.audio) {
          this.audio.pause();
          this.audio.removeAttribute('src');
          try { this.audio.load(); } catch (e) {}
        }
      } catch (e) {}

      // 6. Vaciar IndexedDB (tracks)
      try {
        if (window.AuroraStorage && typeof window.AuroraStorage.clearTracks === 'function') {
          await window.AuroraStorage.clearTracks();
        }
      } catch (e) {
        console.warn('[Aurora] No se pudo vaciar IndexedDB:', e);
      }

      // 7. Reset de sesión guardada
      try {
        if (window.AuroraStorage) await window.AuroraStorage.setSetting('session', null);
      } catch (e) {}

      // 8. Re-renderizar todo y mostrar estado vacío
      this.showEmptyState();
      this.renderCurrentTrack();
      this.renderPlaylists();
      this.renderQueue();
      this.renderFavorites();
      if (typeof this.renderHome === 'function') this.renderHome();
      if (typeof this.goNav === 'function') this.goNav('home');
      else if (typeof this.updateChrome === 'function') this.updateChrome();
      this.toast(this.t('toast_all_deleted'), 'danger');
    },

    /* ============================================================
     *  Estado vacío
     * ============================================================ */
    showEmptyState() {
      const v = document.getElementById('viewPlayer');
      if (!v) return;
      let empty = document.getElementById('emptyState');
      if (!empty) {
        empty = document.createElement('div');
        empty.id = 'emptyState';
        empty.className = 'empty-state';
        v.appendChild(empty);
      }
      // Construcción con DOM + textContent: los textos traducidos nunca se
      // interpretan como HTML (una traducción no debe poder inyectar nodos).
      empty.textContent = '';
      const icon = document.createElement('div');
      icon.className = 'empty-icon';
      icon.innerHTML = '<svg class="ico" aria-hidden="true"><use href="#i-music"></use></svg>';
      const h2 = document.createElement('h2');
      h2.textContent = this.t('empty_library_title');
      const p = document.createElement('p');
      p.textContent = this.t('empty_library_hint');
      const btn = document.createElement('button');
      btn.className = 'primary-btn empty-cta';
      btn.id = 'btnEmptyLoad';
      btn.type = 'button';
      btn.innerHTML = '<svg class="ico" style="margin-right:8px" aria-hidden="true"><use href="#i-cloud-arrow-up"></use></svg><span></span>';
      btn.querySelector('span').textContent = this.t('load_music');
      btn.addEventListener('click', () => this.openFilePicker());
      const hint = document.createElement('p');
      hint.className = 'empty-hint';
      hint.textContent = this.t('empty_format_hint');
      empty.append(icon, h2, p, btn, hint);
      empty.style.display = 'flex';
      // Ocultar secciones habituales (esta lista debe coincidir con la de
      // hideEmptyState; antes .np-volume quedaba oculto para siempre).
      ['.cover-section','.visualizer','.track-info','.progress-section','.np-volume','.controls-main','.controls-secondary']
        .forEach(sel => { const e = v.querySelector(sel); if (e) e.style.display = 'none'; });
    },

    hideEmptyState() {
      const empty = document.getElementById('emptyState');
      if (empty) empty.style.display = 'none';
      const v = document.getElementById('viewPlayer');
      if (v) {
        ['.cover-section','.visualizer','.track-info','.progress-section','.np-volume','.controls-main','.controls-secondary']
          .forEach(sel => { const e = v.querySelector(sel); if (e) e.style.display = ''; });
      }
    },
    /* ============================================================
 * /: canciones duplicadas (mismo título y artista)
 * La importación ya omite el mismo archivo dos veces; lo que
 * aquí se busca es la misma canción llegada por caminos
 * distintos (otro archivo, otra copia). Qué copia se conserva
 * lo elige el usuario en la hoja: por defecto se propone
 * la más antigua (la «original»: es la que suele tener
 * estrellas, listas y reproducciones), pero puede marcarse
 * cualquier otra como «la que se conserva» y borrar el resto
 * una a una o todas de una vez.
 * ============================================================ */
    findDuplicateGroups() {
      const norm = (v) => (typeof this.cleanSearchStr === 'function')
        ? this.cleanSearchStr(v || '')
        : String(v || '').trim().toLowerCase();
      const map = new Map();
      this.tracks.forEach(t => {
        const key = norm(t.title) + '\u0000' + norm(t.artist);
        if (!key.trim()) return;
        if (!map.has(key)) map.set(key, []);
        map.get(key).push(t);
      });
      const groups = [];
      map.forEach((list, key) => {
        if (list.length < 2) return;
        const sorted = list.slice().sort((a, b) => (a.addedAt || 0) - (b.addedAt || 0));
        //  «keep» es solo el valor por defecto (la más antigua);
        // la copia que se conserva la elige el usuario en la hoja.
        groups.push({ key, keep: sorted[0], dups: sorted.slice(1) });
      });
      return groups.sort((a, b) => String(a.keep.title || '').localeCompare(String(b.keep.title || '')));
    },

    renderDuplicates() {
      const cont = document.getElementById('duplicatesContent');
      if (!cont) return;
      const groups = this.findDuplicateGroups();
      cont.innerHTML = '';
      if (!groups.length) {
        const div = document.createElement('div');
        div.className = 'empty-state compact';
        div.innerHTML = this.emptyStateHtml({ icon: 'check', title: this.t('duplicates_none') });
        cont.appendChild(div);
        return;
      }
      //  qué copia se conserva lo elige el usuario, no la
      // antigüedad. La elección vive por grupo (clave título+artista)
      // y sobrevive a los repintados de la hoja; si la elegida ya no
      // está en el grupo, se vuelve al valor por defecto (la más
      // antigua, g.keep). Antes la «original» era intocable y solo
      // se podían borrar las demás: imposible quedarse con una
      // copia mejor (p. ej. un FLAC en vez del MP3 viejo).
      if (!(this._dupKeepSel instanceof Map)) this._dupKeepSel = new Map();
      const sel = this._dupKeepSel;
      const refresh = () => {
        this.renderDuplicates();
        if (typeof this.renderLibrarySections === 'function') this.renderLibrarySections();
      };
      groups.forEach(g => {
        const all = [g.keep].concat(g.dups);
        const chosenId = sel.get(g.key);
        const keeper = all.find(t => t.id === chosenId) || g.keep;
        const others = all.filter(t => t.id !== keeper.id);
        const box = document.createElement('div');
        box.className = 'dup-group';
        const title = document.createElement('p');
        title.className = 'dup-group-title';
        title.textContent = keeper.title + ' · ' + keeper.artist;
        box.appendChild(title);
        const row = (t, isKeep) => {
          const div = document.createElement('div');
          div.className = 'dup-row' + (isKeep ? ' is-keep' : '');
          div.dataset.trackId = t.id;
          // Nombre + duración + tamaño: lo que se necesita para
          // decidir qué copia vale más (calidad ≈ tamaño).
          div.innerHTML = '<div class="row-cover"><canvas width="144" height="144"></canvas></div>' +
            '<div class="row-text"><div class="row-title">' + this.esc(t.title) + '</div>' +
            '<div class="row-sub">' + this.esc(t.fileName || '') +
            (t.duration ? ' · ' + this.fmtTime(t.duration) : '') +
            (t.fileSize && typeof this.fmtBytes === 'function' ? ' · ' + this.fmtBytes(t.fileSize) : '') +
            '</div></div>' +
            (isKeep ? '<span class="dup-keep">' + this.esc(this.t('duplicates_keep')) + '</span>' : '');
          if (!isKeep) {
            // «Conservar esta»: la insignia (y la protección) se
            // mueve a esta copia; la anterior pasa a ser borrable.
            const keepBtn = document.createElement('button');
            keepBtn.type = 'button';
            keepBtn.className = 'dup-keep-btn';
            keepBtn.textContent = this.t('duplicates_keep_this');
            keepBtn.addEventListener('click', () => {
              sel.set(g.key, t.id);
              this.renderDuplicates();
            });
            div.appendChild(keepBtn);
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'row-action';
            btn.setAttribute('aria-label', this.t('confirm_delete'));
            btn.innerHTML = '<svg class="ico" aria-hidden="true"><use href="#i-trash-can"></use></svg>';
            btn.addEventListener('click', async () => {
              await this.deleteTrack(t.id);
              refresh();
            });
            div.appendChild(btn);
          }
          const cv = div.querySelector('canvas');
          if (cv) this.drawRowCover(cv, t);
          return div;
        };
        box.appendChild(row(keeper, true));
        others.forEach(t => box.appendChild(row(t, false)));
        // Borrado del grupo de una vez: se conserva la elegida y
        // caen las demás. Con confirmación y sin «Deshacer»
        // individual (es un lote deliberado, como «borrar todo»).
        if (others.length) {
          const delBtn = document.createElement('button');
          delBtn.type = 'button';
          delBtn.className = 'dup-del-others';
          delBtn.textContent = this.t('duplicates_delete_others') + ' (' + others.length + ')';
          delBtn.addEventListener('click', async () => {
            const ok = await this.showConfirm({
              message: this.t('duplicates_confirm').replace('X', String(others.length)),
              okLabel: this.t('confirm_delete'),
              danger: true
            });
            if (!ok) return;
            for (const t of others) await this.deleteTrack(t.id, { undo: false });
            refresh();
          });
          box.appendChild(delBtn);
        }
        cont.appendChild(box);
      });
    },

    openDuplicates() {
      this.renderDuplicates();
      this.openSheet('sheetDuplicates');
    },

});
