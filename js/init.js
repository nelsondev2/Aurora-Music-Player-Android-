/* =====================================================================
 *  js/init.js — Aurora Music Player
 *  Inicialización · carga desde IndexedDB
 *
 *  Parte del refactor (C) de app.js: mismo código, módulos por funcionalidad.
 *  Este archivo se carga tras js/state.js y completa el objeto App con
 *  Object.assign (los scripts son clásicos por compatibilidad webxdc).
 * ===================================================================== */

'use strict';

Object.assign(App, {
    /* ============================================================
     *  Inicialización
     * ============================================================ */
    async init() {
      // init() NO es idempotente: cablea listeners globales en
      // wireEvents(). Si el arranque se dispara dos veces en el mismo
      // contexto (el cliente WebXDC puede re-evaluar main.js o reemitir
      // DOMContentLoaded), cada botón queda con el listener duplicado y
      // los de tipo «interruptor» se anulan a sí mismos: un toque en
      // play/pausa reproducía y pausaba a la vez, y el de pantalla
      // completa de Letras entraba y salía en el mismo clic. Por eso el
      // usuario veía ambos botones «muertos». Una sola pasada, siempre.
      if (this._initStarted) return;
      this._initStarted = true;
      this.tracks = [];
      this.audio = document.getElementById('audioEl');
      this.audio.volume = this.volume;

      this.buildEqualizer();
      /* Sin llamada a renderPickTracks: el selector de pistas
     * que pintaba aquí ya no existe. */

      // Cargar tema guardado antes que nada
      this.loadTheme();

      // Cargar idioma guardado
      this.loadLang();

      // Cargar datos persistentes (IndexedDB + localStorage)
      await this.loadAllFromStorage();
      this.loadFavorites();
      this.loadStats();

      // Restaurar sesión (cola, pista actual, posición, shuffle, repeat)
      const restored = await this.restoreSession();

      // Si la sesión guardada apuntaba a una lista que ya no está,
      // volver a la biblioteca para no mostrar un contexto fantasma
      // en la barra («Reproduciendo desde…»).
      this.sanitizePlayContext();

      if (!restored) {
        this.queue = this.tracks.map(t => t.id);
        this.queueIdx = 0;
        this.currentTrackIdx = 0;
        this.currentTrack = this.tracks[0] || null;
      }

      this.wireEvents();
      this.wireGestures();
      this.renderPlaylists();
      if (typeof this.renderHome === 'function') this.renderHome();
      this.showView('home');
      this.setNavActive('home');

      if (this.currentTrack) {
        if (typeof this.restoreLyricsPrefs === 'function') this.restoreLyricsPrefs();
        this.renderCurrentTrack();
        this.renderLyrics();
        this.updateMediaSession();
        this.hideEmptyState();
      }
      this.setShuffleUI();
      this.setRepeatUI();
      if (typeof this.updateLrcOffsetUI === 'function') this.updateLrcOffsetUI();
      if (typeof this.updateChrome === 'function') this.updateChrome();

      // Guardar sesión cada 5 s. saveSession() deduplica: no escribe si
      // nada cambió y está en pausa. Se guarda el id para poder limpiarlo.
      if (this._sessionTimer) clearInterval(this._sessionTimer);
      this._sessionTimer = setInterval(() => {
        if (document.visibilityState === 'hidden') return;
        this.saveSession();
      }, 5000);
      // Persistir una última vez al ocultar/cerrar y liberar objectURLs.
      this._onPageHide = (e) => {
        // En bfcache (pagehide persisted=true) NO revocar: al volver atrás
        // los objectURL deben seguir vivos.
        if (e && e.type === 'pagehide' && e.persisted) return;
        // Un borrado con «Deshacer» pendiente no debe sobrevivir al cierre:
        // si se cierra la app, se confirma para que la pista/lista no
        // reaparezca al volver a abrirla.
        try { if (this._pendingTrackDelete) this._commitPendingTrackDelete(); } catch (err) {}
        try { if (this._pendingPlaylistDelete) this._commitPendingPlaylistDelete(); } catch (err) {}
        //  vaciar los segundos escuchados aún no guardados
        // (el flush es cada 10 s: cerrar perdía el último tramo).
        try { if (this._currentPlayStart && typeof this._flushListening === 'function') this._flushListening(); } catch (err) {}
        try { this.saveSession(); } catch (err) {}
        try { this.releaseAllUrls(); } catch (err) {}
      };
      window.addEventListener('pagehide', this._onPageHide);
      window.addEventListener('beforeunload', this._onPageHide);

      // Aplicar idioma a todos los textos estáticos del DOM
      this.applyLang();
      this.buildLangList();

      // Sincronizar visibilidad de acciones contextuales del menú "Más"
      // según haya o no pista cargada (estado vacío inicial).
      this.updatePlayUI();

      this.loadPlaybackSettings();
      this.syncPlaybackSettingsUI();
      // Versión siempre desde App.VERSION (evita el 1.1.1 hardcodeado en HTML)
      const aboutVer = document.getElementById('aboutVersion');
      if (aboutVer) aboutVer.textContent = this.VERSION;
      if (typeof this.syncDesktopLayout === 'function') this.syncDesktopLayout();
      // Cargar preferencias de visualizador y preservación de tono
      try {
        const savedPitch = localStorage.getItem('aurora_preserves_pitch');
        this.preservesPitch = savedPitch !== 'false';
      } catch (e) {
        this.preservesPitch = true;
      }
      this.setPreservesPitch(this.preservesPitch);
      if (typeof this.initVisualizer === 'function') this.initVisualizer();
      // Ya no hay historial de reproducción (ni hoja ni registro):
      // el de búsquedas es otra cosa y se queda.
      this.loadSearchHistory();

      document.querySelectorAll('.sheet').forEach(s => s.setAttribute('aria-hidden', 'true'));

      //  releer SOLO las pistas a las que les falta algo. La
      // condición anterior incluía «sin letra»: como casi ninguna
      // canción trae letra, el retag corría en cada arranque y
      // releía la biblioteca entera para no cambiar nada.
      const needsRetag = this.tracks.some(t =>
        typeof this._trackNeedsRetag === 'function' && this._trackNeedsRetag(t));
      if (needsRetag) {
        this.retagExistingTracks({ silent: true, onlyIncomplete: true }).catch(() => {});
      }

      if (typeof this.maybeShowBackgroundNotice === 'function') this.maybeShowBackgroundNotice();

      this._initialized = true;
      document.dispatchEvent(new CustomEvent('aurora:ready', { detail: { tracks: this.tracks.length } }));
      console.log('[Aurora] App inicializada ·', this.tracks.length, 'pistas', restored ? '· sesión restaurada' : '');
    },

    /* Consejo de primer arranque en Delta Chat nativo: el webxdc vive en
     * su propia actividad y sigue sonando al pulsar inicio, pero el botón
     * atrás la destruye y detiene la música. Una sola vez y sin tapar
     * otros avisos (reintenta si hay un sheet abierto). */
    maybeShowBackgroundNotice() {
      try {
        const native = !!(window.webxdc && !window.webxdc._isStub);
        if (!native) return;
        if (localStorage.getItem('aurora_bg_notice') === '1') return;
        const attempt = (left) => {
          if (document.querySelector('.sheet.open')) {
            if (left > 0) setTimeout(() => attempt(left - 1), 1000);
            return;
          }
          try { localStorage.setItem('aurora_bg_notice', '1'); } catch (e) {}
          this.showConfirm({
            message: this.t('bg_notice_text'),
            okLabel: this.t('bg_notice_ok'),
            danger: false,
            hideCancel: true
          }).catch(() => {});
        };
        setTimeout(() => attempt(8), 700);
      } catch (e) {}
    },

    /* ============================================================
     *  Carga desde IndexedDB + localStorage
     * ============================================================ */
    async loadAllFromStorage() {
      // Pedir almacenamiento persistente: evita que el sistema borre la
      // biblioteca solo por falta de espacio (orígenes «best-effort»).
      try {
        if (navigator.storage && typeof navigator.storage.persist === 'function') {
          navigator.storage.persist().then((g) => { this._storagePersisted = !!g; }).catch(() => {});
        }
      } catch (e) {}
      this._storageOk = true;
      try {
        // Tracks
        if (!window.AuroraStorage) throw new Error('IndexedDB no disponible');
        const stored = await window.AuroraStorage.getAllTracks();
        //  nada de crear un objectURL por pista al arrancar
        // (miles de URLs vivas antes de escuchar nada): getTrackUrl
        // lo crea perezosamente al reproducir/compartir y lo cachea.
        this.tracks = stored.map(t => {
          //  los registros guardados antes de esta corrección
          // pueden traer el objectURL de la sesión en que se
          // guardaron: está muerto, fuera (getTrackUrl acuñará uno
          // nuevo desde el blob al reproducir).
          if (t && typeof t.src === 'string' && t.src.indexOf('blob:') === 0) delete t.src;
          if (!t.addedAt) t.addedAt = 0;
          return t;
        });
        this.tracks.forEach((t, i) => {
          if (!t.addedAt) t.addedAt = i + 1;
        });
        this.invalidateTrackIndex();
      } catch (e) {
        console.warn('[Aurora] Error cargando pistas:', e);
        this.tracks = [];
        this._storageOk = false;
      }
      // Refrescar el marcador «la biblioteca tenía N pistas» (solo si hay):
      // en el próximo arranque, 0 pistas + marcador > 0 = posible pérdida.
      if (this.tracks.length > 0 && typeof this.syncLibCountMarker === 'function') {
        this.syncLibCountMarker();
      }

      // Playlists (IndexedDB). No hay ninguna lista predefinida: la
      // biblioteca arranca con cero listas y el usuario crea las que quiera.
      try {
        const pls = await window.AuroraStorage.getAllPlaylists();
        this.playlists = Array.isArray(pls) ? pls : [];
        this.playlists.forEach(pl => {
          if (pl && pl.coverArt && !pl._coverCache) {
            pl._coverCache = pl.coverArt;
            pl._coverCacheHash = pl.coverArtHash || null;
          }
        });
      } catch (e) {
        this.playlists = [];
      }

      this._settlePlaylists();
      // «Mi Música»: la lista automática donde viven las canciones
      // agregadas fuera de cualquier lista (ver migrateMiMusica).
      this.migrateMiMusica();
    },

    /* «Mi Música» (id fijo 'mi-musica') es la lista automática de la
 * casa: recoge las canciones que se agregan fuera de cualquier
 * lista concreta. Modelo (decisión del usuario, que revierte la
 * retirada anterior de esta lista):
 * - Al importar sin lista destino, las canciones entran en
 * ella; si no existe, se crea SOLO con las de esa importación
 * (antes se sembraba con toda la biblioteca y se colaban las
 * canciones de las demás listas: fallo reportado,).
 * - Al arrancar se reconstruye solo si falta, y se siembra con
 * las canciones que no viven en ninguna otra lista — es lo
 * que «agregadas fuera de una lista» puede saberse sin
 * guardar la procedencia de cada pista. Si no hay ninguna,
 * no nace vacía: aparecerá con la primera importación suelta.
 * - Si el usuario la borra a propósito, NO se resucita al
 * arrancar: queda la marca 'aurora_mimusica_removed' y solo
 * vuelve cuando agregue otra canción fuera de una lista.
 * La lista solo agrupa: quitar una canción de ella no la borra de
 * la biblioteca, como en cualquier otra lista. */
    migrateMiMusica() {
      const ID = 'mi-musica';
      this.playlists.forEach(p => {
        if (p && p.isDefault) {
          p.isDefault = false;
          this.persistPlaylist(p);
        }
      });
      const exists = this.playlists.some(p => p && p.id === ID);
      if (exists || !this.tracks.length) return;
      let removed = false;
      try { removed = localStorage.getItem('aurora_mimusica_removed') === '1'; } catch (e) {}
      if (removed) return;
      //  si ya hay listas del usuario, no sembrar en frío al
      // arrancar: las «sueltas» suelen serlo por haber vaciado o
      // borrado una lista, y ver nacer una lista nueva al abrir la
      // app se vivía como «la app creó una lista sola al quitar
      // una canción». Sin ninguna otra lista (biblioteca nueva o
      // migrada), todo es suelto y la siembra es la esperada; con
      // listas, «Mi Música» nace en contexto, al importar sin
      // lista destino (_ensureMiMusica), no por sorpresa.
      if (this.playlists.some(p => p && p.id !== ID)) return;
      // Canciones «sueltas»: en la biblioteca pero en ninguna lista
      // del usuario. Las de otras listas NO entran.
      const enListas = new Set();
      this.playlists.forEach(p => {
        if (p && p.id !== ID && Array.isArray(p.trackIds)) {
          p.trackIds.forEach(id => enListas.add(id));
        }
      });
      const sueltas = this.tracks.map(t => t.id).filter(id => !enListas.has(id));
      if (sueltas.length) this._createMiMusica(sueltas);
    },

    _createMiMusica(trackIds) {
      const pl = {
        id: 'mi-musica',
        name: 'Mi Música',
        description: '',
        trackIds: [...new Set((trackIds || []).filter(Boolean))]
      };
      this.playlists.unshift(pl);
      this.persistPlaylist(pl);
      try { localStorage.removeItem('aurora_mimusica_removed'); } catch (e) {}
      return pl;
    },

    /* Garantiza que «Mi Música» existe y contiene los ids dados.
 * Al crearla entran SOLO esos ids (los de la importación que la
 * provoca): sembrarla con toda la biblioteca colaba las
 * canciones de las demás listas. Y sin ids no se
 * materializa una lista vacía por una importación fallida. */
    _ensureMiMusica(extraIds) {
      const pl = this.playlists.find(p => p && p.id === 'mi-musica');
      if (!pl) {
        const seed = [...new Set((extraIds || []).filter(Boolean))];
        return seed.length ? this._createMiMusica(seed) : null;
      }
      let changed = false;
      for (const id of extraIds || []) {
        if (id && !pl.trackIds.includes(id)) {
          pl.trackIds.push(id);
          changed = true;
        }
      }
      if (changed) {
        if (typeof this._invalidatePlaylistCover === 'function') this._invalidatePlaylistCover(pl);
        this.persistPlaylist(pl);
      }
      return pl;
    },

    /* Si el contexto guardado apunta a una lista que no existe, se
     * degrada a «biblioteca». Evita etiquetas fantasma tras migrar. */
    sanitizePlayContext() {
      const ctx = this.playContext;
      if (!ctx || ctx.type !== 'playlist') return;
      if (!this.playlists.some(p => p && p.id === ctx.id)) {
        this.playContext = { type: 'all' };
      }
    },

    async persistTrack(track) {
      try {
        // Guardamos el File en el track para poder reconstruir el objectURL después
        const toSave = Object.assign({}, track);
        //  nunca persistir el objectURL: es de sesión y al
        // reabrir la app sería una URL muerta (fallo de «no se
        // puede reproducir» en cadena tras).
        delete toSave.src;
        //  tampoco los campos de trabajo de la sesión —
        // _lrcCache guarda la letra YA parseada (la letra quedaba
        // dos veces en IndexedDB) y las banderas de miniatura,
        // al volver marcadas, bloqueaban regenerarlas. Ojo:
        // _tagsChecked SÍ persiste a propósito.
        delete toSave._lrcCache;
        delete toSave._lrcCacheKey;
        delete toSave._thumbsHiRes;
        delete toSave._thumbing;
        delete toSave._thumbsDirty;
        if (track._file) {
          toSave.fileBlob = track._file;  // IndexedDB guarda Blobs directamente
          delete toSave._file;
        }
        await window.AuroraStorage.putTrack(toSave);
        return true;
      } catch (e) {
        console.warn('[Aurora] No se pudo guardar pista:', e);
        if (this._isQuotaError(e)) {
          this.toast(this.t('toast_storage_full'));
          if (typeof this.offerFreeStorage === 'function') this.offerFreeStorage();
        }
        return false;
      }
    },

    _isQuotaError(e) {
      if (!e) return false;
      return e.name === 'QuotaExceededError' || e.code === 22 || e.code === 1014;
    },

    async deleteTrackFromStorage(trackId) {
      //  el fallo no se traga en silencio (borrado fantasma).
      try { await window.AuroraStorage.deleteTrack(trackId); }
      catch (e) { console.warn('[Aurora] No se pudo borrar la pista de IndexedDB:', e); }
    },

    async persistPlaylist(pl) {
      try {
        const toSave = {
          id: pl.id,
          name: pl.name,
          description: pl.description || '',
          trackIds: Array.isArray(pl.trackIds) ? pl.trackIds.slice() : [],
          cover: pl.cover || null,
          coverArt: pl.coverArt || pl._coverCache || null,
          coverArtHash: pl.coverArtHash || pl._coverCacheHash || null,
          //  sin esto, la ordenación elegida se perdía al cerrar.
          sort: pl.sort || null
        };
        await window.AuroraStorage.putPlaylist(toSave);
      } catch (e) {
        console.warn('[Aurora] No se pudo guardar playlist:', e);
        //  mismo aviso de cuota que persistTrack — antes la
        // lista se perdía en silencio al cerrar la app.
        if (this._isQuotaError(e)) {
          this.toast(this.t('toast_storage_full'));
          if (typeof this.offerFreeStorage === 'function') this.offerFreeStorage();
        }
      }
    },

    async deletePlaylistFromStorage(id) {
      //  ídem deleteTrackFromStorage — con diagnóstico.
      try { await window.AuroraStorage.deletePlaylist(id); }
      catch (e) { console.warn('[Aurora] No se pudo borrar la lista de IndexedDB:', e); }
    },

    /* ===== Compat: loadPlaylists ahora usa IndexedDB ===== */
    async loadPlaylists() {
      // Mantenido para el test #14 (que llama a loadPlaylists)
      try {
        const pls = await window.AuroraStorage.getAllPlaylists();
        this.playlists = Array.isArray(pls) ? pls : [];
        this.playlists.forEach(pl => {
          if (pl && pl.coverArt && !pl._coverCache) {
            pl._coverCache = pl.coverArt;
            pl._coverCacheHash = pl.coverArtHash || null;
          }
        });
        this._settlePlaylists();
        this.migrateMiMusica();
      } catch (e) {
        this.playlists = [];
      }
    },

    /*  saneamiento de las listas al cargarlas.
 * - La lista heredada con id «favoritos» desaparece de Listas
 * (también del almacenamiento): los favoritos viven solo en
 * su vista y los corazones no se tocan.
 * - Las listas inteligentes se materializan: la regla se
 * convierte en trackIds con las canciones que elige HOY y
 * la lista queda normal para siempre. */
    /* (endurecimiento): esta normalización corre sobre datos
 * guardados por versiones anteriores, que no controlamos. Cada
 * lista se trata AISLADA: si su conversión o su guardado
 * fallan, esa lista queda intacta tal como venía y el
 * arranque sigue con las demás — un dato raro heredado jamás
 * debe poder interrumpir la carga de la biblioteca. */
    _settlePlaylists() {
      if (!Array.isArray(this.playlists)) return;
      try {
        this.playlists = this.playlists.filter(pl => {
          if (pl && pl.id === 'favoritos') {
            try {
              if (typeof this.deletePlaylistFromStorage === 'function') this.deletePlaylistFromStorage(pl.id);
            } catch (e) { /* manda lo de memoria; el disco se reintentará al próximo arranque */ }
            return false;
          }
          return !!pl;
        });
        this.playlists.forEach(pl => {
          if (!(pl && pl.smart)) return;
          try {
            // Se calcula ANTES de tocar la lista: si la regla
            // heredada es rara y falla, `pl` queda como estaba.
            const ids = this._legacySmartTracks(pl).map(t => t.id);
            pl.trackIds = ids;
            delete pl.smart;
            this.persistPlaylist(pl);
          } catch (e) {
            // Lista heredada rara: se deja tal cual venía y se
            // continúa con el resto; nunca se propaga el error.
          }
        });
      } catch (e) {
        // Red exterior: normalizar es opcional; cargar, no.
      }
    },

    /*  qué canciones elige HOY la regla de una lista
 * inteligente heredada. Es el antiguo motor de reglas,
 * reducido a esta migración: se ejecuta solo para listas
 * guardadas por versiones anteriores y, una vez
 * materializadas, nunca más. */
    _legacySmartTracks(pl) {
      const rule = pl.smart || {};
      const plays = (this.stats && this.stats.plays) || {};
      let base;
      switch (rule.kind) {
        case 'rating':
          base = this.tracks.filter(t => this._ratingOf(t) >= 4);
          break;
        case 'genre': {
          const g = String(rule.genre || '').trim().toLocaleLowerCase();
          base = this.tracks.filter(t => String(t.genre || '').trim().toLocaleLowerCase() === g);
          break;
        }
        case 'never':
          base = this.tracks.filter(t => !(plays[t.id] > 0));
          break;
        case 'recent': {
          const since = Date.now() - 30 * 24 * 3600 * 1000;
          base = this.tracks.filter(t => (t.addedAt || 0) >= since);
          break;
        }
        case 'forgotten': {
          const since = Date.now() - 90 * 24 * 3600 * 1000;
          base = this.tracks.filter(t => (plays[t.id] > 0) && !(t.lastPlayedAt > since));
          break;
        }
        case 'top':
          base = this.getTopTracks(50).map(x => x.track);
          break;
        default:
          base = [];
      }
      const mode = pl.sort || 'stars';
      if (rule.kind === 'top' && (mode === 'stars' || mode === 'added')) return base;
      return this.sortTracksBy(base, mode);
    },

    async loadFavorites() {
      // #3 Persistencia robusta: IndexedDB primero, localStorage como fallback
      try {
        const stored = await window.AuroraStorage.getSetting('favorites');
        if (stored && Array.isArray(stored)) {
          this.favorites = new Set(stored);
        } else {
          const raw = localStorage.getItem('aurora_favs');
          if (raw) this.favorites = new Set(JSON.parse(raw));
        }
      } catch (e) {
        try {
          const raw = localStorage.getItem('aurora_favs');
          if (raw) this.favorites = new Set(JSON.parse(raw));
        } catch (e2) {}
      }
    },
    async saveFavorites() {
      try {
        const arr = [...this.favorites];
        await window.AuroraStorage.setSetting('favorites', arr);
        localStorage.setItem('aurora_favs', JSON.stringify(arr));
      } catch (e) {}
    },
});
