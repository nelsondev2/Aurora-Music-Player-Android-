/* =====================================================================
 *  js/native-audio.js — Aurora Music Player
 *  Motor de reproducción nativo (MediaPlayer) con la cara de un <audio>.
 *
 *  La app entera está escrita alrededor de un elemento <audio>: su src,
 *  su currentTime, sus eventos timeupdate/ended/error. Este módulo
 *  entrega un objeto que se comporta igual pero cuyo sonido lo pone
 *  Android (NativePlayer.java), así que la música sobrevive a que el
 *  WebView desaparezca y el paso de una pista a la siguiente no tiene
 *  hueco (setNextMediaPlayer).
 *
 *  Lo que NO puede hacer un motor nativo: Web Audio. Sin el elemento real
 *  no hay ecualizador, ni visualizador, ni crossfade. Por eso el motor
 *  nativo es opcional (Ajustes → Motor de audio) y la app avisa.
 *
 *  Si algo falla —una pista que el sistema no puede decodificar, la
 *  subida cortada— el llamador puede volver al motor del WebView.
 * ===================================================================== */

'use strict';

/* Tamaño de trozo al cruzar el audio a Java: el mismo que al compartir. */
const NATIVE_AUDIO_CHUNK = 512 * 1024;

const NativeAudio = {
  /* ¿Hay reproductor nativo en esta build? */
  get available() {
    const N = window.AuroraNativePlayer;
    return !!(N && typeof N.play === 'function' &&
      typeof N.audioBegin === 'function' && typeof N.audioChunk === 'function');
  },

  /* ¿El usuario eligió el motor nativo? (Ajustes → Motor de audio) */
  get preferred() {
    if (!this.available) return false;
    try {
      return localStorage.getItem('aurora_engine') !== 'web';
    } catch (e) {
      return true;
    }
  },

  /* Instancia viva del sustituto de <audio>. */
  element: null,

  /* Devuelve (creándolo) el elemento-fachada del motor nativo. */
  get() {
    if (!this.available) return null;
    if (!this.element) this.element = new NativeAudioElement();
    return this.element;
  },

  /* Aviso desde Java (window.AuroraNativePlayerEvent). */
  handleEvent(payload) {
    if (this.element) this.element._onNativeEvent(payload);
  },

  /* Sube una pista a la caché nativa si no está ya. Devuelve Promise<bool>.
   * `blob` es el archivo; si no se pasa, se intenta con la URL de la pista. */
  async ensureUploaded(trackId, ext, sourceUrl, blob) {
    const N = window.AuroraNativePlayer;
    if (!this.available || !trackId) return false;
    try {
      if (N.audioHas(trackId)) return true;
    } catch (e) {}

    let data = blob;
    if (!data && sourceUrl) {
      try {
        const res = await fetch(sourceUrl);
        data = await res.blob();
      } catch (e) {
        return false;
      }
    }
    if (!data) return false;

    try {
      if (!N.audioBegin(trackId, ext || 'audio')) return false;
      for (let off = 0; off < data.size; off += NATIVE_AUDIO_CHUNK) {
        const part = data.slice(off, Math.min(off + NATIVE_AUDIO_CHUNK, data.size));
        const b64 = await readChunkAsBase64(part);
        if (!N.audioChunk(b64)) return false;
      }
      return !!N.audioFinish(trackId, ext || 'audio');
    } catch (e) {
      console.warn('[Aurora] subida al motor nativo fallida:', e);
      return false;
    }
  },

  /* Extensión de una pista (para que el archivo cacheado tenga nombre). */
  extFor(track) {
    if (track && track.fileName && track.fileName.indexOf('.') > 0) {
      return track.fileName.split('.').pop().toLowerCase();
    }
    return 'audio';
  }
};

window.NativeAudio = NativeAudio;

/* ---------------------------------------------------------------------
 *  NativeAudioElement: el <audio> de mentira.
 *  Implementa solo lo que la app usa (está medido: src, currentTime,
 *  duration, paused, volume, playbackRate, readyState, play/pause/load,
 *  get/set/removeAttribute y addEventListener).
 * ------------------------------------------------------------------- */
class NativeAudioElement {
  constructor() {
    this._src = '';
    this._trackId = null;
    this._position = 0;      // segundos
    this._duration = 0;      // segundos
    this._paused = true;
    this._volume = 1;
    this._rate = 1;
    this._readyState = 0;
    this._error = null;
    this._wantPlay = false;
    this._loading = null;    // promesa de carga en curso
    this._listeners = {};
    this._lastEndedAt = 0;
    this._startAt = 0;       // posición inicial pedida (restaurar sesión)
  }

  /* ---------- atributos ---------- */
  getAttribute(name) {
    if (name === 'src') return this._src || null;
    return null;
  }

  setAttribute(name, value) {
    if (name === 'src') this.src = value;
  }

  removeAttribute(name) {
    if (name === 'src') {
      this._src = '';
      this._trackId = null;
      this._readyState = 0;
      this._paused = true;
      this._wantPlay = false;
      this._loading = null;
    }
  }

  /* ---------- propiedades ---------- */
  get src() {
    return this._src;
  }

  set src(url) {
    this._src = url || '';
    this._error = null;
    this._readyState = 0;
    if (!this._src) return;
    this._startLoad();
  }

  get currentTime() {
    return this._position;
  }

  set currentTime(seconds) {
    const n = Number(seconds);
    if (!isFinite(n) || n < 0) return;
    this._position = n;
    if (window.AuroraNativePlayer) {
      try { window.AuroraNativePlayer.seekTo(Math.round(n * 1000)); } catch (e) {}
    }
  }

  get duration() {
    return this._duration;
  }

  get paused() {
    return this._paused;
  }

  get volume() {
    return this._volume;
  }

  set volume(v) {
    const n = Number(v);
    this._volume = isFinite(n) ? Math.max(0, Math.min(1, n)) : 1;
    if (window.AuroraNativePlayer) {
      try { window.AuroraNativePlayer.setVolume(this._volume); } catch (e) {}
    }
  }

  get playbackRate() {
    return this._rate;
  }

  set playbackRate(r) {
    const n = Number(r);
    if (!isFinite(n) || n <= 0) return;
    this._rate = n;
    if (window.AuroraNativePlayer) {
      try { window.AuroraNativePlayer.setRate(n); } catch (e) {}
    }
  }

  get readyState() {
    return this._readyState;
  }

  get error() {
    return this._error;
  }

  /* preservesPitch: MediaPlayer conserva el tono al cambiar la velocidad. */
  get preservesPitch() { return true; }
  set preservesPitch(v) {}
  get webkitPreservesPitch() { return true; }
  set webkitPreservesPitch(v) {}
  get mozPreservesPitch() { return true; }
  set mozPreservesPitch(v) {}

  /* ---------- métodos de reproducción ---------- */
  play() {
    this._wantPlay = true;
    const N = window.AuroraNativePlayer;
    if (!this._trackId) {
      // play() antes de que la carga termine: se reanuda al preparar.
      return Promise.resolve();
    }
    if (N) {
      try {
        if (this._readyState >= 2) N.resume();
      } catch (e) {}
    }
    this._paused = false;
    return Promise.resolve();
  }

  pause() {
    this._wantPlay = false;
    this._paused = true;
    if (window.AuroraNativePlayer) {
      try { window.AuroraNativePlayer.pause(); } catch (e) {}
    }
    this._emit('pause');
  }

  load() {
    if (this._src) this._startLoad();
  }

  /* ---------- eventos ---------- */
  addEventListener(type, fn) {
    if (typeof fn !== 'function') return;
    (this._listeners[type] = this._listeners[type] || []).push(fn);
  }

  removeEventListener(type, fn) {
    const list = this._listeners[type];
    if (!list) return;
    const i = list.indexOf(fn);
    if (i >= 0) list.splice(i, 1);
  }

  dispatchEvent(event) {
    this._emit(event && event.type ? event.type : String(event), event);
    return true;
  }

  _emit(type, detail) {
    const list = this._listeners[type];
    if (!list || !list.length) return;
    const event = detail || { type: type, target: this };
    list.slice().forEach(fn => {
      try { fn(event); } catch (e) { console.error('[Aurora] listener ' + type + ':', e); }
    });
  }

  /* ---------- carga ---------- */
  _startLoad() {
    // La pista se resuelve en el momento de cargar: la app asigna src justo
    // después de fijar currentTrack (loadAndPlay).
    const app = window.App;
    const track = (app && app.currentTrack) ? app.currentTrack : null;
    if (!track) return;
    const trackId = track.id;
    const url = this._src;
    const startAt = this._startAt || 0;
    this._startAt = 0;
    this._trackId = trackId;
    this._readyState = 1;

    const isGapless = window.__auroraGaplessSwap;
    window.__auroraGaplessSwap = false;
    if (isGapless) return; // la pista ya está sonando en nativo

    this._emit('waiting');
    const token = (this._loadToken = (this._loadToken || 0) + 1);

    const run = async () => {
      const ok = await NativeAudio.ensureUploaded(
        trackId, NativeAudio.extFor(track), url, track._file || track.fileBlob || null);
      if (token !== this._loadToken) return;
      if (!ok) {
        this._fail('no se pudo preparar el audio');
        return;
      }
      const N = window.AuroraNativePlayer;
      let started = false;
      try {
        started = N.play(trackId, Math.round(startAt * 1000));
      } catch (e) {
        started = false;
      }
      if (!started) {
        this._fail('MediaPlayer no pudo abrir la pista');
        return;
      }
      if (this._wantPlay) {
        try { N.resume(); } catch (e) {}
      }
      // El resto llega por eventos de Java (loaded → playing → time).
    };
    this._loading = run().catch((e) => this._fail(String(e)));

    // Adelantar la siguiente pista: cuando llegue el final, MediaPlayer
    // hará el relevo sin silencio.
    this._prefetchNext(trackId);
  }

  async _prefetchNext(currentId) {
    try {
      const app = window.App;
      if (!app || typeof app._nativeNextTrackId !== 'function') return;
      const next = app._nativeNextTrackId(currentId);
      if (!next || next.id === currentId) {
        if (window.AuroraNativePlayer && app._gaplessEnabled) {
          try { window.AuroraNativePlayer.clearNext(); } catch (e) {}
        }
        return;
      }
      if (!app._gaplessEnabled) return;
      const N = window.AuroraNativePlayer;
      if (!N) return;
      let ready = false;
      try { ready = !!(N.audioHas && N.audioHas(next.id)); } catch (e) { ready = false; }
      if (!ready) {
        // Todavía no está en la caché: se sube mientras suena la actual.
        ready = await NativeAudio.ensureUploaded(
          next.id, NativeAudio.extFor(next), app.getTrackUrl(next),
          next._file || next.fileBlob || null);
      }
      if (!ready) return;
      try { N.prepareNext(next.id); } catch (e) {}
    } catch (e) {}
  }

  _fail(message) {
    this._error = { code: 4, message: message || 'error' };
    this._readyState = 0;
    this._paused = true;
    if (window.App && typeof window.App._nativeAudioFailed === 'function') {
      try { window.App._nativeAudioFailed(message); } catch (e) {}
    }
    this._emit('error', { type: 'error', target: this, message: message });
  }

  /* ---------- eventos que llegan de Java ---------- */
  _onNativeEvent(payload) {
    if (!payload || !payload.event) return;
    const kind = payload.event;

    if (kind === 'loaded') {
      this._readyState = 4;
      this._duration = (Number(payload.duration) || 0) / 1000;
      this._error = null;
      this._emit('loadedmetadata');
      this._emit('durationchange');
      this._emit('canplay');
      return;
    }

    if (kind === 'playing') {
      this._paused = false;
      this._readyState = 4;
      this._emit('playing');
      return;
    }

    if (kind === 'paused') {
      this._paused = true;
      if (payload.position != null) this._position = Number(payload.position) / 1000;
      return;
    }

    if (kind === 'time') {
      this._position = (Number(payload.position) || 0) / 1000;
      const dur = (Number(payload.duration) || 0) / 1000;
      if (dur > 0) this._duration = dur;
      this._emit('timeupdate');
      return;
    }

    if (kind === 'ended') {
      this._paused = true;
      this._lastEndedAt = Date.now();
      this._readyState = 0;
      this._emit('ended');
      return;
    }

    if (kind === 'trackchanged') {
      // MediaPlayer ya está sonando la pista preparada: la app solo tiene
      // que mover su cola y su interfaz, sin volver a cargar nada.
      const nextId = payload.trackId;
      this._trackId = nextId || this._trackId;
      this._position = 0;
      this._paused = false;
      this._duration = (Number(payload.duration) || 0) / 1000;
      if (window.App && typeof window.App._onNativeTrackChanged === 'function') {
        try { window.App._onNativeTrackChanged(nextId); } catch (e) {}
      }
      this._emit('loadedmetadata');
      this._emit('playing');
      return;
    }

    if (kind === 'error') {
      this._fail(payload.message || 'error de MediaPlayer');
    }
  }
}

/* ---------------------------------------------------------------------
 *  Enganches con la app.
 * ------------------------------------------------------------------- */
Object.assign(App, {
  /* ¿Está activo el motor nativo? */
  isNativeAudio() {
    return !!(this._engine === 'native' && window.NativeAudio &&
      window.NativeAudio.available);
  },

  /* Elige motor ('native' | 'web'). Se guarda y se aplica al recargar la
   * reproducción — cambiar de motor a mitad de canción no tiene sentido. */
  setAudioEngine(engine) {
    const value = (engine === 'web') ? 'web' : 'native';
    try { localStorage.setItem('aurora_engine', value); } catch (e) {}
    this._engine = window.NativeAudio && window.NativeAudio.available && value === 'native'
      ? 'native' : 'web';
    if (typeof this.syncPlaybackSettingsUI === 'function') this.syncPlaybackSettingsUI();
    return this._engine;
  },

  /* Pista que tocaría después de `currentId` según la cola actual.
   * Devuelve el objeto de pista o null. */
  _nativeNextTrackId(currentId) {
    try {
      if (!Array.isArray(this.queue) || !this.queue.length) return null;
      if (this.repeat === 'one') return null;
      let idx = this.queueIdx;
      const cur = currentId || (this.currentTrack && this.currentTrack.id);
      const pos = this.queue.indexOf(cur);
      if (pos >= 0) idx = pos;
      let nextIdx = idx + 1;
      if (nextIdx >= this.queue.length) {
        if (this.repeat !== 'all') return null;
        nextIdx = 0;
      }
      const id = this.queue[nextIdx];
      if (!id || id === cur) return null;
      return this.tracks.find(t => t.id === id) || null;
    } catch (e) {
      return null;
    }
  },

  /* Java avisa de que ya suena la pista preparada (relevo gapless). */
  _onNativeTrackChanged(trackId) {
    if (!trackId) return;
    try {
      const idx = this.queue.indexOf(trackId);
      if (idx >= 0) this.queueIdx = idx;
      const track = this.tracks.find(t => t.id === trackId);
      if (track) {
        this.currentTrack = track;
        this.currentTrackIdx = this.tracks.indexOf(track);
      }
      // La pista sonó entera: cuenta para estadísticas y para la cola.
      if (typeof this.trackPlayCompleted === 'function') this.trackPlayCompleted();
      if (typeof this.trackPlayStarted === 'function') this.trackPlayStarted();
      this.isPlaying = true;
      this.renderCurrentTrack();
      if (typeof this.renderLyrics === 'function') this.renderLyrics();
      if (typeof this.updatePlayUI === 'function') this.updatePlayUI();
      if (typeof this.saveSession === 'function') this.saveSession();
      if (typeof this.syncNativeMedia === 'function') this.syncNativeMedia();
      window.__auroraGaplessSwap = true;
    } catch (e) {
      console.error('[Aurora] relevo nativo:', e);
    }
  },

  /* Una pista no se pudo preparar en el motor nativo. */
  _nativeAudioFailed(message) {
    console.warn('[Aurora] motor nativo:', message);
    this._nativeFailures = (this._nativeFailures || 0) + 1;
    // Tres fallos seguidos en esta sesión: el motor nativo no puede con
    // esta biblioteca (códec raro); se vuelve al WebView sin preguntar.
    if (this._nativeFailures >= 3) {
      this.toast(this.t('engine_fallback'));
      this.setAudioEngine('web');
      this._nativeFailures = 0;
      setTimeout(() => location.reload(), 1200);
    }
  }
});

/* Eventos del reproductor nativo (los manda NativePlayer.java). */
window.AuroraNativePlayerEvent = function (payload) {
  try {
    if (window.NativeAudio) window.NativeAudio.handleEvent(payload);
  } catch (e) {}
};
