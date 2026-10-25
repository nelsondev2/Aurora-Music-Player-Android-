/* =====================================================================
 *  js/settings.js — Aurora Music Player
 *  Sesión · estadísticas núcleo · temas · i18n
 *
 *  Parte del refactor (C) de app.js: mismo código, módulos por funcionalidad.
 *  Este archivo se carga tras js/state.js y completa el objeto App con
 *  Object.assign (los scripts son clásicos por compatibilidad webxdc).
 * ===================================================================== */

'use strict';

Object.assign(App, {
    /* ============================================================
     *  Persistencia de sesión (#5)
     * ============================================================ */
    async saveSession() {
      try {
        // Deduplicación: el intervalo de 5 s corre siempre, pero solo se
        // escribe en IndexedDB si algo cambió (evita desgaste y bloqueos
        // de la transacción en móviles). La posición se redondea a 2 s.
        const t = this.currentTrack;
        const session = {
          currentTrackId: t?.id || null,
          currentTrackTitle: t?.title || null,
          currentTrackArtist: t?.artist || null,
          currentTrackAlbum: t?.album || null,
          currentTrackCover: this._coverForSession(t),
          currentTrackCoverIsImage: t?.coverIsImage || false,
          currentTrackDuration: t?.duration || 0,
          currentTrackLrc: t?.lrc || null,
          // Copias, no referencias: la sesión debe ser una foto del
          // instante, no un alias que siga mutando con la cola viva.
          queue: Array.isArray(this.queue) ? this.queue.slice() : [],
          queueIdx: this.queueIdx,
          currentTime: this.audio?.currentTime || 0,
          shuffle: this.shuffle,
          repeat: this.repeat,
          playContext: this.playContext,
          originalQueue: Array.isArray(this._originalQueue) ? this._originalQueue.slice() : null,
          ts: Date.now()
        };
        const fingerprint = JSON.stringify(Object.assign({}, session, {
          currentTime: Math.round((session.currentTime || 0) / 2) * 2,
          ts: 0
        }));
        if (fingerprint === this._lastSessionFingerprint && !this.isPlaying) return;
        this._lastSessionFingerprint = fingerprint;
        /* Espejo síncrono de emergencia: al cerrar la WebView, la escritura
         * asíncrona en IndexedDB puede no completarse. localStorage guarda
         * la misma foto al instante y restoreSession() elige la más nueva.
         * Si la cuota no lo admite, IndexedDB sigue siendo la vía principal. */
        try { localStorage.setItem('aurora_session_v1', JSON.stringify(session)); } catch (e) {}
        await window.AuroraStorage.setSetting('session', session);
      } catch (e) {}
    },

    /* La sesión se guarda cada 5 s: nunca persistir la portada original
     * (puede ser un dataURL de MBs). Solo degradado o miniatura. */
    _coverForSession(t) {
      if (!t) return null;
      if (t.customCover) return t.customCover.lg || t.customCover.thumb || null;
      if (!t.cover) return null;
      if (typeof t.cover === 'object') return t.cover;
      return t.coverThumbLg || t.coverThumb || null;
    },

    async restoreSession() {
      try {
        if (!window.AuroraStorage) return false;
        let session = await window.AuroraStorage.getSetting('session');
        /* El espejo síncrono puede ser más reciente que IndexedDB si la
         * app se cerró a mitad de una escritura asíncrona. Gana el mayor ts. */
        try {
          const rawMirror = localStorage.getItem('aurora_session_v1');
          const mirror = rawMirror ? JSON.parse(rawMirror) : null;
          if (mirror && typeof mirror === 'object' &&
              Number(mirror.ts || 0) > Number((session && session.ts) || 0)) {
            session = mirror;
          }
        } catch (e) {}
        if (!session || typeof session !== 'object' || !session.currentTrackId) return false;
        // Verificar que la pista todavía existe
        const trackIdx = this.tracks.findIndex(t => t.id === session.currentTrackId);
        if (trackIdx < 0) return false;
        // Restaurar estado
        this.currentTrackIdx = trackIdx;
        this.currentTrack = this.tracks[trackIdx];
        // Filtrar solo ids inexistentes. Los duplicados se conservan:
        // una cola puede contener legítimamente la misma canción dos
        // veces, y deduplicarla al reabrir cambiaba lo que iba a sonar.
        const known = new Set(this.tracks.map(t => t.id));
        const restoredQueue = Array.isArray(session.queue) ? session.queue : [];
        this.queue = restoredQueue.filter(id => known.has(id));
        if (this.queue.length === 0) {
          this.queue = this.tracks.map(t => t.id);
        }
        // Con duplicados, indexOf() acertaría la primera copia aunque la
        // sesión se guardara en la segunda: se respeta queueIdx si apunta
        // a la pista actual, y solo entonces se busca la primera copia.
        const savedIdx = Number(session.queueIdx);
        if (Number.isInteger(savedIdx) && this.queue[savedIdx] === session.currentTrackId) {
          this.queueIdx = savedIdx;
        } else {
          const qIdx = this.queue.indexOf(session.currentTrackId);
          this.queueIdx = qIdx >= 0 ? qIdx : 0;
        }
        this.shuffle = !!session.shuffle;
        this.repeat = session.repeat || 'off';
        if (this.shuffle && Array.isArray(session.originalQueue) && session.originalQueue.length) {
          this._originalQueue = session.originalQueue.filter(id => this.trackMap().has(id));
        } else {
          this._originalQueue = null;
        }
        // playContext se usa para decidir la cola y se pinta en la barra:
        // aceptar solo formas conocidas evita objetos arbitrarios de datos guardados.
        const allowedCtx = ['all', 'queue', 'playlist', 'favorites', 'album', 'artist', 'radio'];
        if (session.playContext && typeof session.playContext === 'object' && allowedCtx.includes(session.playContext.type)) {
          this.playContext = {
            type: session.playContext.type,
            id: typeof session.playContext.id === 'string' ? session.playContext.id : undefined,
            name: typeof session.playContext.name === 'string' ? session.playContext.name.slice(0, 200) : undefined,
            artist: typeof session.playContext.artist === 'string' ? session.playContext.artist.slice(0, 200) : undefined
          };
        }

        // Cargar la pista en el audio SIN reproducir (el usuario debe tocar
        // play). Se resuelve la URL con getTrackUrl(): asignar
        // currentTrack.src a ciegas convertía las pistas restauradas de
        // una copia (sin blob todavía) en la URL literal «undefined».
        const restoreUrl = typeof this.getTrackUrl === 'function'
          ? this.getTrackUrl(this.currentTrack)
          : (this.currentTrack && this.currentTrack.src) || null;
        if (this.audio) {
          if (restoreUrl) {
            this.audio.src = restoreUrl;
            this.audio.load();
            // Restaurar posición cuando los metadatos carguen
            const restoreTime = Number(session.currentTime) || 0;
            const onMeta = () => {
              try {
                if (restoreTime > 0 && restoreTime < (this.audio.duration || 0)) {
                  this.audio.currentTime = restoreTime;
                }
              } catch (e) {}
              this.updateProgress();
              this.audio.removeEventListener('loadedmetadata', onMeta);
            };
            this.audio.addEventListener('loadedmetadata', onMeta);
          } else {
            // Sin audio enlazado: el elemento queda limpio y en pausa;
            // loadAndPlay() avisará y saltará al reproducir.
            try { this.audio.removeAttribute('src'); this.audio.load(); } catch (e) {}
          }
        }

        return true;
      } catch (e) {
        console.warn('[Aurora] Error restaurando sesión:', e);
        return false;
      }
    },

    /* ============================================================
     *  Estadísticas de reproducción (#13)
     * ============================================================ */
    async loadStats() {
      // #3 Persistencia robusta: intentar IndexedDB primero, fallback a localStorage
      try {
        const stored = await window.AuroraStorage.getSetting('stats');
        if (stored) {
          this.stats = stored;
        } else {
          const raw = localStorage.getItem('aurora_stats');
          if (raw) this.stats = JSON.parse(raw);
        }
      } catch (e) {
        try {
          const raw = localStorage.getItem('aurora_stats');
          if (raw) this.stats = JSON.parse(raw);
        } catch (e2) {}
      }
      this._normalizeStats();
    },

    /*  validar la FORMA de las estadísticas vengan de donde
 * vengan (IndexedDB o fallback): corruptas (un número, una
 * lista, plays que no es objeto) se colaban tal cual y luego
 * cada conteo sumaba NaN o lanzaba hasta parar la música. */
    _normalizeStats() {
      if (!this.stats || typeof this.stats !== 'object' || Array.isArray(this.stats)) {
        this.stats = { plays: {}, skips: {}, totalSeconds: 0 };
      }
      if (!this.stats.plays || typeof this.stats.plays !== 'object' || Array.isArray(this.stats.plays)) this.stats.plays = {};
      if (!this.stats.skips || typeof this.stats.skips !== 'object' || Array.isArray(this.stats.skips)) this.stats.skips = {};
      if (typeof this.stats.totalSeconds !== 'number' || !isFinite(this.stats.totalSeconds) || this.stats.totalSeconds < 0) this.stats.totalSeconds = 0;
    },
    async saveStats() {
      try {
        this.stats.lastPlayed = new Date().toISOString();
        await window.AuroraStorage.setSetting('stats', this.stats);
        // También en localStorage como respaldo
        localStorage.setItem('aurora_stats', JSON.stringify(this.stats));
      } catch (e) {}
    },

    /* Reiniciar estadísticas de reproducción */
    async resetStats() {
      this.stats = {
        plays: {},
        skips: {},
        totalSeconds: 0,
        lastPlayed: null,
        sessionStart: Date.now()
      };
      await this.saveStats();
      if (typeof this.renderStats === 'function') this.renderStats();
      this.toast(this.t('stats_reset_toast'));
    },

    /* Registrar que una pista empezó a sonar */
    trackPlayStarted() {
      this._currentPlayStart = Date.now();
      this._currentPlayBaseTime = this.audio.currentTime || 0;
      // El contador de reproducciones ya NO suma al empezar:
      // una canción solo cuenta cuando suena entera. Aquí empieza
      // su «pase» de conteo; lo cierra trackPlayCompleted().
      this._playCounted = false;
      this._skipCounted = false; //  un salto por pase, como el conteo
      // Iniciar flush periódico de tiempo escuchado
      if (this._statsFlushTimer) clearInterval(this._statsFlushTimer);
      this._statsWallBase = Date.now(); //  reloj de pared del flush
      this._statsFlushTimer = setInterval(() => {
        if (this.isPlaying && this.audio) this._flushListening();
      }, 10000);  // cada 10s
    },

    /*  vacía los segundos escuchados desde la última base.
 * Techo de cordura: nunca contar más que el tiempo real
 * transcurrido (× velocidad de reproducción + margen). Sin
 * él, un salto de currentTime (seek no interceptado, pestaña
 * congelada que despierta) inflaba el «tiempo escuchado». */
    _flushListening() {
      if (!this._currentPlayStart || !this.audio) return;
      const now = Date.now();
      const heard = (this.audio.currentTime || 0) - (this._currentPlayBaseTime || 0);
      const wall = this._statsWallBase ? (now - this._statsWallBase) / 1000 : 0;
      const cap = wall > 0 ? wall * (this.audio.playbackRate || 1) + 2 : heard;
      const add = Math.max(0, Math.min(heard, cap));
      this._currentPlayBaseTime = this.audio.currentTime || 0;
      this._statsWallBase = now;
      if (add > 0) {
        this.stats.totalSeconds += add;
        this.saveStats();
      }
    },

    /* Registrar que la pista sonó ENTERA: el único sitio donde
 * suma el contador de reproducciones. Lo llaman el avance
 * automático al terminar (fin natural o fundido, vía next(true))
 * y el salto gapless al cambiar de pista; nunca un salto manual
 * ni un archivo que falla al cargar. Una escucha por pase: el
 * candado _playCounted lo pone trackPlayStarted (o el propio
 * gapless para la pista entrante). */
    trackPlayCompleted() {
      if (!this.currentTrack || this._playCounted) return;
      if (!this._heardWholeTrack()) return;
      this._playCounted = true;
      const id = this.currentTrack.id;
      this.stats.plays[id] = (this.stats.plays[id] || 0) + 1;
      //  fecha de última escucha completa en la propia pista:
      // alimenta «Olvidadas» y la lista inteligente homónima.
      this.currentTrack.lastPlayedAt = Date.now();
      if (typeof this.persistTrack === 'function') {
        try { this.persistTrack(this.currentTrack); } catch (e) {}
      }
      this.saveStats();
    },

    /*  registrar un salto: el usuario abandona la pista a mitad
 * (next/prev manual o elige otra). No cuenta si ya sonó entera
 * (eso es una reproducción,), si se buscaron los últimos
 * segundos a mano, ni dos veces en el mismo pase. Hace falta
 * haber oído un mínimo (5 s o el 10 %): cambiar de opinión al
 * instante no es «saltarla», es no haberla empezado. */
    _registerSkip() {
      if (!this.currentTrack || !this.isPlaying || this._skipCounted || this._playCounted) return;
      if (typeof this._heardWholeTrack === 'function' && this._heardWholeTrack()) return;
      const a = this.audio;
      const pos = a ? (a.currentTime || 0) : 0;
      const dur = a ? a.duration : 0;
      const minimo = Math.max(5, (isFinite(dur) && dur > 0) ? dur * 0.1 : 5);
      if (pos < minimo) return;
      this._skipCounted = true;
      if (!this.stats.skips) this.stats.skips = {};
      const id = this.currentTrack.id;
      this.stats.skips[id] = (this.stats.skips[id] || 0) + 1;
      this.saveStats();
    },

    /* ¿Se ha oído (casi) toda la pista actual? La unión de los
     * intervalos realmente reproducidos (audio.played) lo sabe pese
     * a pausas y búsquedas; buscar hasta el final a mano NO cuenta
     * como escucha completa. Sin duración conocida (p. ej. al
     * principio de cargar), vale la llegada al final. Se perdonan
     * los últimos 2 s (silencios de cierre y el corte gapless). */
    _heardWholeTrack() {
      const a = this.audio;
      if (!a) return false;
      const dur = a.duration;
      if (!isFinite(dur) || dur <= 0) return true;
      let heard = 0;
      try {
        const played = a.played;
        const iv = [];
        for (let i = 0; i < played.length; i++) iv.push([played.start(i), played.end(i)]);
        iv.sort((x, y) => x[0] - y[0]);
        let cs = null, ce = null;
        for (const [ini, fin] of iv) {
          if (cs === null) { cs = ini; ce = fin; }
          else if (ini <= ce) { ce = Math.max(ce, fin); }
          else { heard += ce - cs; cs = ini; ce = fin; }
        }
        if (cs !== null) heard += ce - cs;
      } catch (e) { return true; }
      return heard >= Math.max(0, dur - 2);
    },

    trackPlayStopped() {
      if (this._statsFlushTimer) {
        clearInterval(this._statsFlushTimer);
        this._statsFlushTimer = null;
      }
      // Última actualización (: con el mismo techo que el flush)
      this._flushListening();
      this._currentPlayStart = null;
    },

    /* Devuelve las N pistas más reproducidas */
    getTopTracks(n = 10) {
      if (!this.stats || !this.stats.plays) return [];
      return Object.entries(this.stats.plays)
        .map(([id, count]) => ({ track: this.getTrackById ? this.getTrackById(id) : this.tracks.find(t => t.id === id), count: Number(count) || 0 }))
        .filter(x => x.track)
        .sort((a, b) => b.count - a.count)
        .slice(0, n);
    },

    /* Devuelve el artista más escuchado */
    getTopArtists(n = 5) {
      const artistCounts = {};
      if (!this.stats || !this.stats.plays) return [];
      Object.entries(this.stats.plays).forEach(([id, count]) => {
        const t = this.getTrackById ? this.getTrackById(id) : this.tracks.find(x => x.id === id);
        if (t) artistCounts[t.artist] = (artistCounts[t.artist] || 0) + (Number(count) || 0);
      });
      return Object.entries(artistCounts)
        .map(([artist, count]) => ({ artist, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, n);
    },

    fmtDuration(s) {
      s = Number(s);
      if (!isFinite(s) || s < 0) s = 0;
      s = Math.floor(s);
      const h = Math.floor(s / 3600);
      const m = Math.floor((s % 3600) / 60);
      const sec = s % 60;
      if (h > 0) return h + 'h ' + m + 'm';
      if (m > 0) return m + 'm ' + sec + 's';
      return sec + 's';
    },

    /* ============================================================
     *  Temas personalizables (#11)
     * ============================================================ */
    THEMES: {
      // «Sistema» no tiene paleta propia: applyTheme() resuelve la
      // preferencia real con prefers-color-scheme y usa dark o light.
      // Tener la clave aquí permite guardarla y validarla como el resto.
      system: { system: true },
      dark: {
        bg0: '#050509', bg1: '#0a0a12', bg2: '#14141f', bg3: '#1d1d2b',
        text1: '#ffffff',
        text2: 'rgba(255,255,255,0.72)',
        /*  0.58 como en el CSS — applyTheme pisa la
 * variable con este valor, así que el 0,48 de aquí dejaba
 * el ajuste de contraste del CSS en papel mojado. */
        text3: 'rgba(255,255,255,0.58)',
        text4: 'rgba(255,255,255,0.36)',
        surface: 'rgba(255,255,255,0.05)',
        surface2: 'rgba(255,255,255,0.08)',
        surfaceHi: 'rgba(255,255,255,0.12)',
        border: 'rgba(255,255,255,0.08)',
        blurBg: 'rgba(10, 10, 18, 0.85)',
        toastBg: 'rgba(20, 20, 30, 0.95)',
        toastText: '#ffffff',
        danger: '#E85A5A'
      },
      light: {
        bg0: '#F4F1EA', bg1: '#FFFCF7', bg2: '#EBE6DC', bg3: '#E0D9CC',
        text1: '#1A1612',
        text2: 'rgba(26,22,18,0.72)',
        text3: 'rgba(26,22,18,0.64)',
        text4: 'rgba(26,22,18,0.48)',
        surface: 'rgba(20,16,12,0.05)',
        surface2: 'rgba(20,16,12,0.08)',
        surfaceHi: 'rgba(20,16,12,0.12)',
        border: 'rgba(20,16,12,0.10)',
        blurBg: 'rgba(255, 250, 244, 0.92)',
        toastBg: 'rgba(244, 241, 234, 0.96)',
        toastText: '#1A1612',
        danger: '#BE3F3F'
      },
      amoled: {
        bg0: '#000000', bg1: '#000000', bg2: '#0a0a0a', bg3: '#141414',
        text1: '#ffffff',
        text2: 'rgba(255,255,255,0.72)',
        text3: 'rgba(255,255,255,0.58)', /*  en línea con dark */
        text4: 'rgba(255,255,255,0.40)',
        surface: 'rgba(255,255,255,0.06)',
        surface2: 'rgba(255,255,255,0.09)',
        surfaceHi: 'rgba(255,255,255,0.14)',
        border: 'rgba(255,255,255,0.08)',
        blurBg: 'rgba(0, 0, 0, 0.92)',
        toastBg: 'rgba(12, 12, 12, 0.96)',
        toastText: '#ffffff',
        danger: '#E85A5A'
      }
    },
    /* Rellenos (fill/fill2) deliberadamente oscuros: sobre ellos va texto
     * e iconos BLANCOS (--accent-on-fill). Un degradado con el extremo
     * claro de antes (rosa, turquesa, amarillo) dejaba el texto en 1.6–2.4:1.
     * Ahora ambos extremos cumplen AA (≥4.5:1 con blanco) en los 6 acentos.
     * Los tonos brillantes siguen en from/to/accent/accent2, que se usan
     * como color de texto sobre fondo oscuro o en portadas (sin texto).
     * fillLight/fillLight2 se usan en tema claro y también cumplen AA
     * sobre --bg-0/bg-1 claros. */
    // Paleta renovada: los extremos «from» viejos eran turbios
    // (petróleo en Océano, pantano en Musgo, marrón en Ámbar) y cada
    // acento pesaba distinto. Ahora los seis comparten familia de
    // luz —degradados luminosos y con el tono claro— manteniendo la
    // disciplina AA de arriba (verificado con calculador WCAG: los
    // 6 acentos cumplen ≥4.5:1 en texto y rellenos, oscuro y claro).
    ACCENTS: {
      aurora: { from: '#745CFF', to: '#FF6FA5', accent: '#9D8BFF', accent2: '#FF8FB8', fill: '#5B45D6', fill2: '#4836B4', fillLight: '#4E3FC8', fillLight2: '#3E32A8' },
      ocean:  { from: '#1F7AE0', to: '#23C8B2', accent: '#5EAAE8', accent2: '#4FE0C3', fill: '#1763B8', fill2: '#12559F', fillLight: '#145FA8', fillLight2: '#0F4C8C' },
      moss:   { from: '#1E9E62', to: '#9BD147', accent: '#5FBF7A', accent2: '#B9E26B', fill: '#177A45', fill2: '#12653A', fillLight: '#146C3E', fillLight2: '#0F5A33' },
      amber:  { from: '#E8710A', to: '#F5B81F', accent: '#F5A623', accent2: '#FFCF4D', fill: '#B85C0E', fill2: '#9A4D0B', fillLight: '#9C550C', fillLight2: '#854708' },
      cherry: { from: '#E01A44', to: '#FF6B81', accent: '#FB5E7E', accent2: '#FF9FB0', fill: '#C21840', fill2: '#A31236', fillLight: '#A8163A', fillLight2: '#8F1130' },
      fuchsia:{ from: '#C22BD6', to: '#FF5CA8', accent: '#EE6BE8', accent2: '#FF8FD0', fill: '#A61FB8', fill2: '#8C169C', fillLight: '#9315A8', fillLight2: '#7A118C' }
    },
    _ACCENT_ALIASES: { purple: 'aurora', blue: 'ocean', green: 'moss', orange: 'amber', pink: 'cherry' },

    _migrateAccent(id) {
      const mapped = (this._ACCENT_ALIASES && this._ACCENT_ALIASES[id]) || id;
      return (this.ACCENTS && this.ACCENTS[mapped]) ? mapped : 'aurora';
    },

    _hexToRgb(hex) {
      let h = String(hex || '').replace('#', '');
      if (h.length === 3) h = h.split('').map(c => c + c).join('');
      const n = parseInt(h, 16);
      if (!isFinite(n)) return '139, 124, 255';
      return ((n >> 16) & 255) + ', ' + ((n >> 8) & 255) + ', ' + (n & 255);
    },

    coverFallback() {
      const a = this.ACCENTS[this._migrateAccent(this.accent)] || this.ACCENTS.aurora;
      return { from: a.from, to: a.to, angle: 135 };
    },

    loadTheme() {
      try {
        this.theme = localStorage.getItem('aurora_theme') || 'dark';
        if (!this.THEMES[this.theme]) this.theme = 'dark';
        this.accent = this._migrateAccent(localStorage.getItem('aurora_accent') || 'aurora');
      } catch (e) {
        this.theme = 'dark';
        this.accent = 'aurora';
      }
      this._bindSystemThemeListener();
      this.applyTheme();
    },

    /* Devuelve el tema real que se pinta. «system» se resuelve con la
     * preferencia del sistema en cada momento (no se congela al cargar). */
    resolveTheme(pref) {
      const p = pref || this.theme || 'dark';
      if (p !== 'system') return this.THEMES[p] ? p : 'dark';
      let prefersLight = false;
      try {
        prefersLight = !!(window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches);
      } catch (e) {}
      return prefersLight ? 'light' : 'dark';
    },

    /* Escucha el cambio de tema del sistema para repintar si el usuario
     * eligió «Sistema». Se registra una sola vez. */
    _bindSystemThemeListener() {
      if (this._systemThemeMq) return;
      try {
        if (!window.matchMedia) return;
        const mq = window.matchMedia('(prefers-color-scheme: light)');
        if (!mq || typeof mq.addEventListener !== 'function') return;
        this._systemThemeMq = mq;
        mq.addEventListener('change', () => {
          if (this.theme === 'system') this.applyTheme();
        });
      } catch (e) {}
    },

    applyTheme() {
      const root = document.documentElement;
      // this.theme es la PREFERENCIA (puede ser «system»); resolved es la
      // paleta que se aplica realmente.
      const pref = this.THEMES[this.theme] ? this.theme : 'dark';
      const resolved = this.resolveTheme(pref);
      const t = this.THEMES[resolved] || this.THEMES.dark;
      this.accent = this._migrateAccent(this.accent);
      const a = this.ACCENTS[this.accent] || this.ACCENTS.aurora;
      const light = resolved === 'light';
      const accent = light ? (a.fillLight || a.fill || a.accent) : a.accent;
      const fill = light ? (a.fillLight || a.fill || a.accent) : (a.fill || a.accent);
      const fill2 = light
        ? (a.fillLight2 || a.fill2 || a.fillLight || a.fill || a.accent)
        : (a.fill2 || a.fill || a.accent);

      root.style.setProperty('--bg-0', t.bg0);
      root.style.setProperty('--bg-1', t.bg1);
      root.style.setProperty('--bg-2', t.bg2);
      root.style.setProperty('--bg-3', t.bg3);
      root.style.setProperty('--text-1', t.text1);
      root.style.setProperty('--text-2', t.text2);
      root.style.setProperty('--text-3', t.text3);
      root.style.setProperty('--text-4', t.text4);
      root.style.setProperty('--surface', t.surface);
      root.style.setProperty('--surface-2', t.surface2);
      root.style.setProperty('--surface-hi', t.surfaceHi);
      root.style.setProperty('--border', t.border);
      root.style.setProperty('--blur-bg', t.blurBg);
      root.style.setProperty('--toast-bg', t.toastBg);
      root.style.setProperty('--toast-text', t.toastText);
      if (t.danger) root.style.setProperty('--danger', t.danger);
      root.style.setProperty('--accent', accent);
      root.style.setProperty('--accent-2', a.accent2);
      root.style.setProperty('--accent-fill', fill);
      // Segundo extremo del degradado. Antes se usaba --accent-2 (rosa,
      // turquesa, amarillo…), demasiado claro para texto blanco.
      root.style.setProperty('--accent-fill-2', fill2);
      // Segundo extremo para degradados de texto sobre el fondo: brillante
      // en oscuro, oscuro en claro (siempre ≥4.5:1 como texto normal).
      root.style.setProperty('--accent-text-2', light
        ? (a.fillLight2 || a.fillLight || a.fill || a.accent)
        : (a.accent2 || a.accent));
      root.style.setProperty('--accent-on-fill', '#ffffff');
      root.style.setProperty('--accent-rgb', this._hexToRgb(fill));
      if (!this.currentTrack) {
        root.style.setProperty('--cover-from', a.from);
        root.style.setProperty('--cover-to', a.to);
      }
      // data-theme refleja la paleta aplicada (dark/light/amoled) para que
      // el CSS funcione; data-theme-pref conserva la preferencia («system»).
      root.setAttribute('data-theme', resolved);
      root.setAttribute('data-theme-pref', pref);
      // Semántico (depuración y selectores futuros); el color real va en
      // las variables --accent*. Antes solo se aplicaba el tema.
      root.setAttribute('data-accent', this.accent);

      const meta = document.querySelector('meta[name="theme-color"]');
      if (meta) meta.setAttribute('content', t.bg0);
      //  la paleta de portada se adapta al tema (pastel en claro,
      // más negra en amoled); hay que reaplicarla al cambiar.
      if (this.currentTrack && typeof this._applyCoverPalette === 'function') {
        this._applyCoverPalette(this.coverPaletteFor(this.currentTrack));
      }
    },

    setTheme(theme) {
      this.theme = this.THEMES[theme] ? theme : 'dark';
      try { localStorage.setItem('aurora_theme', this.theme); } catch (e) {}
      this.applyTheme();
      const label = this.t('theme_' + this.theme);
      this.toast(this.t('toast_theme_applied') + ' ' + (label !== 'theme_' + this.theme ? label : this.theme));
    },

    setAccent(accent) {
      this.accent = this._migrateAccent(accent);
      try { localStorage.setItem('aurora_accent', this.accent); } catch (e) {}
      this.applyTheme();
      const label = this.t('accent_' + this.accent);
      this.toast(this.t('toast_accent') + ' ' + (label && label !== 'accent_' + this.accent ? label : this.accent));
    },

    /* ============================================================
     *  Idioma (i18n)
     * ============================================================ */
    t(key) {
      const dict = window.I18N && window.I18N[key];
      if (!dict) return key;
      const v = dict[this.lang] || dict.es || key;
      return v;
    },

    /* Idioma del sistema, limitado a los 8 soportados.
     * Se miran todas las preferencias (navigator.languages) para acertar
     * con casos como «es-419», «zh-CN» o «pt-BR». */
    _detectSystemLang() {
      let list = [];
      try {
        if (Array.isArray(navigator.languages) && navigator.languages.length) list = navigator.languages;
        else if (navigator.language) list = [navigator.language];
        else if (navigator.userLanguage) list = [navigator.userLanguage];
      } catch (e) {}
      for (const raw of list) {
        const tag = String(raw || '').toLowerCase();
        //  el chino tradicional (Taiwán, Hong Kong, Macao o
        // la etiqueta Hant) tiene entrada propia en el diccionario;
        // sin este desvío, el corte por '-' lo dejaba en
        // simplificado, que es otra escritura.
        if (/^zh([-_](tw|hk|mo)\b|.*hant)/.test(tag) && this._isValidLang('zh-TW')) return 'zh-TW';
        const code = tag.split('-')[0];
        if (code && this._isValidLang(code)) return code;
      }
      return 'es';
    },

    /* El idioma se detecta del sistema en CADA arranque (no se pregunta).
     *
     * La elección manual de Ajustes sigue existiendo como override, pero
     * lleva atada la huella del idioma del sistema en el momento de elegir
     * (`aurora_lang_sys`): si el sistema cambia de idioma (otro teléfono,
     * otro sistema), el override se descarta y vuelve a mandar la
     * detección automática. Antes se abría un sheet obligatorio al primer
     * arranque y además se quedaba clavado el idioma guardado. */
    loadLang() {
      const system = this._detectSystemLang();
      this._systemLang = system;
      let saved = null;
      let savedSys = null;
      try {
        saved = localStorage.getItem('aurora_lang');
        savedSys = localStorage.getItem('aurora_lang_sys');
      } catch (e) {}
      if (saved && this._isValidLang(saved) && savedSys === system) {
        this.lang = saved;
        return;
      }
      this.lang = system;
      if (saved) {
        // Override obsoleto (o guardado por una versión que no lo marcaba):
        // limpiarlo para no volver a aplicarlo.
        try {
          localStorage.removeItem('aurora_lang');
          localStorage.removeItem('aurora_lang_sys');
        } catch (e) {}
      }
    },

    _isValidLang(code) {
      return typeof code === 'string' && !!(window.SUPPORTED_LANGS || []).find(l => l.code === code);
    },

    applyLang() {
      const dict = window.I18N || {};
      // Texto: data-i18n="key"
      document.querySelectorAll('[data-i18n]').forEach(el => {
        const key = el.getAttribute('data-i18n');
        const e = dict[key];
        if (e) el.textContent = e[this.lang] || e.es || key;
      });
      // aria-label: data-i18n-aria="key"
      document.querySelectorAll('[data-i18n-aria]').forEach(el => {
        const key = el.getAttribute('data-i18n-aria');
        const e = dict[key];
        if (e) el.setAttribute('aria-label', e[this.lang] || e.es || key);
      });
      // placeholder: data-i18n-ph="key"
      document.querySelectorAll('[data-i18n-ph]').forEach(el => {
        const key = el.getAttribute('data-i18n-ph');
        const e = dict[key];
        if (e) el.setAttribute('placeholder', e[this.lang] || e.es || key);
      });
      // title: data-i18n-title="key"
      document.querySelectorAll('[data-i18n-title]').forEach(el => {
        const key = el.getAttribute('data-i18n-title');
        const e = dict[key];
        if (e) el.setAttribute('title', e[this.lang] || e.es || key);
      });
      // Atributo lang del <html>
      document.documentElement.setAttribute('lang', this.lang);
      // Las bandas del EQ crean su aria-label al construirse (pueden
      // nacer antes de resolver el idioma y quedarse en español para
      // siempre): se re-etiquetan con el idioma actual en cada applyLang
      // (hallazgo A4 de la revisión externa).
      document.querySelectorAll('#eqBands input[type="range"]').forEach(inp => {
        const wrap = inp.parentElement;
        const lab = wrap && wrap.querySelector('.eq-band-label');
        if (lab) inp.setAttribute('aria-label', this.t('eq_band_label').replace('X', lab.textContent.trim()));
      });
      // Nota: document.title es ignorado en WebXDC; el nombre viene de manifest.toml
      // Re-renderizar listas dinámicas para que se traduzcan
      try {
        this.renderPlaylists();
        this.renderQueue();
        this.renderFavorites();
        if (this.currentTrack) this.renderCurrentTrack();
        if (typeof this.renderHome === 'function') this.renderHome();
        if (typeof this.updateChrome === 'function') this.updateChrome();
        const statsEl = document.getElementById('statsContent');
        if (statsEl && statsEl.innerHTML) this.renderStats();
      } catch (e) {}
    },

    setLang(code) {
      if (!this._isValidLang(code)) {
        console.warn('[Aurora] Idioma no soportado:', code);
        return;
      }
      this.lang = code;
      try {
        localStorage.setItem('aurora_lang', code);
        // Huella del sistema al elegir: si cambia, manda la detección.
        localStorage.setItem('aurora_lang_sys', this._systemLang || this._detectSystemLang());
      } catch (e) {}
      this.applyLang();
      this.buildLangList();
      // Refrescar etiquetas dinámicas (no data-i18n) en el nuevo idioma
      if (typeof this.updateStorageUsage === 'function') this.updateStorageUsage();
      this.toast(this.t('toast_lang_applied'));
    },

    loadPlaybackSettings() {
      try {
        const raw = localStorage.getItem('aurora_playback');
        if (raw) {
          const s = JSON.parse(raw);
          if (typeof s.normalize === 'boolean') this._normalizeVolume = s.normalize;
          if (typeof s.crossfade === 'number') {
            //  acotado al rango que ofrece la UI (0–12 s): un
            // valor corrupto o heredado (p. ej. 999) arrancaba el
            // fundido casi al empezar cada canción.
            this.crossfadeDuration = Math.max(0, Math.min(12, s.crossfade));
          }
          //  UN modo de transición. Clave nueva si existe; si
          // no, se deriva de las heredadas (gapless suelto y/o
          // fundido con duración) para no perder ajustes viejos.
          const legacyMode = (this.crossfadeDuration > 0) ? 'crossfade'
            : (s.gapless ? 'gapless' : 'normal');
          const mode = ['normal', 'gapless', 'crossfade'].includes(s.transition)
            ? s.transition : legacyMode;
          this._gaplessEnabled = mode === 'gapless';
          this.crossfadeEnabled = mode === 'crossfade';
          if (mode === 'crossfade' && !(this.crossfadeDuration > 0)) this.crossfadeDuration = 6;
          if (typeof s.marquee === 'boolean') this._marqueeEnabled = s.marquee;
          // s.vinyl (: modo retirado) se ignora a propósito.
        }
      } catch (e) {}
    },
    savePlaybackSettings() {
      try {
        localStorage.setItem('aurora_playback', JSON.stringify({
          transition: this.getTransitionMode(),
          gapless: !!this._gaplessEnabled,
          normalize: !!this._normalizeVolume,
          crossfade: this.crossfadeDuration || 0,
          marquee: this._marqueeEnabled !== false
        }));
      } catch (e) {}
    },
    /*  modo de transición entre canciones — la única fuente
 * de verdad de la que beben el motor (audio.js: gapless y
 * fundido se excluyen solos) y la fila de Ajustes. */
    getTransitionMode() {
      if (this.crossfadeEnabled && (this.crossfadeDuration || 0) > 0) return 'crossfade';
      return this._gaplessEnabled ? 'gapless' : 'normal';
    },
    setTransitionMode(mode) {
      if (mode === 'crossfade') {
        this._gaplessEnabled = false;
        if (!((this.crossfadeDuration || 0) > 0)) this.crossfadeDuration = 6;
        this.crossfadeEnabled = true;
      } else if (mode === 'gapless') {
        this._gaplessEnabled = true;
        this.crossfadeEnabled = false;
      } else {
        this._gaplessEnabled = false;
        this.crossfadeEnabled = false;
      }
      this.savePlaybackSettings();
      this.syncPlaybackSettingsUI();
      if (mode === 'gapless') this.preloadNextTrack();
    },
    setCrossfadeDuration(n) {
      this.crossfadeDuration = Math.max(0, Math.min(12, Number(n) || 0));
      // Elegir duración ES elegir fundido (la fila solo se ve en
      // ese modo, pero la coherencia no cuesta nada).
      if (this.crossfadeDuration > 0) {
        this.crossfadeEnabled = true;
        this._gaplessEnabled = false;
      }
      this.savePlaybackSettings();
      this.syncPlaybackSettingsUI();
    },
    syncPlaybackSettingsUI() {
      const n = document.getElementById('toggleNormalize');
      if (n) n.checked = !!this._normalizeVolume;
      const m = document.getElementById('toggleMarquee');
      if (m) m.checked = this._marqueeEnabled !== false;
      const mode = this.getTransitionMode();
      document.querySelectorAll('[data-transition]').forEach(b => {
        b.classList.toggle('active', b.dataset.transition === mode);
      });
      const xfRow = document.getElementById('xfadeOpts');
      if (xfRow) xfRow.hidden = mode !== 'crossfade';
      document.querySelectorAll('[data-xfade]').forEach(b => {
        b.classList.toggle('active', Number(b.dataset.xfade) === (this.crossfadeDuration || 0));
      });
      const ver = document.getElementById('aboutVersion');
      if (ver) {
        let vText = this.VERSION || '1.0.0';
        if (window.webxdc && !window.webxdc._isStub) {
          vText += ' · WebXDC (Delta Chat)';
          if (window.webxdc.selfName) vText += ` · ${window.webxdc.selfName}`;
        }
        ver.textContent = vText;
      }
    },

    syncDesktopLayout() {
      const mq = window.matchMedia;
      const isWebxdc = !!(window.webxdc && !window.webxdc._isStub);
      const wide = !isWebxdc && !!(mq && mq('(min-width: 900px)').matches);
      const tablet = !isWebxdc && !wide && !!(mq && mq('(min-width: 600px)').matches);
      const html = document.documentElement;
      const wasWide = html.classList.contains('aurora-wide');
      html.classList.toggle('aurora-wide', wide);
      html.classList.toggle('aurora-tablet', tablet);
      const screen = document.getElementById('deviceScreen');
      if (screen) {
        screen.classList.toggle('aurora-wide', wide);
        screen.classList.toggle('aurora-tablet', tablet);
      }
      // En un .xdc los enlaces externos no abren (el cliente los bloquea):
      // se sustituye «Código fuente» por la URL en texto para poder copiarla.
      const aboutSource = document.getElementById('aboutSource');
      const aboutSourceUrl = document.getElementById('aboutSourceUrl');
      if (aboutSource && aboutSourceUrl) {
        aboutSource.style.display = isWebxdc ? 'none' : '';
        aboutSourceUrl.hidden = !isWebxdc;
      }
      const nav = document.querySelector('.bottom-nav');
      // aria-orientation no es válido en <nav>; se expone como data-attr
      // para CSS y no rompe la validación ARIA.
      if (nav) nav.setAttribute('data-orientation', wide ? 'vertical' : 'horizontal');
      if (wasWide !== wide && typeof this.showView === 'function') {
        const lyricsOn = !!(document.getElementById('viewLyrics') && document.getElementById('viewLyrics').classList.contains('active'));
        this.showView(lyricsOn ? 'lyrics' : 'home');
      }
      if (typeof this.updateChrome === 'function') this.updateChrome();
    },

    buildLangList() {
      const ul = document.getElementById('langList');
      if (!ul) return;
      ul.innerHTML = '';
      const langs = window.SUPPORTED_LANGS || [];
      langs.forEach(l => {
        const li = document.createElement('li');
        li.className = 'lang-row' + (l.code === this.lang ? ' active' : '');
        li.innerHTML = `
          <span class="lang-flag">${l.flag}</span>
          <span class="lang-name">${l.name}</span>
          ${l.code === this.lang ? '<svg class="ico lang-check" aria-hidden="true"><use href="#i-check"></use></svg>' : ''}
        `;
        li.addEventListener('click', () => {
          this.setLang(l.code);
          this.closeSheet('sheetLanguage');
        });
        ul.appendChild(li);
      });
    },

    /* Muestra el uso de almacenamiento (IndexedDB) en Ajustes.
     * Se llama al abrir Ajustes; si la API no existe, se oculta la fila. */
    async updateStorageUsage() {
      const label = document.getElementById('storageUsageLabel');
      if (!label) return;
      try {
        if (!navigator.storage || typeof navigator.storage.estimate !== 'function') {
          label.style.display = 'none';
          return;
        }
        const { usage, quota } = await navigator.storage.estimate();
        if (typeof usage !== 'number') {
          label.style.display = 'none';
          return;
        }
        const used = this.fmtBytes(usage);
        const total = (typeof quota === 'number' && quota > 0) ? ' / ' + this.fmtBytes(quota) : '';
        // 🔒 = almacenamiento persistente concedido (el sistema no lo borra solo).
        let lock = '';
        try {
          if (this._storagePersisted === undefined && navigator.storage && typeof navigator.storage.persisted === 'function') {
            this._storagePersisted = await navigator.storage.persisted();
          }
          if (this._storagePersisted) lock = ' 🔒';
        } catch (e) {}
        label.textContent = this.t('storage_usage')
          .replace('X', String(this.tracks.length))
          .replace('Y', used + total) + lock;
        label.style.display = '';
      } catch (e) {
        label.style.display = 'none';
      }
    },

    fmtBytes(n) {
      n = Number(n) || 0;
      if (n < 1024) return n + ' B';
      const units = ['KB', 'MB', 'GB', 'TB'];
      let v = n / 1024;
      let u = 0;
      while (v >= 1024 && u < units.length - 1) { v /= 1024; u++; }
      return (v >= 100 ? Math.round(v) : v.toFixed(1)) + ' ' + units[u];
    },

    /* «Liberar espacio»: lleva a Ajustes → Almacenamiento para que el
     * usuario gestione su biblioteca. Se llama al llenarse la cuota. */
    offerFreeStorage() {
      try {
        if (typeof this.updateStorageUsage === 'function') this.updateStorageUsage();
        this.openSheet('sheetSettings');
      } catch (e) {}
    },
});
