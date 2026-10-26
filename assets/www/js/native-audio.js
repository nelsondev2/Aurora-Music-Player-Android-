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
 *  no hay ecualizador ni crossfade; la app dibuja una onda animada de
 *  cortesía, pero no reactiva al sonido. Por eso el motor nativo es
 *  opcional (Ajustes → Motor de audio) y la app avisa.
 *
 *  Si algo falla —una pista que el sistema no puede decodificar, la
 *  subida cortada— el llamador puede volver al motor del WebView.
 * ===================================================================== */

'use strict';

/* Tamaño de trozo al cruzar el audio a Java. 256 KB de bytes son ~341 KB
 * de base64: cada llamada al puente bloquea el hilo de JavaScript mientras
 * Java decodifica y escribe, así que trozos más pequeños (con una pausa
 * entre ellos) mantienen la interfaz respondiendo en archivos grandes. */
const NATIVE_AUDIO_CHUNK = 256 * 1024;
/* Versión del formato de caché nativa. Al cambiar, se vacía la caché: las
 * versiones anteriores podían entrelazar dos subidas (el almacén tiene un
 * solo archivo abierto) y dejar archivos que existían pero no sonaban. */
const NATIVE_CACHE_GEN = '2';

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

  /* Foto del estado real del reproductor (NativePlayer.snapshot). */
  snapshot() {
    const N = window.AuroraNativePlayer;
    if (!N || typeof N.snapshot !== 'function') return null;
    try {
      const raw = N.snapshot();
      return raw ? JSON.parse(raw) : null;
    } catch (e) {
      return null;
    }
  },

  /* Sube una pista a la caché nativa si no está ya. Devuelve Promise<bool>.
   * `blob` es el archivo; si no se pasa, se intenta con la URL de la pista.
   *
   *  Las subidas se encadenan: NativeAudioStore abre UN archivo cada vez
   * (begin() cierra el anterior), así que subir la pista actual y la
   * siguiente a la vez mezclaba los trozos de las dos y dejaba archivos
   * corruptos que luego «existían» pero no sonaban.
   */
  ensureUploaded(trackId, ext, sourceUrl, blob) {
    const run = () => this._uploadOne(trackId, ext, sourceUrl, blob);
    const next = this._uploadChain
      ? this._uploadChain.then(run, run)
      : run();
    this._uploadChain = next.then(() => undefined, () => undefined);
    return next;
  },

  async _uploadOne(trackId, ext, sourceUrl, blob) {
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
        //  Se cede el hilo cada trozo: sin esto, un FLAC de 40 MB son ~160
        // llamadas seguidas al puente y la interfaz se queda congelada
        // hasta que termina la subida entera.
        await new Promise(r => setTimeout(r, 0));
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

/* Limpieza única de la caché envenenada de versiones anteriores. */
NativeAudio.refresh = function () {
  const N = window.AuroraNativePlayer;
  if (!N || typeof N.audioClear !== 'function') return;
  let gen = '';
  try { gen = localStorage.getItem('aurora_native_cache_gen') || ''; } catch (e) {}
  if (gen === NATIVE_CACHE_GEN) return;
  try {
    const n = N.audioClear();
    console.info('[Aurora] caché nativa vaciada:', n);
  } catch (e) {}
  try { localStorage.setItem('aurora_native_cache_gen', NATIVE_CACHE_GEN); } catch (e) {}
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
    // Cada fuente nueva se carga en pausa. No heredar la intención de play
    // de la pista anterior: en particular, restaurar sesión al abrir la app
    // debe limitarse a preparar la canción y no reanudarla accidentalmente.
    this._wantPlay = false;
    this._paused = true;
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

  /* `paused` responde a la INTENCIÓN (¿el usuario quiere que suene?), no a
   * lo último que dijo MediaPlayer: sin esto, dos toques seguidos en play
   * leían «pausado» mientras se preparaba la pista y volvían a reproducir
   * en vez de pausar. El estado real llega por eventos (playing/paused). */
  get paused() {
    return !this._wantPlay;
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
    this._paused = false;
    const N = window.AuroraNativePlayer;
    if (!N) return Promise.resolve();

    //  La promesa se resuelve cuando Java confirma que SUENA ('playing'),
    // no al instante: la app marca isPlaying en su .then(), y resolver
    // antes dejaba la interfaz (y la notificación) diciendo
    // «reproduciendo» con el altavoz en silencio.
    const token = (this._playToken = (this._playToken || 0) + 1);
    const waiter = { token: token };
    const promise = new Promise((resolve, reject) => {
      waiter.resolve = resolve;
      waiter.reject = reject;
    });
    this._playWaiters = this._playWaiters || [];
    this._playWaiters.push(waiter);

    // Si el MediaPlayer no confirma en 15 s, la interfaz deja de mentir:
    // se rechaza y la app apaga el «reproduciendo» sin saltar de pista
    // (un FLAC enorme puede tardar, pero 15 s ya no es «cargando»).
    waiter.timer = setTimeout(() => {
      this._settlePlay(waiter, false, { name: 'TimeoutError', message: 'sin respuesta del motor' });
    }, 15000);

    try { N.resume(); } catch (e) {}
    return promise;
  }

  /* Cierra la promesa de play() pendiente de ese token. */
  _settlePlay(waiter, ok, error) {
    const list = this._playWaiters;
    if (!waiter || waiter.done) return;
    waiter.done = true;
    if (waiter.timer) clearTimeout(waiter.timer);
    if (list) {
      const i = list.indexOf(waiter);
      if (i >= 0) list.splice(i, 1);
    }
    if (ok) waiter.resolve();
    else if (waiter.reject) waiter.reject(error || new Error('no se pudo reproducir'));
  }

  pause() {
    this._wantPlay = false;
    this._paused = true;
    // Un play() a medias ya no tiene sentido: se descarta sin marcar error.
    (this._playWaiters || []).slice().forEach(w => {
      this._settlePlay(w, false, { name: 'AbortError', message: 'pausado' });
    });
    if (window.AuroraNativePlayer) {
      try { window.AuroraNativePlayer.pause(); } catch (e) {}
    }
    this._emit('pause');
  }

  load() {
    // Asignar src ya dispara _startLoad(). La llamada convencional `load()`
    // que sigue en loadTrackPaused/restoreSession debe ser idempotente; de lo
    // contrario se creaban dos MediaPlayer para el mismo primer audio y un
    // onError tardío del antiguo mostraba un falso aviso de fallo.
    if (this._src && !this._loading) this._startLoad();
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
      const N = window.AuroraNativePlayer;
      if (!N) {
        this._fail('sin motor nativo');
        return;
      }
      //  Se CARGA siempre sin sonar y, si el usuario había pedido play, se
      // arranca con resume(). Antes esto era play() a secas, así que dejar
      // una pista lista (restaurar sesión, borrar la que sonaba) la ponía a
      // sonar con la interfaz en pausa: pantalla y altavoz en desacuerdo.
      const ms = Math.round(startAt * 1000);
      let started = false;
      const originalUri = track.deviceUri || track.sourceUri;
      if (originalUri) {
        // Si Android conservó el permiso SAF, reproducir el original desde
        // content:// evita copiar el archivo entero al motor nativo en el
        // primer play (la URI solo se guarda cuando ese permiso es persistente).
        try {
          started = (typeof N.loadUri === 'function')
            ? N.loadUri(trackId, originalUri, ms)
            : N.playUri(trackId, originalUri, ms);
        } catch (e) {
          started = false;
        }
        // Si el proveedor revocó el permiso entre medias, la copia privada
        // de IndexedDB sigue siendo un camino válido para esta pista.
        if (!started && !track.deviceUri) {
          const ok = await NativeAudio.ensureUploaded(
            trackId, NativeAudio.extFor(track), url, track._file || track.fileBlob || null);
          if (token !== this._loadToken) return;
          if (!ok) {
            this._fail('no se pudo preparar el audio');
            return;
          }
          try {
            started = (typeof N.load === 'function') ? N.load(trackId, ms) : N.play(trackId, ms);
          } catch (e) { started = false; }
        }
      } else {
        const ok = await NativeAudio.ensureUploaded(
          trackId, NativeAudio.extFor(track), url, track._file || track.fileBlob || null);
        if (token !== this._loadToken) return;
        if (!ok) {
          this._fail('no se pudo preparar el audio');
          return;
        }
        try {
          started = (typeof N.load === 'function')
            ? N.load(trackId, ms)
            : N.play(trackId, ms);
        } catch (e) {
          started = false;
        }
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
    const loading = run().catch((e) => this._fail(String(e)));
    this._loading = loading;
    loading.then(() => {
      if (this._loading === loading) this._loading = null;
    });

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

      // Original accesible (MediaStore o permiso SAF persistente): preparar
      // directamente por content:// sin copiarlo al motor nativo.
      const nextUri = next.deviceUri || next.sourceUri;
      if (nextUri && typeof N.prepareNextUri === 'function') {
        try { N.prepareNextUri(next.id, nextUri); } catch (e) {}
        return;
      }

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
    this._wantPlay = false;
    (this._playWaiters || []).slice().forEach(w => {
      this._settlePlay(w, false, { name: 'NotSupportedError', message: message || 'error' });
    });
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
      this._wantPlay = true;
      this._readyState = 4;
      (this._playWaiters || []).slice().forEach(w => this._settlePlay(w, true));
      this._emit('playing');
      if (window.App && typeof window.App._applyNativePlayState === 'function') {
        window.App._applyNativePlayState(true);
      }
      return;
    }

    if (kind === 'paused') {
      this._paused = true;
      this._wantPlay = false;
      if (payload.position != null) this._position = Number(payload.position) / 1000;
      //  Java puede pausar sin que la web lo pida (pérdida de foco de
      // audio: llamada, otra app, el botón del casco). Antes esto no salía
      // de aquí y la interfaz —y la notificación— seguían diciendo
      // «reproduciendo» con el altavoz callado.
      this._emit('pause');
      if (window.App && typeof window.App._applyNativePlayState === 'function') {
        window.App._applyNativePlayState(false);
      }
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
      this._wantPlay = false;
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
      this._wantPlay = true;
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

  /* El motor nativo dice si suena o no. La interfaz le obedece: es el
   * único que sabe lo que pasa de verdad (foco de audio, llamada, botón
   * del casco, relevo sin hueco). */
  _applyNativePlayState(playing) {
    const next = !!playing;
    const changed = !!this.isPlaying !== next;
    this.isPlaying = next;
    if (changed) {
      if (typeof this.updatePlayUI === 'function') this.updatePlayUI();
      if (typeof this.updateChrome === 'function') this.updateChrome();
      if (typeof this.updateMediaPosition === 'function') this.updateMediaPosition(true);
    }
    if (typeof this.syncNativeMedia === 'function') this.syncNativeMedia();
  },

  /* Reconciliar al arrancar y al volver a primer plano: el servicio y el
   * MediaPlayer siguen vivos con la página dormida, así que la web no
   * puede suponer su estado. Devuelve true si había una pista sonando. */
  syncNativeState() {
    if (!this.isNativeAudio()) return false;
    const snap = window.NativeAudio ? window.NativeAudio.snapshot() : null;
    if (!snap) return false;
    const el = window.NativeAudio.element;
    if (el && snap.position != null) el._position = Number(snap.position) / 1000;
    const id = snap.trackId || '';
    if (id && (!this.currentTrack || this.currentTrack.id !== id)) {
      const track = this.tracks.find(t => t.id === id);
      if (track) {
        this.currentTrack = track;
        this.currentTrackIdx = this.tracks.indexOf(track);
        const q = this.queue.indexOf(id);
        if (q >= 0) this.queueIdx = q;
        if (typeof this.renderCurrentTrack === 'function') this.renderCurrentTrack();
        if (typeof this.renderLyrics === 'function') this.renderLyrics();
      }
    }
    const playing = !!snap.playing;
    if (el) el._wantPlay = playing || !!snap.wantsPlay;
    this._applyNativePlayState(playing);
    if (typeof this.updateProgress === 'function') this.updateProgress();
    return playing;
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
