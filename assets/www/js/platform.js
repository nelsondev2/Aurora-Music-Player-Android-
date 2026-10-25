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
      return;
    }

    const playing = !!this.isPlaying;
    const dur = this.audio && isFinite(this.audio.duration) && this.audio.duration > 0
      ? this.audio.duration : (t.duration || 0);
    const pos = this.audio && isFinite(this.audio.currentTime) ? this.audio.currentTime : 0;

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
        try { M.mediaArtwork(art); } catch (e) {}
      } else {
        try { M.mediaClearArtwork(); } catch (e) {}
      }
    }
  }
});

/* Comandos que llegan desde el sistema (notificación, bloqueo, auriculares).
 * PlaybackService los manda con WebApp.mediaCommand(). */
window.AuroraMediaCommand = function (cmd) {
  try {
    const name = String(cmd || '');
    if (!window.App) return;
    if (name === 'play') {
      if (App.currentTrack && !App.isPlaying) App.togglePlay(true);
    } else if (name === 'pause') {
      if (App.isPlaying) App.togglePlay(false);
    } else if (name === 'next') {
      if (typeof App.next === 'function') App.next();
    } else if (name === 'prev') {
      if (typeof App.prev === 'function') App.prev();
    } else if (name === 'stop') {
      if (App.isPlaying) App.togglePlay(false);
    }
  } catch (e) {}
};
