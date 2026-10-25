/* =====================================================================
 *  js/state.js — Aurora Music Player
 *  Estado global de la aplicación
 *
 *  Parte del refactor (C) de app.js: mismo código, módulos por funcionalidad.
 *  Este archivo se carga el primero (tras data.js) y define el objeto App.
 *  El resto de módulos amplían App con Object.assign porque los scripts
 *  son clásicos (sin módulos ES) por compatibilidad con webxdc.
 * ===================================================================== */

'use strict';

  /* ============================================================
   *  Estado global de la aplicación
   * ============================================================ */
  const App = {
    /* Datos */
    tracks: [],
    playlists: [],

    /* Audio */
    audio: null,
    audioCtx: null,
    analyser: null,
    sourceNode: null,
    gainNode: null,
    eqFilters: [],
    freqData: null,

    /* Estado de reproducción */
    queue: [],
    queueIdx: 0,
    currentTrackIdx: 0,
    currentTrack: null,
    isPlaying: false,
    shuffle: false,
    repeat: 'off', // 'off' | 'all' | 'one'
    volume: 1,
    playbackRate: 1,
    preservesPitch: true,

    /* Visualizador de frecuencias y repetición A-B */
    visualizerMode: 'wave', //  solo onda — 'wave' | 'off'
    _visRafId: null,
    /*  portada a pantalla completa (modo inmersivo al tocarla).
 * No se persiste: es un estado de vista, no una preferencia. */
    _coverFs: false,
    /* Bucle A-B del reproductor. Convive con lrcLoop (el de
     * sección en Letras):
 * este repite entre dos instantes de la canción; aquel,
 * entre dos líneas de la letra. */
    abRepeat: { active: false, a: null, b: null },

    /* Selección múltiple / lote */

    /* Letras */
    lrcLines: [], // {time, text, timed, translation?}
    activeLrcIdx: -1,
    lrcHasTimed: false,
    lrcOffset: 0,        // desfase manual en segundos (positivo = retrasa)
    lrcFontSize: 19,     // tamaño de fuente ajustable
    lrcRafId: null,      // requestAnimationFrame para sync precisa
    lrcUserScrolling: false,  // true cuando el usuario hace scroll manual
    lrcUserScrollTimer: null,
    lrcLoop: null,       // {start, end} en segundos: rango A-B elegido por el usuario
    _lrcLoopA: null,     // inicio A pendiente de cerrar con B
    _lrcLoopTrackId: null, // pista a la que pertenece el rango A-B

    /* #15 #16 Cache de objectURLs y preload */
    _urlCache: new Map(),     // trackId → objectURL (cache para reutilizar)
    _preloadAudio: null,      // elemento audio para precargar siguiente pista (NO conectado al grafo)
    _gaplessEnabled: true,    // reproducción continua; no intercambia <audio>
    _normalizeVolume: false,  // RMS opt-in
    _trackGainCache: new Map(), // trackId → gain normalizado
    /*  sin _playHistory (historial retirado). */
    _originalQueue: null,     // cola sin barajar (para deshacer shuffle)
    _plSyncIds: null,         //  ids de la lista al construir la cola (base de sincronización)
    _normGain: 1,
    _decodeSkipCount: 0,

    /* Sleep timer */
    sleepTimer: null,
    sleepEndAt: null,
    _sleepEndOfTrack: false,
    _sleepFading: false,

    /* Wake Lock */
    wakeLock: null,

    /* Favoritos */
    favorites: new Set(),

    /* Estadísticas de reproducción */
    stats: {
      plays: {},        // {trackId: count}
      skips: {},        // {trackId: count} —: saltos a mitad de canción
      totalSeconds: 0,
      lastPlayed: null,  // ISO string
      sessionStart: Date.now()
    },
    _statsFlushTimer: null,
    _currentPlayStart: null,
    _currentPlayBaseTime: 0,
    _playCounted: false,   //  la escucha en curso ya sumó (o no)
    _skipCounted: false,   //  el salto de este pase ya contó (o no)

    /* Crossfade opt-in (0 / 3 / 6 / 12 s). 0 = off; no retrasa el next manual. */
    crossfadeEnabled: false,
    crossfadeDuration: 0,

    /* Tema */
    theme: 'dark',  // 'dark' | 'light' | 'amoled'
    accent: 'aurora',  // 'aurora' | 'ocean' | 'moss' | 'amber' | 'cherry'

    /* Idioma */
    lang: 'es',  // código ISO 639-1: 'es' | 'en' | 'pt' | 'zh' | 'ja' | 'fr' | 'it' | 'ru'

    /* Edición de playlist:
 * _editingPlaylistId = ID de playlist que se está editando (en sheetEditPlaylist)
 * Null cuando no hay edición en curso.
 * (: _addingToPlaylistId extirpado con el modo «añadir».) */
    _editingPlaylistId: null,

    /* Contexto de reproducción actual: indica desde qué lista se está
     * reproduciendo. Puede ser:
     *   { type: 'playlist', id, name }
     *   { type: 'favorites' }
     *   { type: 'queue' }       // cola manual / "todas las pistas"
     *   { type: 'all' }         // biblioteca entera
     *   null                    // sin contexto definido
     * Se usa para mostrar "Reproduciendo desde X" en la barra superior. */
    playContext: null,

    /* Biblioteca: orden de la lista de canciones.
     * Ya no hay pestañas: la vista muestra listas + todas las canciones. */
    _libTab: 'playlists', //  pestaña activa de la biblioteca
    _menuTrackId: null,
    _editTrackId: null,
    _browse: null,
    _searchHistory: [],
    _importCancelled: false,
    _importing: false,

    /* Índice id → pista para evitar búsquedas O(n*m) en listas grandes.
 * Se reconstruye de forma perezosa cuando cambia el tamaño de
 * tracks o el propio array (: antes solo se miraba el tamaño,
 * y una reasignación con el mismo número de pistas — la carga
 * inicial, por ejemplo — habría dejado el mapa viejo si ya
 * existía). Los mutadores además invalidan a mano. */
    _trackById: null,
    _trackMapSize: -1,
    _trackMapRef: null,

    /* Timers y ciclo de vida (se limpian al cerrar la app) */
    _sessionTimer: null,
    _initialized: false,
    _storageOk: true,

    /* Utilidades */
    _wired: {},
    _lastError: null,
    VERSION: '1.2.0',
    _marqueeEnabled: true,
    /*  sin _vinylEnabled (modo vinilo retirado). */
    _showRemaining: false, //  la duración total alterna a «tiempo restante» al tocarla

    ico(name, extra) {
      const cls = extra ? ('ico ' + extra) : 'ico';
      return '<svg class="' + cls + '" aria-hidden="true"><use href="#i-' + name + '"></use></svg>';
    },
    /* Inicial para portadas generadas: primera letra o número del
 * texto ([13]: antes era el primer carácter literal y un
 * título como «<img…» pintaba «<»). Sin letra válida, una nota. */
    coverInitial(text) {
      const m = String(text || '').match(/[\p{L}\p{N}]/u);
      return m ? m[0].toUpperCase() : '♪';
    },
    setIco(el, name) {
      if (!el) return;
      const svg = (el.tagName && el.tagName.toLowerCase() === 'svg') ? el : el.querySelector('svg');
      const use = svg && svg.querySelector('use');
      if (use) use.setAttribute('href', '#i-' + name);
    },

    /* ---------- Índice de pistas (rendimiento) ---------- */
    invalidateTrackIndex() {
      this._trackById = null;
      this._trackMapSize = -1;
      this._trackMapRef = null;
    },
    trackMap() {
      //  la condición incluye la IDENTIDAD del array. Con solo
      // el tamaño, `this.tracks = [otras pistas]` manteniendo la
      // cuenta dejaba un mapa apuntando a pistas que ya no están.
      if (!this._trackById || this._trackMapRef !== this.tracks || this._trackMapSize !== this.tracks.length) {
        this._trackById = new Map();
        for (const t of this.tracks) {
          if (t && t.id != null) this._trackById.set(t.id, t);
        }
        this._trackMapSize = this.tracks.length;
        this._trackMapRef = this.tracks;
      }
      return this._trackById;
    },
    getTrackById(id) {
      if (id == null) return null;
      return this.trackMap().get(id) || null;
    },
};

/* App vive en el scope léxico global y se expone también en window. */
window.App = App;
window.AuroraApp = App;
