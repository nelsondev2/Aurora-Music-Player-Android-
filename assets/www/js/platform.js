/* =====================================================================
 *  js/platform.js — Aurora Music Player
 *  Puente con la app Android (WebView) y adaptación al contenedor.
 *
 *  Además de compartir archivos, este módulo alimenta la reproducción en
 *  segundo plano: cada cambio de pista o de play/pausa viaja a
 *  window.AuroraMedia (AuroraMediaBridge.java → PlaybackService), que
 *  mantiene viva la app, publica la notificación con controles y pide el
 *  foco de audio. Los botones de la notificación, de la pantalla de
 *  bloqueo y de los auriculares vuelven por window.AuroraMediaCommand.
 *
 *  La app nativa inyecta el objeto `AuroraAndroid` (ver
 *  src/com/nelsondev2/aurora/AuroraBridge.java) con cuatro métodos:
 *
 *    beginFile(name, mime)  → bool  abre un archivo temporal en caché
 *    appendChunk(base64)    → bool  añade un trozo (en orden)
 *    endFile()              → bool  cierra el archivo
 *    share(name, mime)      → bool  abre el selector «Compartir» de Android
 *
 *  En navegador no existe: todo cae a la descarga clásica del <a download>.
 * ===================================================================== */

'use strict';

/* Tamaño de trozo al cruzar un Blob al lado nativo. 512 KB de bytes se
 * convierten en ~683 KB de base64: suficiente para no encadenar miles de
 * llamadas y pequeño como para no reventar la memoria con un FLAC largo. */
const NATIVE_CHUNK = 512 * 1024;

/* Lee un Blob como base64 SIN el prefijo «data:...;base64,». */
function readChunkAsBase64(blob) {
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => {
      const s = String(fr.result || '');
      const comma = s.indexOf(',');
      resolve(comma >= 0 ? s.slice(comma + 1) : '');
    };
    fr.onerror = () => reject(fr.error || new Error('FileReader'));
    fr.readAsDataURL(blob);
  });
}

const AuroraPlatform = {
  /* ¿Estamos dentro de la app Android? Se comprueban los métodos que
   * inyecta AuroraBridge.java: en navegador no existe ninguno. */
  get isNative() {
    const B = window.AuroraAndroid;
    return !!(B && typeof B.beginFile === 'function' &&
      typeof B.appendChunk === 'function' && typeof B.endFile === 'function' &&
      typeof B.share === 'function');
  },

  /* Comparte un archivo con el selector del sistema.
   * Devuelve 'shared' si salió, false si falló y null si no hay app
   * nativa (el llamador decide: descarga en navegador). */
  async shareFile(name, blob, mimeType) {
    if (!this.isNative) return null;
    const B = window.AuroraAndroid;
    const mime = mimeType || 'application/octet-stream';
    try {
      if (!B.beginFile(name, mime)) return false;
      for (let off = 0; off < blob.size; off += NATIVE_CHUNK) {
        const part = blob.slice(off, Math.min(off + NATIVE_CHUNK, blob.size));
        const b64 = await readChunkAsBase64(part);
        if (!B.appendChunk(b64)) return false;
      }
      if (!B.endFile()) return false;
      return B.share(name, mime) ? 'shared' : false;
    } catch (e) {
      console.warn('[Aurora] no se pudo compartir en Android:', e);
      return false;
    }
  }
};

window.AuroraPlatform = AuroraPlatform;

Object.assign(App, {
  /* ¿Corremos dentro de la app Android? (layout compacto, sin marco) */
  isNativeApp() {
    return AuroraPlatform.isNative;
  },

  /* ============================================================
   *  Botón atrás del sistema Android
   *  MainActivity pregunta antes de cerrar nada. Respuestas:
   *    'handled' — se cerró una hoja, la vista de letras o el modo
   *                portada: la actividad no hace nada más.
   *    'playing' — no había nada que cerrar pero suena audio: la
   *                actividad pasa al fondo para no cortar la música.
   *    'exit'    — nada abierto y nada sonando: salir de la app.
   * ============================================================ */
  handleAndroidBack() {
    try {
      // 1. Hojas modales (la última abierta es la de arriba).
      let sheets = [];
      if (Array.isArray(this._sheetStack)) sheets = this._sheetStack.slice();
      if (!sheets.length) {
        const open = document.querySelectorAll('.sheet.open');
        sheets = Array.prototype.map.call(open, s => s.id);
      }
      if (sheets.length) {
        this.closeSheet(sheets[sheets.length - 1]);
        return 'handled';
      }
      // 2. Edición de lista.
      if (this._editingPlaylistId && typeof this.closeSheet === 'function') {
        this.closeSheet('sheetEditor');
        return 'handled';
      }
      // 3. Portada a pantalla completa.
      if (this._coverFs && typeof this.setCoverFullscreen === 'function') {
        this.setCoverFullscreen(false);
        return 'handled';
      }
      // 4. Letras → reproductor.
      const lyrics = document.getElementById('viewLyrics');
      if (lyrics && lyrics.classList.contains('active')) {
        this.showView('player');
        return 'handled';
      }
      // 5. Nada abierto: si suena música, no cerrar la actividad.
      if (this.isPlaying) return 'playing';
      return 'exit';
    } catch (e) {
      return 'exit';
    }
  }
});

/* La actividad evalúa `window.AuroraAndroidBack()` y actúa según la
 * respuesta. Se define aparte para que exista incluso si App fallara. */
window.AuroraAndroidBack = function () {
  try {
    if (!window.App || typeof App.handleAndroidBack !== 'function') return 'exit';
    return App.handleAndroidBack();
  } catch (e) {
    return 'exit';
  }
};

/* =====================================================================
 *  Reproducción en segundo plano (Android)
 *  Ruido cero en navegador: si no existe window.AuroraMedia, todo esto
 *  no hace nada.
 * ===================================================================== */

Object.assign(App, {
  /* ¿Hay servicio de reproducción nativo? */
  hasNativeMedia() {
    const M = window.AuroraMedia;
    return !!(M && typeof M.mediaUpdate === 'function' &&
      typeof M.mediaStart === 'function');
  },

  /*  ¿Está sonando DE VERDAD? Con el motor nativo manda el MediaPlayer
   *  (snapshot); con el <audio> del navegador, el propio elemento. No se
   *  usa isPlaying porque esa bandera es de la interfaz y va un paso por
   *  detrás mientras una pista se prepara: al pausar desde la notificación
   *  con isPlaying desfasado, la orden se ignoraba y el botón «no hacía
   *  nada».
   */
  isReallyPlaying() {
    const snap = (typeof this.isNativeAudio === 'function' && this.isNativeAudio() &&
      window.NativeAudio) ? window.NativeAudio.snapshot() : null;
    if (snap) return !!snap.playing;
    return !!(this.audio && this.audio.paused === false);
  },

  /* Manda a Android lo que está sonando.
   * Se llama desde updatePlayUI(), renderCurrentTrack() y seekToTime():
   * el estado ya está calculado y aquí solo se compara con lo último
   * enviado, así que repetir la llamada no cuesta ni una ida al puente. */
  syncNativeMedia() {
    if (!this.hasNativeMedia()) return;
    const M = window.AuroraMedia;
    const t = this.currentTrack;

    if (!t) {
      if (this._nativeMediaOn) {
        this._nativeMediaOn = false;
        this._nativeMediaSig = null;
        this._nativeMediaArtId = null;
        try { M.mediaStop(); } catch (e) {}
      }
      if (typeof this.syncNativeQueue === 'function') this.syncNativeQueue();
      return;
    }

    //  Con el motor nativo, la notificación debe decir lo MISMO que el
    //  altavoz: se copia el snapshot de Java en vez de la bandera de la
    //  interfaz (que puede ir un paso por detrás mientras carga). Era el
    //  origen de que la notificación dijera «reproduciendo» en silencio y
    //  siguiera así al pausar desde la pantalla de bloqueo.
    const snap = (typeof this.isNativeAudio === 'function' && this.isNativeAudio() &&
      window.NativeAudio) ? window.NativeAudio.snapshot() : null;
    const playing = snap ? !!snap.playing : !!this.isPlaying;
    const dur = snap && snap.duration > 0
      ? snap.duration / 1000
      : (this.audio && isFinite(this.audio.duration) && this.audio.duration > 0
        ? this.audio.duration : (t.duration || 0));
    const pos = snap && snap.position >= 0
      ? snap.position / 1000
      : (this.audio && isFinite(this.audio.currentTime) ? this.audio.currentTime : 0);

    // El servicio se levanta en la primera reproducción, no al abrir una
    // pista en pausa: así no aparece una notificación muda al arrancar.
    if (playing && !this._nativeMediaOn) {
      this._nativeMediaOn = true;
      try { M.mediaStart(); } catch (e) {}
    }
    if (!this._nativeMediaOn) return;

    const sig = [t.id, t.title || '', t.artist || '', t.album || '',
      playing ? 1 : 0, Math.round(dur * 1000), Math.round(pos * 1000)].join('\u0001');
    if (sig !== this._nativeMediaSig) {
      this._nativeMediaSig = sig;
      if (typeof this.syncNativeQueue === 'function') this.syncNativeQueue();
      try {
        M.mediaUpdate(t.title || '', t.artist || '', t.album || '',
          playing, Math.round(dur * 1000), Math.round(pos * 1000));
      } catch (e) {}
    }

    // Carátula: solo cuando cambia de pista (decodificar una imagen no es
    // gratis). Una portada enorme se omite antes que atascar el puente.
    if (this._nativeMediaArtId !== t.id) {
      this._nativeMediaArtId = t.id;
      let art = '';
      try {
        art = (typeof this._renderArtwork === 'function')
          ? this._renderArtwork(t, 512) : '';
      } catch (e) { art = ''; }
      if (art && art.indexOf('data:image/') === 0 && art.length < 2500000) {
        try { M.mediaArtwork(t.id, art); } catch (e) {}
      } else {
        try { M.mediaClearArtwork(); } catch (e) {}
      }
    }
  }
});

/* =====================================================================
 *  Diagnóstico del WebView
 *  Un WebView viejo (o el de fábrica de un Android antiguo, que nunca se
 *  actualiza) explica fallos que no se reproducen en otro teléfono: por
 *  eso la versión se enseña en Ajustes → Acerca de, y aquí se comprueba
 *  una sola vez si al motor le falta algo básico.
 * ===================================================================== */

Object.assign(App, {
  /* Rellena la línea «WebView» de Acerca de y devuelve el texto. */
  fillWebViewInfo() {
    const B = window.AuroraAndroid;
    let info = '';
    if (B && typeof B.webViewInfo === 'function') {
      try { info = String(B.webViewInfo() || ''); } catch (e) { info = ''; }
    }
    if (!info) {
      const ua = navigator.userAgent || '';
      const m = /Chrom(?:e|ium)\/([0-9.]+)/.exec(ua);
      info = (m ? m[1] : '?') + ' · ' + (ua || 'sin agente de usuario');
    }
    this.webViewInfo = info;
    const line = document.getElementById('aboutWebViewLine');
    const out = document.getElementById('aboutWebView');
    if (line && out) {
      out.textContent = info;
      line.style.display = '';
    }
    return info;
  },

  /* ¿Le falta al motor algo que la app da por hecho? Se avisa una vez en
   * consola (y en Ajustes se puede leer la versión). Silencioso si todo
   * está: no ensucia la experiencia normal. */
  checkRuntime() {
    const falta = [];
    const pruebas = [
      ['Promise', typeof Promise !== 'undefined'],
      ['Map', typeof Map !== 'undefined'],
      ['Set', typeof Set !== 'undefined'],
      ['Object.assign', typeof Object.assign === 'function'],
      ['Array.from', typeof Array.from === 'function'],
      ['Array.prototype.includes', typeof Array.prototype.includes === 'function'],
      ['Element.prototype.closest',
        typeof Element !== 'undefined' && typeof Element.prototype.closest === 'function'],
      ['Blob', typeof Blob !== 'undefined'],
      ['URL.createObjectURL',
        typeof URL !== 'undefined' && typeof URL.createObjectURL === 'function'],
      ['indexedDB', typeof indexedDB !== 'undefined'],
      ['FileReader', typeof FileReader !== 'undefined']
    ];
    pruebas.forEach(([nombre, hay]) => { if (!hay) falta.push(nombre); });
    this._runtimeMissing = falta;
    if (falta.length) {
      console.warn('[Aurora] al WebView le faltan cosas: ' + falta.join(', ')
        + ' (' + this.fillWebViewInfo() + ')');
    }
    return falta;
  }
});

/* =====================================================================
 *  Cola nativa (Android)
 *  Con la app cerrada, Java no puede preguntar qué viene después: se le
 *  deja una ventana de la cola con lo justo para la notificación (título,
 *  artista, álbum, duración). Este empuje va deduplicado y solo manda
 *  una ventana corta, no la cola entera.
 * ===================================================================== */

Object.assign(App, {
  /* Cuántas pistas por delante viajan a Java. Diez cubren de sobra una
   * sesión con la pantalla apagada; si se acaban, la reproducción se
   * detiene con la última, que es mejor que sonar «otra cosa». */
  NATIVE_QUEUE_WINDOW: 10,

  _nativeQueueSig: null,

  /* Empuja a Android la pista actual y las siguientes. */
  syncNativeQueue() {
    const N = window.AuroraNativePlayer;
    if (!N || typeof N.queueSet !== 'function') return;
    if (!Array.isArray(this.queue) || !this.queue.length) {
      if (this._nativeQueueSig !== '') {
        this._nativeQueueSig = '';
        try { N.queueSet('', -1); } catch (e) {}
      }
      return;
    }

    const byId = this.trackMap ? this.trackMap() : null;
    const find = (id) => {
      if (byId && byId.get) {
        const t = byId.get(id);
        if (t) return t;
      }
      return this.tracks.find(t => t.id === id) || null;
    };

    // La ventana empieza en la pista actual: Java solo necesita saber qué
    // poner después, no revisar la cola entera.
    let start = Math.max(0, Math.min(this.queueIdx, this.queue.length - 1));
    const curId = this.currentTrack ? this.currentTrack.id : this.queue[start];
    const pos = this.queue.indexOf(curId);
    if (pos >= 0) start = pos;

    const slice = this.queue.slice(start, start + this.NATIVE_QUEUE_WINDOW);
    const tracks = [];
    for (const id of slice) {
      const t = find(id);
      if (!t) continue;
      tracks.push({
        id: t.id,
        title: t.title || '',
        artist: t.artist || '',
        album: t.album || '',
        duration: Math.round((t.duration || 0) * 1000)
      });
    }
    if (!tracks.length) return;

    const payload = JSON.stringify({ repeat: this.repeat || 'off', tracks: tracks });
    const sig = (this.repeat || 'off') + '\u0001' + tracks.map(t => t.id).join(',') + '\u0001' + tracks[0].id;
    if (sig === this._nativeQueueSig) return;
    this._nativeQueueSig = sig;
    try { N.queueSet(payload, 0); } catch (e) {}
  }
});

/* Comandos que llegan desde el sistema (notificación, bloqueo, auriculares).
 * PlaybackService los manda con WebApp.mediaCommand(). */
window.AuroraMediaCommand = function (cmd) {
  try {
    const name = String(cmd || '');
    if (!window.App) return;
    //  ¿Suena o no? Se pregunta al motor, no a la bandera de la interfaz:
    //  un toque en «pausa» con isPlaying desfasado se perdía y el botón de
    //  la notificación parecía muerto.
    const sonando = typeof App.isReallyPlaying === 'function'
      ? App.isReallyPlaying() : !!App.isPlaying;
    //  La pausa llega desde el sistema ANTES de que la web se entere: en la
    //  pérdida de foco, PlaybackService pausa el motor nativo y solo
    //  después avisa aquí. Si se decidiera solo por «¿suena?», la respuesta
    //  sería «no» y la interfaz se quedaría en «reproduciendo» con el
    //  altavoz en silencio (justo el fallo reportado). Por eso también
    //  cuentan la bandera de la interfaz y la intención del <audio>.
    const queria = !!(App.audio && App.audio._wantPlay);
    const activo = sonando || !!App.isPlaying || queria;
    if (name === 'play') {
      if (App.currentTrack && !sonando) App.togglePlay(true);
    } else if (name === 'pause') {
      if (activo) App.togglePlay(false);
    } else if (name === 'next') {
      if (typeof App.next === 'function') App.next();
    } else if (name === 'prev') {
      if (typeof App.prev === 'function') App.prev();
    } else if (name === 'stop') {
      if (activo) App.togglePlay(false);
    }
  } catch (e) {}
};
