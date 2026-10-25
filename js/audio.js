/* =====================================================================
 *  js/audio.js — Aurora Music Player
 *  Web Audio · ecualizador · motor de reproducción
 *
 *  Parte del refactor (C) de app.js: mismo código, módulos por funcionalidad.
 *  Este archivo se carga tras js/state.js y completa el objeto App con
 *  Object.assign (los scripts son clásicos por compatibilidad webxdc).
 * ===================================================================== */

'use strict';

Object.assign(App, {
    /* ============================================================
     *  Web Audio API · grafo de audio
     * ============================================================ */
    initAudioGraph() {
      if (this.audioCtx) return;
      try {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return;
        this.audioCtx = new AC();
        this.sourceNode = this.audioCtx.createMediaElementSource(this.audio);

        /* Ecualizador: 5 bandas */
        const bands = [60, 230, 910, 3600, 14000];
        this.eqFilters = bands.map((freq, i) => {
          const f = this.audioCtx.createBiquadFilter();
          f.type = i === 0 ? 'lowshelf' : i === bands.length - 1 ? 'highshelf' : 'peaking';
          f.frequency.value = freq;
          f.Q.value = 1;
          f.gain.value = 0;
          return f;
        });

        /* Cadena: source → eq0 → eq1 → … → analyser → gain → destination */
        let node = this.sourceNode;
        for (const f of this.eqFilters) { node.connect(f); node = f; }

        this.analyser = this.audioCtx.createAnalyser();
        /* fftSize 2048: la onda fluida necesita resolución temporal
         * de verdad; con 256 solo tenía 128 muestras y salía dentada. */
        this.analyser.fftSize = 2048;
        // 0.68 (antes 0.8): con el suavizado propio de la onda
        // encima, 0.8 hacía el trazo perezoso.
        this.analyser.smoothingTimeConstant = 0.68;
        this.freqData = new Uint8Array(this.analyser.frequencyBinCount);
        this._visTimeData = new Uint8Array(this.analyser.fftSize);
        node.connect(this.analyser);

        this.gainNode = this.audioCtx.createGain();
        this.gainNode.gain.value = 1;
        this.analyser.connect(this.gainNode);
        this.gainNode.connect(this.audioCtx.destination);
        this.applySavedEq();
      } catch (e) {
        console.warn('[Aurora] Web Audio no disponible:', e.message);
        this.audioCtx = null;
      }
    },

    /* Asegura el grafo Web Audio (EQ). Se llama en el primer play. */
    ensureAudioGraph() {
      if (!this.audioCtx) {
        try { this.initAudioGraph(); } catch (e) {}
      }
      if (this.audioCtx && this.audioCtx.state === 'suspended') {
        try { this.audioCtx.resume(); } catch (e) {}
      }
    },

    /* ============================================================
     *  Ecualizador
     * ============================================================ */
    getSavedEq() {
      try {
        const s = localStorage.getItem('aurora_eq');
        if (s) {
          const arr = JSON.parse(s);
          if (Array.isArray(arr) && arr.length) return arr.map(n => Number(n) || 0);
        }
      } catch (e) {}
      return [0, 0, 0, 0, 0];
    },
    applySavedEq() {
      const saved = this.getSavedEq();
      saved.forEach((g, i) => {
        if (this.eqFilters[i]) this.eqFilters[i].gain.value = g;
      });
      document.querySelectorAll('#eqBands input[type="range"]').forEach((inp, i) => {
        if (saved[i] == null) return;
        inp.value = saved[i];
        const val = inp.parentElement && inp.parentElement.querySelector('.eq-band-val');
        if (val) val.textContent = (saved[i] > 0 ? '+' : '') + saved[i] + ' dB';
      });
    },
    buildEqualizer() {
      const c = document.getElementById('eqBands');
      if (!c) return;
      c.innerHTML = '';
      const labels = ['60Hz','230Hz','910Hz','3.6k','14k'];
      const savedEq = this.getSavedEq();
      labels.forEach((lbl, i) => {
        const wrap = document.createElement('div');
        wrap.className = 'eq-band';
        const lab = document.createElement('span');
        lab.className = 'eq-band-label';
        lab.textContent = lbl;
        const input = document.createElement('input');
        input.type = 'range';
        input.min = -12; input.max = 12; input.value = savedEq[i] || 0; input.step = 1;
        // Sin <label> asociado axe lo marca como crítico (label). El id
        // enlaza label/for y el aria-label cubre lectores que ignoren el for.
        input.id = 'eqBand' + i;
        input.setAttribute('aria-label', this.t('eq_band_label').replace('X', lbl));
        lab.id = 'eqBandLabel' + i;
        const val = document.createElement('span');
        val.className = 'eq-band-val';
        const g = savedEq[i] || 0;
        val.textContent = (g > 0 ? '+' : '') + g + ' dB';
        input.addEventListener('input', () => {
          const n = parseFloat(input.value) || 0;
          if (this.eqFilters[i]) this.eqFilters[i].gain.value = n;
          val.textContent = (n > 0 ? '+' : '') + n + ' dB';
          this.saveEqValues();
          try { localStorage.setItem('aurora_eq_preset', 'custom'); } catch (e) {}
          document.querySelectorAll('.eq-preset').forEach(b => b.classList.remove('active'));
        });
        // <label for> real: además de axe, permite clicar la etiqueta.
        const labelEl = document.createElement('label');
        labelEl.className = 'eq-band-label';
        labelEl.htmlFor = input.id;
        labelEl.id = lab.id;
        labelEl.textContent = lbl;
        wrap.appendChild(labelEl);
        wrap.appendChild(input);
        wrap.appendChild(val);
        c.appendChild(wrap);
        if (this.eqFilters[i]) this.eqFilters[i].gain.value = savedEq[i] || 0;
      });
      try {
        let preset = localStorage.getItem('aurora_eq_preset') || 'normal';
        if (preset === 'flat') preset = 'normal';
        document.querySelectorAll('.eq-preset').forEach(b => b.classList.toggle('active', b.dataset.preset === preset));
      } catch (e) {}
    },
    /* #5 Guardar valores del EQ */
    saveEqValues() {
      const inputs = document.querySelectorAll('#eqBands input[type="range"]');
      const vals = Array.from(inputs).map(i => parseFloat(i.value));
      try { localStorage.setItem('aurora_eq', JSON.stringify(vals)); } catch (e) {}
    },
    /* #5 Resetear EQ */
    resetEqValues() {
      this.applyEqPreset('normal');
      this.toast(this.t('toast_eq_reset'));
    },

    applyEqPreset(preset) {
      if (preset === 'flat') preset = 'normal';
      const presets = {
        normal:[0, 0, 0, 0, 0],
        bass:  [6, 4, 0, -2, -3],
        vocal: [-2, 0, 4, 3, 1],
        treble:[-2, -1, 0, 4, 6],
        live:  [3, 1, 0, 2, 4]
      };
      const vals = presets[preset] || presets.normal;
      const inputs = document.querySelectorAll('#eqBands input[type="range"]');
      inputs.forEach((inp, i) => {
        inp.value = vals[i];
        if (this.eqFilters[i]) this.eqFilters[i].gain.value = vals[i];
        const val = inp.parentElement && inp.parentElement.querySelector('.eq-band-val');
        if (val) val.textContent = (vals[i] > 0 ? '+' : '') + vals[i] + ' dB';
      });
      this.saveEqValues();
      try { localStorage.setItem('aurora_eq_preset', preset); } catch (e) {}
      document.querySelectorAll('.eq-preset').forEach(b => b.classList.toggle('active', b.dataset.preset === preset));
    },

    /* ============================================================
     *  Reproducción
     * ============================================================ */
    /* Reproduce una pista concreta.
     *   context — opcional: { type: 'playlist'|'favorites'|'all'|'queue', id?, name? }
     *             Indica desde qué lista se reproduce, para mostrarlo en la UI.
     * Si el contexto es 'playlist' o 'favorites', la cola se reemplaza por
     * las pistas de esa lista (no por todas las de la biblioteca). */
    playTrack(trackId, context) {
      const idx = this.tracks.findIndex(t => t.id === trackId);
      if (idx < 0) return;
      //  cambiar a otra canción a mitad de reproducción cuenta
      // como salto de la saliente (playFromQueue no pasa por aquí,
      // así que next/prev no lo cuentan dos veces).
      if (this.currentTrack && this.currentTrack.id !== trackId && this.isPlaying
          && typeof this._registerSkip === 'function') {
        this._registerSkip();
      }
      this.currentTrackIdx = idx;
      this.currentTrack = this.tracks[idx];

      // Determinar la cola según el contexto
      if (context && context.type === 'playlist' && context.id) {
        // Cola = pistas de esa playlist (en orden), filtrando las que existen
        const pl = this.playlists.find(p => p.id === context.id);
        if (pl) {
          // La cola hereda el orden por estrellas de la lista
          this.queue = this.playlistTracksSorted(pl).map(t => t.id);
          // Esta foto de la lista es la base de sincronización:
          // next() solo aplicará altas/bajas de la lista, jamás
          // resucitará lo que el usuario quite de la cola.
          this._plSyncIds = this.queue.slice();
          const qIdx = this.queue.indexOf(trackId);
          // La pista puede no pertenecer ya a la lista (se quitó mientras
          // sonaba otra): insertarla para que next/prev sigan teniendo
          // sentido, en vez de dejar queueIdx apuntando a otra canción.
          if (qIdx < 0) {
            this.queue.unshift(trackId);
            this.queueIdx = 0;
          } else {
            this.queueIdx = qIdx;
          }
        } else {
          this.queue = [trackId];
          this.queueIdx = 0;
        }
      } else if (context && context.type === 'favorites') {
        // Cola = pistas favoritas
        const favIds = this.sortByRating(this.tracks.filter(t => this.favorites.has(t.id))).map(t => t.id);
        this.queue = favIds;
        const qIdx = this.queue.indexOf(trackId);
        if (qIdx < 0) { this.queue.unshift(trackId); this.queueIdx = 0; }
        else this.queueIdx = qIdx;
      } else if (context && context.type === 'album' && context.name) {
        const artist = context.artist;
        const tracks = this.tracks.filter(t => t.album === context.name && (!artist || t.artist === artist));
        this.queue = tracks.map(t => t.id);
        const qIdx = this.queue.indexOf(trackId);
        if (qIdx < 0) { this.queue.unshift(trackId); this.queueIdx = 0; }
        else this.queueIdx = qIdx;
      } else if (context && context.type === 'artist' && context.name) {
        const tracks = this.tracks.filter(t => t.artist === context.name);
        this.queue = tracks.map(t => t.id);
        const qIdx = this.queue.indexOf(trackId);
        if (qIdx < 0) { this.queue.unshift(trackId); this.queueIdx = 0; }
        else this.queueIdx = qIdx;
      } else {
        // Sin contexto específico o 'all'/'queue': cola = todas las pistas
        this.queue = this.tracks.map(t => t.id);
        this.queueIdx = idx;
      }

      //  fuera de contexto de lista no hay sincronización que hacer.
      if (!(context && context.type === 'playlist' && context.id)) this._plSyncIds = null;
      // Si se pasa contexto, usarlo; si no, mantener el actual
      if (context) this.playContext = context;
      // La pista tocada debe sonar primero aunque Aleatorio esté activo; el
      // resto de la cola se baraja detrás.
      if (this.shuffle) this._applyShuffle(trackId);
      else this._originalQueue = null;
      this.loadAndPlay();
    },

    playFromQueue(idx) {
      if (idx < 0 || idx >= this.queue.length) return;
      this.queueIdx = idx;
      const trackId = this.queue[idx];
      const tIdx = this.tracks.findIndex(t => t.id === trackId);
      if (tIdx < 0) return;
      this.currentTrackIdx = tIdx;
      this.currentTrack = this.tracks[tIdx];
      this.loadAndPlay();
    },

    loadAndPlay() {
      const t = this.currentTrack;
      if (!t) return;
      this._gaplessArmed = false;
      if (!this._xfadeIncoming) this._cancelCrossfade();
      const targetGain = this._normGain || 1;
      if (this.gainNode && this.audioCtx) {
        try {
          const now = this.audioCtx.currentTime;
          this.gainNode.gain.cancelScheduledValues(now);
          if (this._xfadeIncoming && this.crossfadeEnabled && this.crossfadeDuration > 0) {
            this.gainNode.gain.setValueAtTime(0.001, now);
            this.gainNode.gain.linearRampToValueAtTime(targetGain, now + 0.25);
          } else {
            this.gainNode.gain.setValueAtTime(targetGain, now);
          }
        } catch (e) {}
      }
      this._xfadeIncoming = false;
      const url = this.getTrackUrl(t);
      if (!url) {
        console.warn('[Aurora] Sin URL de audio para', t.id);
        // Pista sin fuente de audio utilizable (blob perdido): avisar
        // y saltar a la siguiente sin bloquear la reproducción.
        this.toast(this.t('toast_track_no_audio'));
        this._noAudioSkips = (this._noAudioSkips || 0) + 1;
        if (this._noAudioSkips > this.queue.length) {
          this._noAudioSkips = 0;
          this.stopPlayback();
          return;
        }
        // Diferido: evita recursión síncrona profunda con colas enormes.
        setTimeout(() => this.next(true), 0);
        return;
      }
      this._noAudioSkips = 0;
      this.audio.src = url;
      try { this.audio.volume = this.volume; } catch (e) {}
      // Pista nueva: el bucle A-B de la anterior no debe sobrevivir.
      if (this.clearABRepeat) this.clearABRepeat();
      if (this.preservesPitch !== undefined) {
        this.audio.preservesPitch = this.preservesPitch;
        this.audio.mozPreservesPitch = this.preservesPitch;
        this.audio.webkitPreservesPitch = this.preservesPitch;
      }
      if (this.playbackRate && this.playbackRate !== 1) {
        try { this.audio.playbackRate = this.playbackRate; } catch (e) {}
      }
      this.setBuffering(this.audio.readyState < 3);
      if (typeof this.restoreLyricsPrefs === 'function') this.restoreLyricsPrefs();
      this.togglePlay(true);
      this.renderCurrentTrack();
      this.renderLyrics();
      this.updateMediaSession();
      this.preloadNextTrack();
      this.applyNormalization(t);
      if (typeof this.updateChrome === 'function') this.updateChrome();
    },

    /* Carga la pista actual en el elemento <audio> pero SIN reproducir.
     * Usado al eliminar la pista en reproducción: salta a la siguiente
     * y queda en modo pausa (ready to play). */
    loadTrackPaused() {
      const t = this.currentTrack;
      if (!t) {
        // Sin pista: limpiar
        if (this.audio) {
          try { this.audio.pause(); } catch (e) {}
          this.audio.removeAttribute('src');
          try { this.audio.load(); } catch (e) {}
        }
        this.isPlaying = false;
        this.updatePlayUI();
        return;
      }
      const url = this.getTrackUrl(t);
      if (url) {
        this.audio.src = url;
        try { this.audio.volume = this.volume; } catch (e) {}
        this.audio.load();
        this.setBuffering(this.audio.readyState < 3);
      } else {
        //  sin URL no basta con «no cargar»: el elemento
        // conservaba el src de la pista anterior (la borrada) y
        // un Play la resucitaba sonando otra canción que la que
        // enseñaba la pantalla.
        if (this.audio) {
          try { this.audio.pause(); } catch (e) {}
          this.audio.removeAttribute('src');
          try { this.audio.load(); } catch (e) {}
        }
        this.setBuffering(false);
      }
      //  misma higiene que loadAndPlay al cambiar de pista:
      // fuera el bucle A-B de la anterior y dentro las prefs de
      // letra (offset/velocidad) de ESTA pista, no de la borrada.
      // La misma limpieza de bucle se hace en loadAndPlay.
      if (this.clearABRepeat) this.clearABRepeat();
      if (typeof this.restoreLyricsPrefs === 'function') this.restoreLyricsPrefs();
      this.isPlaying = false;
      this.renderCurrentTrack();
      this.renderLyrics();
      this.updateMediaSession();
      this.updatePlayUI();
    },

    /* Política única ante un archivo que no se puede decodificar.
     * Antes se abandonaba tras 3 fallos seguidos, aunque la cuarta
     * canción de la cola fuera válida. Ahora se recorre la cola una
     * vez (tantos intentos como posiciones tenga) y solo se rinde al
     * agotarla; el contador se reinicia en cuanto algo suena. Solo se
     * avisa en el primer fallo y al rendirse: nada de un toast por
     * cada archivo roto. Devuelve true si ya actuó. */
    _handleDecodeFailure() {
      if (typeof this.setBuffering === 'function') this.setBuffering(false);
      this.isPlaying = false;
      if (typeof this.updatePlayUI === 'function') this.updatePlayUI();
      //  si ya hay un salto programado para ESTE fallo, el
      // segundo aviso (evento 'error' tras el rechazo de play())
      // no cuenta ni salta otra vez.
      if (this._decodeSkipTimer) return true;
      this._decodeSkipCount = (this._decodeSkipCount || 0) + 1;
      const limit = Math.max(1, Array.isArray(this.queue) && this.queue.length ? this.queue.length : 1);
      if (this._decodeSkipCount >= limit) {
        const skipped = this._decodeSkipCount;
        this._decodeSkipCount = 0;
        this.toast(this.t('toast_skipped_give_up').replace('X', String(skipped)));
        try { if (this.audio) this.audio.pause(); } catch (e) {}
        return true;
      }
      if (this._decodeSkipCount === 1) this.toast(this.t('toast_audio_error'));
      //  programar el salto (el candado de arriba coalesce
      // los dos avisos del mismo archivo corrupto en uno solo).
      this._decodeSkipTimer = setTimeout(() => {
        this._decodeSkipTimer = null;
        this.next(true);
      }, 0);
      return true;
    },

    setBuffering(on) {
      const el = document.getElementById('coverBuffering');
      const cover = document.getElementById('coverArt');
      const show = !!on;
      if (el) {
        if (show) el.removeAttribute('hidden');
        else el.setAttribute('hidden', '');
      }
      if (cover) cover.classList.toggle('is-buffering', show);
    },

    /* Crossfade de portada 200 ms, sin rotateY. */
    animateCoverTransition() {
      const front = document.getElementById('coverCanvas');
      const back = document.getElementById('coverCanvasBack');
      const bg = document.getElementById('bgGradient');
      if (!front || !back) return;
      try {
        const bctx = back.getContext('2d');
        bctx.clearRect(0, 0, back.width, back.height);
        bctx.drawImage(front, 0, 0);
      } catch (e) {
        return;
      }
      back.style.transition = 'none';
      back.style.opacity = '1';
      if (this._coverXfadeTimer) clearTimeout(this._coverXfadeTimer);
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          back.style.transition = 'opacity 200ms ease';
          back.style.opacity = '0';
        });
      });
      this._coverXfadeTimer = setTimeout(() => {
        back.style.transition = '';
        back.style.opacity = '';
      }, 240);
      if (bg) {
        bg.style.transition = 'opacity 200ms ease';
        bg.style.opacity = '0.4';
        setTimeout(() => { bg.style.opacity = ''; }, 200);
      }
    },

    async togglePlay(forcePlay) {
      if (!this.currentTrack) return;
      // Si hay un play() pendiente, isPlaying aún es false: usar el estado
      // real del elemento evita que un segundo toque vuelva a reproducir
      // en vez de pausar.
      const actuallyPlaying = this.audio ? !this.audio.paused : this.isPlaying;
      const wantPlay = forcePlay !== undefined ? forcePlay : !actuallyPlaying;
      if (wantPlay && !this.audio.getAttribute('src')) {
        // Arranque sin sesión restaurada: hay pista elegida (tracks[0]) pero
        // el <audio> aún no tiene fuente. Sin esta guarda, play() falla con
        // NotSupportedError, se muestra «error de audio» y next() salta a la
        // pista siguiente sin que el usuario lo pida (con Aleatorio activo,
        // a una pista cualquiera). Cargar primero y reproducir después.
        this.loadAndPlay();
        return;
      }
      if (wantPlay) {
        // Inicializar Web Audio al primer play (política iOS)
        // Pero NO esperar al resume antes de play() — llamar play() inmediatamente
        // para que el audio empiece a cargar/reproducir sin retardo.
        const token = (this._playToken = (this._playToken || 0) + 1);
        const p = this.audio.play();
        if (!this.audioCtx) {
          setTimeout(() => {
            try { this.initAudioGraph(); } catch (e) {}
            if (this.audioCtx && this.audioCtx.state === 'suspended') {
              try { this.audioCtx.resume(); } catch (e) {}
            }
          }, 0);
        } else if (this.audioCtx.state === 'suspended') {
          try { this.audioCtx.resume(); } catch (e) {}
        }
        if (p && p.then) {
          p.then(() => {
            // Si mientras cargaba se pidió pausa o se cambió de pista,
            // este then ya no debe reactivar la UI.
            if (token !== this._playToken) return;
            this.isPlaying = true;
            if (this.gainNode && this.audioCtx && !this._xfadeIncoming && !this._xfadeStarted) {
              try {
                //  fundido de entrada (300 ms). Sin grafo Web
                // Audio no hay dónde fundir y se entra directo.
                const now = this.audioCtx.currentTime;
                this.gainNode.gain.cancelScheduledValues(now);
                this.gainNode.gain.setValueAtTime(0.0001, now);
                this.gainNode.gain.exponentialRampToValueAtTime(Math.max(0.0002, this._normGain || 1), now + 0.3);
              } catch (e) {}
            }
            this.updatePlayUI();
            this.ensureAudioGraph();
            this.requestWakeLock();
            this.trackPlayStarted();
            this.updateMediaPosition(true);
          }).catch((e) => {
            if (token !== this._playToken) return;
            const name = (e && e.name) || '';
            console.warn('[Aurora] play() rechazado:', name, e && e.message);
            this._lastError = { msg: 'play() rechazado: ' + (e && e.message), ts: Date.now() };
            this.isPlaying = false;
            this.updatePlayUI();
            // Siempre apagar el spinner: si no, la app parece congelada.
            if (typeof this.setBuffering === 'function') this.setBuffering(false);
            // AbortError = carrera benigna (toques rápidos / cambio de pista):
            // no asustar con el aviso de bloqueo.
            if (name === 'AbortError') return;
            if (name === 'NotAllowedError') {
              this.toast(this.t('toast_play_blocked'));
              return;
            }
            // NotSupportedError u otros: el archivo no se puede reproducir.
            // Misma política que el evento 'error': recorrer la cola una
            // vez antes de rendirse (ver _handleDecodeFailure).
            if (typeof this._handleDecodeFailure === 'function') this._handleDecodeFailure();
            else setTimeout(() => this.next(true), 0);
          });
        }
      } else {
        this._playToken = (this._playToken || 0) + 1;
        this._cancelCrossfade();
        //  fundido de salida (250 ms) antes de pausar de verdad.
        // Si llega un play() mientras tanto, el token lo invalida y
        // la pausa programada no se aplica. Sin grafo, pausa directa.
        const canFade = this.gainNode && this.audioCtx && !this._xfadeIncoming && !this._xfadeStarted
          && this.audio && !this.audio.paused;
        if (canFade) {
          const fadeToken = this._playToken;
          try {
            const now = this.audioCtx.currentTime;
            this.gainNode.gain.cancelScheduledValues(now);
            this.gainNode.gain.setValueAtTime(Math.max(0.0002, this.gainNode.gain.value || 1), now);
            this.gainNode.gain.exponentialRampToValueAtTime(0.0001, now + 0.25);
          } catch (e) {}
          setTimeout(() => {
            if (this._playToken !== fadeToken) return; // se reanudó: no pausar
            try { this.audio.pause(); } catch (e) {}
            // Dejar la ganancia en su sitio para el próximo play().
            try {
              const now2 = this.audioCtx.currentTime;
              this.gainNode.gain.cancelScheduledValues(now2);
              this.gainNode.gain.setValueAtTime(this._normGain || 1, now2);
            } catch (e) {}
          }, 270);
        } else {
          this.audio.pause();
        }
        this.isPlaying = false;
        this.updatePlayUI();
        this.releaseWakeLock();
        this.trackPlayStopped();
        this.updateMediaPosition(true);
      }
    },

    /* Detener la reproducción por completo (pausa + reset a 0) sin tocar la cola.
     * Usado cuando la pista actual se quita manualmente de la cola. */
    stopPlayback() {
      try {
        if (this.audio) {
          this.audio.pause();
          try { this.audio.currentTime = 0; } catch (e) {}
        }
      } catch (e) {}
      this.isPlaying = false;
      this.updatePlayUI();
      this.releaseWakeLock();
      this.trackPlayStopped();
      // Reset visual de la barra de progreso
      const fill = document.getElementById('progressFill');
      if (fill) fill.style.width = '0%';
      const cur = document.getElementById('timeCurrent');
      if (cur) cur.textContent = '0:00';
    },

    /* Salta a la siguiente pista disponible en la cola, o a la anterior
     * si no hay siguiente. La pista cargada queda en MODO PAUSA (lista
     * para reanudar con un toque en ▶). Si no hay ninguna pista más en
     * la cola ni en la biblioteca, el reproductor queda vacío.
     *
     * Usado al eliminar la pista que se está reproduciendo. */
    skipToNextOrPrevPaused() {
      // Caso 1: hay cola con pistas restantes
      if (this.queue.length > 0) {
        // queueIdx ya fue ajustado por deleteTrack/removeFromPlaylist.
        // Asegurar que esté en rango válido.
        if (this.queueIdx >= this.queue.length) this.queueIdx = this.queue.length - 1;
        if (this.queueIdx < 0) this.queueIdx = 0;
        const nextId = this.queue[this.queueIdx];
        const tIdx = this.tracks.findIndex(t => t.id === nextId);
        if (tIdx >= 0) {
          this.currentTrackIdx = tIdx;
          this.currentTrack = this.tracks[tIdx];
          this.loadTrackPaused();
          return;
        }
        // Si la pista no se encontró (poco probable), intentar con la anterior
        if (this.queueIdx > 0) {
          this.queueIdx--;
          const prevId = this.queue[this.queueIdx];
          const ptIdx = this.tracks.findIndex(t => t.id === prevId);
          if (ptIdx >= 0) {
            this.currentTrackIdx = ptIdx;
            this.currentTrack = this.tracks[ptIdx];
            this.loadTrackPaused();
            return;
          }
        }
      }

      // Caso 2: no hay cola, pero sí pistas en la biblioteca
      if (this.tracks.length > 0) {
        // Intentar la siguiente pista de la biblioteca, o la anterior
        let idx = Math.min(this.currentTrackIdx, this.tracks.length - 1);
        if (idx < 0) idx = 0;
        this.currentTrackIdx = idx;
        this.currentTrack = this.tracks[idx];
        // Reconstruir cola con todas las pistas restantes
        this.queue = this.tracks.map(t => t.id);
        this.queueIdx = idx;
        this.loadTrackPaused();
        return;
      }

      // Caso 3: no hay ninguna pista — reproductor vacío
      this.currentTrack = null;
      this.currentTrackIdx = 0;
      this.queueIdx = 0;
      this.queue = [];
      this.showEmptyState();
      this.renderCurrentTrack();
      if (typeof this.renderHome === 'function') this.renderHome();
      if (typeof this.updateChrome === 'function') this.updateChrome();
    },

    /* Sincroniza la cola con la lista de la que nació.
 * _plSyncIds es la foto de la lista cuando se construyó la cola
 * (o en la primera sincronización). Contra esa foto:
 * - altas: ids que están en la lista ahora y no estaban en la
 * foto ni en la cola → se añaden AL FINAL de la cola.
 * - bajas de la lista: ids de la foto que ya no están en la
 * lista → salen de la cola (salvo la que está sonando, que
 * termina y saldrá en la siguiente sincronización).
 * Lo que el usuario quitó de la cola a mano sigue en la foto,
 * así que NO se considera alta y no vuelve. El orden de la cola
 * tampoco se toca: el reorden por arrastre sobrevive. */
    _syncQueueWithPlaylist() {
      if (!this.playContext || this.playContext.type !== 'playlist' || !this.playContext.id) {
        this._plSyncIds = null;
        return;
      }
      const pl = this.playlists.find(p => p.id === this.playContext.id);
      if (!pl) { this._plSyncIds = null; return; }
      const plIds = this.playlistTracksSorted(pl).map(t => t.id);
      // Primera vez (sesión restaurada o cola construida por otra
      // vía): se adopta la lista como foto y la cola queda tal cual.
      if (!Array.isArray(this._plSyncIds)) this._plSyncIds = plIds;
      const base = this._plSyncIds;
      const curId = this.currentTrack && this.currentTrack.id;
      const gone = new Set(base.filter(id => !plIds.includes(id)));
      const added = plIds.filter(id => !base.includes(id) && !this.queue.includes(id));
      let changed = false;
      if (gone.size) {
        const beforeLen = this.queue.length;
        this.queue = this.queue.filter((id, i) => i === this.queueIdx || !gone.has(id));
        changed = this.queue.length !== beforeLen;
      }
      if (added.length) {
        this.queue.push(...added);
        changed = true;
        //  si la lista manda por estrellas, las altas no van al
        // final «porque sí»: cada una entra en su puesto por nota
        // dentro de lo que queda por sonar.
        if ((pl.sort || 'stars') === 'stars' && typeof this.resortUpcomingQueue === 'function') {
          this.resortUpcomingQueue(false);
        }
      }
      if (changed) {
        const qi = curId ? this.queue.indexOf(curId) : -1;
        if (qi >= 0) this.queueIdx = qi;
        else this.queueIdx = Math.min(this.queueIdx, Math.max(0, this.queue.length - 1));
        if (typeof this.renderQueue === 'function') this.renderQueue();
      }
      this._plSyncIds = plIds;
    },

    /*  reordena SOLO lo que queda por sonar de la cola (la
 * actual y lo ya sonado no se tocan), que es donde la promesa
 * «la cola va por más valoradas» tiene que cumplirse en vivo:
 * hasta ahora valorar una canción reordenaba la lista pero la
 * cola se quedaba como nació, y vista y cola divergían.
 * - byPlaylist=true: manda el orden vigente de la lista
 * (playlistTracksSorted con su criterio); las pistas
 * ajenas a la lista conservan su orden relativo al final.
 * - byPlaylist=false: manda la nota (más valoradas primero).
 * El sort es estable: a igualdad, cada pista conserva el puesto
 * que ya tenía en la cola (el arrastre manual sobrevive entre
 * iguales). Con aleatorio no se toca nada. */
    resortUpcomingQueue(byPlaylist) {
      if (this.shuffle || !Array.isArray(this.queue)) return;
      if (this.queueIdx >= this.queue.length - 1) return;
      const head = this.queue.slice(0, this.queueIdx + 1);
      const tail = this.queue.slice(this.queueIdx + 1);
      if (!tail.length) return;
      let sorted;
      if (byPlaylist) {
        if (!this.playContext || this.playContext.type !== 'playlist') return;
        const pl = this.playlists.find(p => p.id === this.playContext.id);
        if (!pl) return;
        const rank = new Map(this.playlistTracksSorted(pl).map((t, i) => [t.id, i]));
        sorted = tail.slice().sort((a, b) =>
          (rank.has(a) ? rank.get(a) : Number.MAX_SAFE_INTEGER) -
          (rank.has(b) ? rank.get(b) : Number.MAX_SAFE_INTEGER));
      } else {
        const byId = this.trackMap();
        sorted = tail.slice().sort((a, b) =>
          this._ratingOf(byId.get(b)) - this._ratingOf(byId.get(a)));
      }
      if (sorted.every((id, i) => id === tail[i])) return;
      this.queue = head.concat(sorted);
      if (typeof this.saveSession === 'function') this.saveSession();
      if (typeof this.renderQueue === 'function') this.renderQueue();
    },

    next(auto) {
      if (auto && this._sleepFading) return;
      //  un salto manual a mitad de canción cuenta como «saltada»
      // en estadísticas (el automático al terminar, no).
      if (!auto && this.isPlaying && typeof this._registerSkip === 'function') {
        this._registerSkip();
      }
      // Fin natural o fundido: la pista saliente sonó entera y cuenta
      // en estadísticas. Un next manual no pasa por aquí
      // (auto=false); un archivo que falla llega con isPlaying=false
      // desde _handleDecodeFailure; y el candado por pase evita
      // contar dos veces si también lo cierra el gapless.
      if (auto && this.isPlaying && typeof this.trackPlayCompleted === 'function') {
        this.trackPlayCompleted();
      }
      if (!auto) {
        this._cancelCrossfade();
        this._gaplessArmed = false;
      }
      if (auto && this._sleepEndOfTrack) {
        this._fireSleep();
        return;
      }
      //  sincronizar la cola con su lista SIN resucitar bajas.
      // Antes aquí se reconstruía la cola entera desde la lista en
      // cuanto difería: quitar una canción de la cola (o reordenarla
      // arrastrando, o vaciar las siguientes) se deshacía al pasar a
      // la siguiente pista, que es el fallo que reportó el usuario.
      // Ahora la cola manda: solo entran las altas nuevas de la
      // lista y salen las que ya no están en ella (ver
      // _syncQueueWithPlaylist). Con shuffle manda _originalQueue.
      if (!this.shuffle) this._syncQueueWithPlaylist();
      const xfadeOn = this.crossfadeEnabled && this.crossfadeDuration > 0;
      if (auto && !this._xfadeIncoming && !xfadeOn && this._gaplessEnabled && this.gaplessNext()) {
        return;
      }
      if (this.repeat === 'one' && auto) {
        this.audio.currentTime = 0;
        this.togglePlay(true);
        return;
      }
      const nextIdx = this._nextQueueIndex(!!auto);
      if (nextIdx == null) {
        this.togglePlay(false);
        this.seekToTime(0);
        this.isPlaying = false;
        this.updatePlayUI();
        return;
      }
      this.playFromQueue(nextIdx);
    },

    prev() {
      this._cancelCrossfade();
      this._gaplessArmed = false;
      //  ir a la anterior a mitad de canción también es un salto
      // (reiniciar la misma con >3 s no: eso lo gestiona el if).
      if (this.audio.currentTime <= 3 && this.isPlaying && typeof this._registerSkip === 'function') {
        this._registerSkip();
      }
      if (this.audio.currentTime > 3) {
        this.audio.currentTime = 0;
        this.updateMediaPosition(true);
        return;
      }
      let prev = this.queueIdx - 1;
      if (prev < 0) prev = this.queue.length - 1;
      this.playFromQueue(prev);
    },

    _nextQueueIndex(auto) {
      if (!this.queue.length) return null;
      let nextIdx = this.queueIdx + 1;
      if (nextIdx >= this.queue.length) {
        if (this.repeat === 'all' || !auto) return 0;
        return null;
      }
      return nextIdx;
    },

    _fisherYates(arr) {
      for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        const tmp = arr[i]; arr[i] = arr[j]; arr[j] = tmp;
      }
      return arr;
    },

    /* Baraja la cola dejando en cabeza la pista que debe sonar primero.
     *
     * `firstId` es opcional: si se omite se usa la pista actual (así lo hace
     * el botón Aleatorio). Los llamadores que acaban de crear una cola nueva
     * (playlist, favoritos, álbum/artista) pasan el primer id de esa cola,
     * porque en ese momento `currentTrack` todavía es la canción anterior.
     *
     * Antes se quitaba el elemento por POSICIÓN (`queueIdx`) y se volvía a
     * insertar `currentTrack` delante: si la pista actual no pertenecía a la
     * cola nueva se colaba una canción ajena como primera (y sonaba), y si no
     * había pista actual se perdía la canción que ocupaba `queueIdx`.
     * Ahora se quita por id y nunca se añaden pistas que no estén en la cola.
     */
    _applyShuffle(firstId) {
      const base = this.queue.slice();
      this._originalQueue = base.slice();
      let anchor = firstId;
      if (anchor === undefined) {
        const cur = this.currentTrack && this.currentTrack.id;
        anchor = cur || null;
      }
      // Solo se ancla si de verdad está en la cola; si no, se baraja entera.
      if (anchor === null || !base.includes(anchor)) anchor = null;
      const rest = anchor === null
        ? base
        : base.filter((id, i) => i !== base.indexOf(anchor));
      this._fisherYates(rest);
      this.queue = anchor === null ? rest : [anchor, ...rest];
      this.queueIdx = 0;
    },

    _restoreShuffle() {
      if (!this._originalQueue || !this._originalQueue.length) {
        this._originalQueue = null;
        return;
      }
      const cur = this.currentTrack && this.currentTrack.id;
      const restored = this._originalQueue.filter(id => this.trackMap().has(id));
      this._originalQueue = null;
      if (!restored.length) return;
      this.queue = restored;
      const idx = cur ? this.queue.indexOf(cur) : 0;
      this.queueIdx = idx >= 0 ? idx : 0;
    },

    _removeFromOriginalQueue(trackId) {
      if (!this._originalQueue || !trackId) return;
      const i = this._originalQueue.indexOf(trackId);
      if (i >= 0) this._originalQueue.splice(i, 1);
    },

    _setPlaybackGain(g, immediate) {
      if (!this.gainNode || !this.audioCtx) return;
      const v = (typeof g === 'number' && isFinite(g)) ? g : 1;
      try {
        const now = this.audioCtx.currentTime;
        this.gainNode.gain.cancelScheduledValues(now);
        if (immediate) this.gainNode.gain.setValueAtTime(v, now);
        else {
          this.gainNode.gain.setValueAtTime(this.gainNode.gain.value, now);
          this.gainNode.gain.linearRampToValueAtTime(v, now + 0.12);
        }
      } catch (e) {}
    },

    async applyNormalization(track) {
      const t = track || this.currentTrack;
      if (!this._normalizeVolume) {
        this._normGain = 1;
        this._setPlaybackGain(1, true);
        return;
      }
      if (!t) return;
      const g = await this.computeTrackGain(t);
      if (this.currentTrack && t.id !== this.currentTrack.id) return;
      this._normGain = g;
      this._setPlaybackGain(g, false);
    },

    _cancelCrossfade() {
      if (this._xfadeTimer) {
        clearTimeout(this._xfadeTimer);
        this._xfadeTimer = null;
      }
      this._xfadeStarted = false;
      if (this.gainNode && this.audioCtx && !this._xfadeIncoming && !this._sleepFading) {
        this._setPlaybackGain(this._normGain || 1, true);
      }
    },

    _startCrossfadeOut(remain) {
      this._xfadeStarted = true;
      const dur = Math.max(0.05, remain);
      if (this.gainNode && this.audioCtx) {
        try {
          const now = this.audioCtx.currentTime;
          const g = this.gainNode.gain;
          g.cancelScheduledValues(now);
          g.setValueAtTime(g.value, now);
          g.linearRampToValueAtTime(0.001, now + dur);
        } catch (e) {}
      }
      const ms = Math.max(40, dur * 1000 - 50);
      this._xfadeTimer = setTimeout(() => {
        this._xfadeTimer = null;
        this._xfadeStarted = false;
        this._xfadeIncoming = true;
        this.next(true);
      }, ms);
    },

    /* timeupdate: gapless ~80 ms antes del corte, o arranque de crossfade. */
    tickPlaybackAdvance() {
      if (!this.isPlaying || !this.audio || this._sleepFading) return;
      const dur = this.audio.duration;
      const cur = this.audio.currentTime;
      if (!isFinite(dur) || dur <= 0) return;
      const remain = dur - cur;
      if (remain > 12) {
        this._gaplessArmed = false;
        if (this._xfadeStarted && remain > (this.crossfadeDuration || 0) + 0.5) {
          this._cancelCrossfade();
        }
        return;
      }
      if (this._sleepEndOfTrack && remain <= 10.05 && remain > 0) {
        this._fireSleep();
        return;
      }
      if (this.repeat === 'one') return;
      const xfade = this.crossfadeEnabled && this.crossfadeDuration > 0;
      if (xfade) {
        if (remain <= this.crossfadeDuration && remain > 0.02 && !this._xfadeStarted) {
          if (this._nextQueueIndex(true) == null) return;
          this._startCrossfadeOut(remain);
        }
        return;
      }
      //  la ventana era de 80 ms, pero 'timeupdate' llega
      // cada ~250 ms: casi ningún evento caía dentro y el gapless
      // era inerte (se oía el corte del 'ended' normal). Con
      // 0,35 s el intercambio entra en la ventana de un evento.
      if (this._gaplessEnabled && remain <= 0.35 && remain > 0 && !this._gaplessArmed) {
        this._gaplessArmed = true;
        if (!this.gaplessNext()) this._gaplessArmed = false;
      }
    },

    updateMediaPosition(force) {
      if (!('mediaSession' in navigator) || !this.audio) return;
      const now = Date.now();
      if (!force && this._lastPosState && now - this._lastPosState < 1000) return;
      this._lastPosState = now;
      try {
        const dur = this.audio.duration;
        if (!isFinite(dur) || dur <= 0) return;
        const pos = Math.max(0, Math.min(Number(this.audio.currentTime) || 0, Math.max(0, dur - 0.001)));
        navigator.mediaSession.setPositionState({
          duration: dur,
          playbackRate: this.audio.playbackRate || 1,
          position: pos
        });
        navigator.mediaSession.playbackState = this.isPlaying ? 'playing' : 'paused';
      } catch (e) {}
    },

    seekToTime(sec) {
      if (!this.audio) return;
      this._gaplessArmed = false;
      if (this._xfadeStarted) this._cancelCrossfade();
      const dur = this.audio.duration;
      const n = Number(sec);
      // NaN/Infinity no deben convertirse en 0 (eso rebobinaba la pista
      // al pulsar una tecla con la duración aún desconocida).
      if (!isFinite(n)) return;
      let t = n;
      if (isFinite(dur) && dur > 0) t = Math.max(0, Math.min(dur - 0.05, t));
      else t = Math.max(0, t);
      try { this.audio.currentTime = t; } catch (e) {}
      //  ídem seekTo — la base de escucha salta con el seek.
      this._currentPlayBaseTime = this.audio.currentTime;
      this._statsWallBase = Date.now();
      this.updateProgress();
      this.updateMediaPosition(true);
    },
    seekTo(ratio) {
      if (!this.audio || !this.audio.duration || !isFinite(this.audio.duration)) return;
      // Sin clamp, un clic con rect.width=0 o un gesto fuera de rango
      // producía NaN/Infinity y `currentTime` lanzaba DOMException.
      const r = Number(ratio);
      if (!isFinite(r)) return;
      this._gaplessArmed = false;
      if (this._xfadeStarted) this._cancelCrossfade();
      try {
        this.audio.currentTime = Math.max(0, Math.min(1, r)) * this.audio.duration;
      } catch (e) {
        return;
      }
      //  la base de «tiempo escuchado» salta con el seek; si
      // no, el flush contaba el tramo saltado como escuchado.
      this._currentPlayBaseTime = this.audio.currentTime;
      this._statsWallBase = Date.now();
      this.updateProgress();
      this.updateMediaPosition(true);
    },

    setVolume(v) {
      const n = Number(v);
      if (!isFinite(n)) return; // un <input type=range> vacío da NaN
      this.volume = Math.max(0, Math.min(1, n));
      if (this.audio) {
        try { this.audio.volume = this.volume; } catch (e) {}
      }
      const pct = Math.round(this.volume * 100);
      //  volumeSlider/volumeValue vivían en la hoja retirada.
      const sv2 = document.getElementById('volumeSliderNp');
      const vv2 = document.getElementById('volumeValueNp');
      if (sv2) sv2.value = pct;
      if (vv2) vv2.textContent = pct + '%';
      this._updateVolumeIcon();
      try { localStorage.setItem('aurora_volume', String(this.volume)); } catch(e){}
    },

    _updateVolumeIcon() {
      const name = this.volume <= 0.001 ? 'volume-xmark'
                 : this.volume < 0.4 ? 'volume-low'
                 : 'volume-high';
      ['btnVolume', 'npVolIcon'].forEach(id => {
        const root = document.getElementById(id);
        if (root) this.setIco(root, name);
      });
    },

    showNpVolume(show) {
      const el = document.getElementById('npVolume');
      if (!el) return;
      const on = show === undefined ? el.hasAttribute('hidden') : !!show;
      if (on) {
        el.removeAttribute('hidden');
        el.classList.add('open');
        const sl = document.getElementById('volumeSliderNp');
        if (sl) sl.value = Math.round(this.volume * 100);
      } else {
        el.setAttribute('hidden', '');
        el.classList.remove('open');
      }
      clearTimeout(this._npVolHide);
      if (on) {
        this._npVolHide = setTimeout(() => this.showNpVolume(false), 4000);
      }
    },

    toggleShuffle() {
      this.shuffle = !this.shuffle;
      if (this.shuffle) this._applyShuffle();
      else this._restoreShuffle();
      this.setShuffleUI();
      this.renderQueue();
      // La «siguiente» cambia al barajar: refrescar la precarga (gapless) para
      // no dejar cacheada la pista que ya no va a sonar.
      if (typeof this.preloadNextTrack === 'function') this.preloadNextTrack();
      this.saveSession();
      this.toast(this.shuffle ? this.t('toast_shuffle_on') : this.t('toast_shuffle_off'));
    },

    cycleRepeat() {
      this.repeat = this.repeat === 'off' ? 'all' : this.repeat === 'all' ? 'one' : 'off';
      this.setRepeatUI();
      const repLabel = this.repeat === 'off' ? this.t('toast_repeat_off')
                     : this.repeat === 'all' ? this.t('toast_repeat_all')
                     : this.t('toast_repeat_one');
      this.toast(this.t('repeat') + ': ' + repLabel);
    },

    toggleFavorite() {
      if (!this.currentTrack) return;
      this.toggleFavoriteFor(this.currentTrack.id);
    },

    /* Alterna el favorito de CUALQUIER pista (no solo la que suena).
     * Lo usa el menú de pista, porque antes la única forma de marcar una
     * canción era abrirla en el reproductor y pulsar el corazón. */
    toggleFavoriteFor(trackId) {
      const t = this.tracks.find(x => x.id === trackId);
      if (!t) return;
      if (this.favorites.has(trackId)) this.favorites.delete(trackId);
      else this.favorites.add(trackId);
      this.saveFavorites();
      if (this.currentTrack && this.currentTrack.id === trackId) this.updateFavoriteUI();
      if (typeof this.renderFavorites === 'function') this.renderFavorites();
      this.toast(this.favorites.has(trackId) ? this.t('toast_added_fav') : this.t('toast_removed_fav'));
    },

    updateFavoriteUI() {
      const liked = this.currentTrack && this.favorites.has(this.currentTrack.id);
      ['btnLike'].forEach(id => {
        const b = document.getElementById(id);
        if (!b) return;
        b.classList.toggle('liked', liked);
        b.setAttribute('aria-pressed', liked ? 'true' : 'false');
        this.setIco(b, liked ? 'heart-solid' : 'heart');
      });
    },

    /* ============================================================
     *  Control de tono y velocidad (Preserves Pitch)
     * ============================================================ */
    setPreservesPitch(enabled) {
      this.preservesPitch = !!enabled;
      try {
        localStorage.setItem('aurora_preserves_pitch', this.preservesPitch ? 'true' : 'false');
      } catch (e) {}
      if (this.audio) {
        this.audio.preservesPitch = this.preservesPitch;
        this.audio.mozPreservesPitch = this.preservesPitch;
        this.audio.webkitPreservesPitch = this.preservesPitch;
      }
      const chk = document.getElementById('chkPreservePitch');
      if (chk) chk.checked = this.preservesPitch;
    },

    /* ============================================================
     *  Repetición A-B (A-B Repeat)
     *  Convive con el bucle de sección de Letras (lrcLoop):
 * este actúa sobre dos instantes de la canción desde el
 * reproductor; aquel, sobre dos líneas de la letra.
 * ============================================================ */
    toggleABRepeat() {
      if (!this.audio || !this.currentTrack || !this.audio.src) {
        this.toast(this.t('no_track_playing'));
        return;
      }
      if (!this.abRepeat) this.abRepeat = { active: false, a: null, b: null };
      const cur = Number(this.audio.currentTime) || 0;
      if (this.abRepeat.a === null) {
        this.abRepeat.a = cur;
        this.abRepeat.b = null;
        this.abRepeat.active = false;
        this.updateABRepeatUI();
        this.toast(this.t('ab_set_a').replace('X', this.fmtTime(cur)));
      } else if (this.abRepeat.b === null) {
        if (cur <= this.abRepeat.a + 0.3) {
          this.abRepeat.b = this.abRepeat.a + 1.0;
        } else {
          this.abRepeat.b = cur;
        }
        this.abRepeat.active = true;
        this.updateABRepeatUI();
        this.toast(this.t('ab_active')
          .replace('X', this.fmtTime(this.abRepeat.a))
          .replace('Y', this.fmtTime(this.abRepeat.b)));
        if (this.audio && (this.audio.currentTime < this.abRepeat.a || this.audio.currentTime >= this.abRepeat.b)) {
          this.seekToTime(this.abRepeat.a);
        }
      } else {
        this.clearABRepeat();
        this.toast(this.t('ab_cleared'));
      }
    },

    clearABRepeat() {
      this.abRepeat = { active: false, a: null, b: null };
      this.updateABRepeatUI();
    },

    updateABRepeatUI() {
      const btn = document.getElementById('btnABRepeat');
      const range = document.getElementById('progressAbRange');
      if (btn) {
        btn.classList.remove('setting-b', 'active');
        const badge = btn.querySelector('.ab-badge') || btn;
        if (this.abRepeat && this.abRepeat.a !== null && this.abRepeat.b === null) {
          btn.classList.add('setting-b');
          btn.setAttribute('aria-pressed', 'false');
          btn.title = this.t('ab_set_a').replace('X', this.fmtTime(this.abRepeat.a));
          badge.textContent = 'A→';
        } else if (this.abRepeat && this.abRepeat.active && this.abRepeat.b !== null) {
          btn.classList.add('active');
          btn.setAttribute('aria-pressed', 'true');
          btn.title = this.t('ab_active')
            .replace('X', this.fmtTime(this.abRepeat.a))
            .replace('Y', this.fmtTime(this.abRepeat.b));
          badge.textContent = 'A⇄B';
        } else {
          btn.setAttribute('aria-pressed', 'false');
          btn.title = this.t('ab_repeat');
          badge.textContent = 'A-B';
        }
      }
      if (range) {
        const dur = (this.audio && this.audio.duration) || (this.currentTrack && this.currentTrack.duration) || 0;
        if (this.abRepeat && this.abRepeat.a !== null && dur > 0) {
          range.removeAttribute('hidden');
          const startPct = (this.abRepeat.a / dur) * 100;
          const endPct = this.abRepeat.b !== null ? (this.abRepeat.b / dur) * 100 : Math.min(100, startPct + 0.8);
          range.style.left = startPct + '%';
          range.style.width = Math.max(0.5, endPct - startPct) + '%';
        } else {
          range.setAttribute('hidden', '');
        }
      }
    },

    /* ============================================================
     *  Visualizador de frecuencias en tiempo real (AnalyserNode)
     * ============================================================ */
    /*  ¿pide el sistema «reducir movimiento»? Se consulta EN
 * VIVO, sin cachear: el usuario puede cambiar el ajuste con la
 * app abierta y el lienzo debe obedecer al momento. Lo usan el
 * arranque del visualizador y su propio bucle de dibujo. */
    _prefersReducedMotion() {
      try {
        return !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
      } catch (e) { return false; }
    },

    initVisualizer() {
      let saved = null;
      try {
        saved = localStorage.getItem('aurora_visualizer_mode');
      } catch (e) {}
      if (!saved) {
        // Respetar reduced-motion: desactivado por defecto si el usuario
        // prefiere movimiento reducido.
        if (this._prefersReducedMotion()) saved = 'off';
      }
      //  solo queda la onda (las barras tapaban el cover). Lo
      // guardado como «bars» migra a «wave» y se re-persiste para
      // que el almacenamiento diga la verdad; por defecto, onda.
      if (saved === 'bars') {
        saved = 'wave';
        try { localStorage.setItem('aurora_visualizer_mode', 'wave'); } catch (e) {}
      }
      this.visualizerMode = saved || 'wave';
      this.updateVisualizerUI();
      //  si el ajuste de movimiento del sistema cambia con la
      // app abierta, obedecer al momento: con «reducir» se para el
      // bucle (queda la onda quieta de stopVisualizer) y sin él se
      // reanuda si estaba sonando. El bucle además se autocomprueba
      // en cada fotograma, por si un WebView viejo no avisa.
      if (!this._visMotionWired) {
        this._visMotionWired = true;
        try {
          const mq = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)');
          if (mq) {
            const onMotionChange = () => {
              if (this._prefersReducedMotion()) this.stopVisualizer();
              else if (this.isPlaying) this.startVisualizer();
            };
            if (typeof mq.addEventListener === 'function') mq.addEventListener('change', onMotionChange);
            else if (typeof mq.addListener === 'function') mq.addListener(onMotionChange);
          }
        } catch (e) {}
      }
      if (this.isPlaying) this.startVisualizer();
    },

    setVisualizerMode(mode) {
      if (mode === 'bars') mode = 'wave'; //  modo retirado, migra a onda
      this.visualizerMode = mode;
      try { localStorage.setItem('aurora_visualizer_mode', mode); } catch (e) {}
      this.updateVisualizerUI();
      const labels = {
        wave: this.t('visualizer_wave'),
        off: this.t('visualizer_off')
      };
      this.toast(this.t('visualizer') + ': ' + (labels[mode] || mode));
      if (mode === 'off') {
        this.stopVisualizer();
      } else if (this.isPlaying) {
        this.startVisualizer();
      }
    },

    cycleVisualizerMode() {
      //  sin barras, el ciclo es onda ↔ apagado.
      this.setVisualizerMode(this.visualizerMode === 'wave' ? 'off' : 'wave');
    },

    updateVisualizerUI() {
      const btn = document.getElementById('btnVisualizer');
      const sec = document.getElementById('visualizerSection');
      if (btn) {
        btn.classList.toggle('active', this.visualizerMode !== 'off');
        btn.setAttribute('aria-pressed', this.visualizerMode !== 'off' ? 'true' : 'false');
      }
      if (sec) {
        //  visible también con el ajuste en «off» mientras dure
        // el modo inmersivo de portada; al salir, vuelve el ajuste.
        sec.style.display = (this.visualizerMode === 'off' && !this._coverFs) ? 'none' : 'block';
      }
    },

    /* Ajusta el canvas a su tamaño real (DPR máx 2) para dibujar nítido
     * sin sobredimensionar en pantallas densas. */
    _fitVisualizerCanvas(canvas) {
      try {
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        const w = Math.max(1, Math.floor(canvas.clientWidth * dpr));
        const h = Math.max(1, Math.floor(canvas.clientHeight * dpr));
        if (canvas.width !== w || canvas.height !== h) {
          canvas.width = w;
          canvas.height = h;
          this._visGrad = null;
          this._visGradKey = null;
          this._visWaveFill = null;
          this._visWaveFillKey = null;
        }
      } catch (e) {}
    },

    startVisualizer() {
      //  en portada a pantalla completa la onda se muestra
      // aunque el ajuste sea «apagado» (sin cambiar la preferencia).
      if (this.visualizerMode === 'off' && !this._coverFs) return;
      if (this._visRafId || this._visTimer) return;
      const canvas = document.getElementById('visualizerCanvas');
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      this._fitVisualizerCanvas(canvas);
      //  con «reducir movimiento» el bucle ni arranca: se
      // pinta UNA vez la onda quieta de reposo y se sale. Cubre
      // también el modo inmersivo, que fuerza la onda aunque
      // el ajuste esté en «apagado»: la calma manda.
      if (this._prefersReducedMotion()) {
        this._drawVisualizerIdle(canvas, ctx);
        return;
      }

      // Pausar el dibujado cuando el canvas no está en pantalla
      // (otra vista, sheet encima): ahorra batería en móvil.
      if (!this._visObserver && 'IntersectionObserver' in window) {
        try {
          this._visVisible = true;
          this._visObserver = new IntersectionObserver((entries) => {
            this._visVisible = entries.length ? !!entries[entries.length - 1].isIntersecting : true;
          }, { threshold: 0.02 });
          this._visObserver.observe(canvas);
        } catch (e) {
          this._visObserver = null;
        }
      }

      let last = 0;
      const render = (now) => {
        if (!this.isPlaying || (this.visualizerMode === 'off' && !this._coverFs)) {
          this._visRafId = null;
          this._visTimer = null;
          ctx.clearRect(0, 0, canvas.width, canvas.height);
          return;
        }
        if (this._visVisible === false || document.hidden) {
          // Fuera de pantalla: reintentar en 500 ms sin dibujar
          this._visRafId = null;
          this._visTimer = setTimeout(() => {
            this._visTimer = null;
            if (this.isPlaying && (this.visualizerMode !== 'off' || this._coverFs) && !this._visRafId) {
              this._visRafId = requestAnimationFrame(render);
            }
          }, 500);
          return;
        }
        //  si el sistema activó «reducir movimiento» a mitad
        // de canción y el aviso de cambio no llegó (WebView sin
        // listener), el propio bucle se detiene y deja pintada la
        // onda de reposo, en vez de seguir bailando.
        if (this._prefersReducedMotion()) {
          this._visRafId = null;
          this._visTimer = null;
          this._drawVisualizerIdle(canvas, ctx);
          return;
        }
        this._visRafId = requestAnimationFrame(render);
        if (now - last < 16) return; // ~60 fps: a 30 las barras iban a saltos
        const dt = Math.min(100, Math.max(1, now - (last || now - 33)));
        last = now;
        // Reajustar si el layout cambió (vista oculta al arrancar, rotación)
        try {
          const dpr = Math.min(window.devicePixelRatio || 1, 2);
          if (canvas.clientWidth > 0 && Math.abs(canvas.width - canvas.clientWidth * dpr) > 2) {
            this._fitVisualizerCanvas(canvas);
          }
        } catch (e) {}
        this.drawVisualizerFrame(canvas, ctx, dt);
      };
      this._visRafId = requestAnimationFrame(render);
    },

    stopVisualizer() {
      if (this._visRafId) {
        cancelAnimationFrame(this._visRafId);
        this._visRafId = null;
      }
      if (this._visTimer) {
        clearTimeout(this._visTimer);
        this._visTimer = null;
      }
      const canvas = document.getElementById('visualizerCanvas');
      if (canvas) {
        const ctx = canvas.getContext('2d');
        // [11]: antes se limpiaba a negro y el área parecía rota en
        // pausa. Ahora se pinta el estado de reposo (onda quieta,).
        if (ctx) this._drawVisualizerIdle(canvas, ctx);
      }
    },

    /* Estado de reposo del visualizador: la misma retícula de barras
     * en su altura mínima, con la paleta de la portada atenuada. Se
     * reconoce como «en pausa», no como un hueco sin contenido. */
    _drawVisualizerIdle(canvas, ctx) {
      const w = canvas.width, h = canvas.height;
      ctx.clearRect(0, 0, w, h);
      const cols = this._visColors();
      const grad = ctx.createLinearGradient(0, 0, w, 0);
      grad.addColorStop(0, this._hexA(cols.from, 0.35));
      grad.addColorStop(0.5, this._hexA(cols.to, 0.35));
      grad.addColorStop(1, this._hexA(cols.from, 0.35));
      //  también en reposo manda la onda: una línea senoidal
      // suave y quieta, nada de la fila de barras bajas de antes.
      const midY = h / 2;
      const amp = Math.max(2, h * 0.12);
      ctx.strokeStyle = grad;
      ctx.lineWidth = Math.max(2, Math.min(3, w / 220));
      ctx.lineJoin = 'round';
      ctx.lineCap = 'round';
      ctx.beginPath();
      const steps = 64;
      for (let i = 0; i <= steps; i++) {
        const x = (i / steps) * w;
        const y = midY + Math.sin((i / steps) * Math.PI * 4) * amp;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
    },

    /* ---------- Visualizador: utilidades de dibujo ---------- */

    /* Colores del visualizador: la paleta de la portada que suena
     * (cover.from/cover.to, las mismas --cover-from/--cover-to del
     * fondo). Antes el gradiente era violeta/rosa fijo y nunca usó la
     * paleta dinámica pese a calcularse «para el fondo y
     * visualizador». Sin portada con paleta, el clásico de siempre. */
    _visColors() {
      //  misma fuente que el fondo (antes, con portada de imagen,
      // el visualizador caía a un violeta fijo que no era ni la
      // portada ni el acento).
      const pal = (this.currentTrack && typeof this.coverPaletteFor === 'function')
        ? this.coverPaletteFor(this.currentTrack) : null;
      return {
        from: (pal && typeof pal.from === 'string' && pal.from) || '#7C3AED',
        to: (pal && typeof pal.to === 'string' && pal.to) || '#EC4899'
      };
    },

    /* '#RRGGBB' (o '#RGB') + alpha → 'rgba(r,g,b,a)'. Si el color no
     * es hex, se devuelve tal cual (el alpha lo pondrá el degradado
     * con dos paradas del mismo color si hace falta). */
    _hexA(hex, alpha) {
      if (typeof hex !== 'string') return hex;
      let m = /^#([0-9a-f]{6})$/i.exec(hex.trim());
      if (!m) {
        const sh = /^#([0-9a-f]{3})$/i.exec(hex.trim());
        if (sh) m = [null, sh[1][0] + sh[1][0] + sh[1][1] + sh[1][1] + sh[1][2] + sh[1][2]];
      }
      if (!m) return hex;
      const n = parseInt(m[1], 16);
      return 'rgba(' + ((n >> 16) & 255) + ',' + ((n >> 8) & 255) + ',' + (n & 255) + ',' + alpha + ')';
    },

    /* Onda fluida: diezma el dominio temporal quedándose con la
     * muestra de mayor amplitud de cada tramo (conserva la forma sin
     * el zigzag de unir miles de puntos crudos) y suaviza el
     * resultado entre frames: la línea «respira» en vez de temblar. */
    _visWavePoints(timeData, count, dtMs) {
      if (!this._visWavePts || this._visWavePts.length !== count) {
        this._visWavePts = new Float32Array(count);
      }
      const pts = this._visWavePts;
      const bucket = timeData.length / count;
      for (let i = 0; i < count; i++) {
        const start = Math.floor(i * bucket);
        const stop = Math.min(timeData.length, Math.floor((i + 1) * bucket));
        let best = 0, bestAbs = -1;
        for (let j = start; j < stop; j++) {
          const v = (timeData[j] - 128) / 128;
          const a = v < 0 ? -v : v;
          if (a > bestAbs) { bestAbs = a; best = v; }
        }
        // (idea 4): la onda tiene memoria — sube con ataque
        // rápido (55 ms) pero baja con relajación lenta
        // (260 ms). Antes un solo tau de 55 ms la dejaba en cero
        // en cada silencio y al arrancar cada canción «despertaba»
        // de la nada; ahora respira entre frases y entre pistas
        // (los puntos nunca se reinician al cambiar de pista).
        const rising = Math.abs(best) > Math.abs(pts[i]);
        const k = 1 - Math.exp(-dtMs / (rising ? 55 : 260));
        pts[i] += (best - pts[i]) * k;
      }
      return pts;
    },

    drawVisualizerFrame(canvas, ctx, dtMs) {
      const w = canvas.width;
      const h = canvas.height;
      ctx.clearRect(0, 0, w, h);

      if (!this.analyser || !this.freqData) {
        return;
      }
      const dt = (typeof dtMs === 'number' && dtMs > 0) ? Math.min(100, dtMs) : 33;
      const cols = this._visColors();

      //  único modo: la onda fluida (las barras tapaban el cover).
      // Buffer temporal propio (fftSize muestras; antes se reusaba
      // el de frecuencias, la mitad de largo: onda pobre y dentada).
      if (!this._visTimeData || (this.analyser.fftSize && this._visTimeData.length !== this.analyser.fftSize)) {
        this._visTimeData = new Uint8Array(this.analyser.fftSize || this.freqData.length);
      }
      this.analyser.getByteTimeDomainData(this._visTimeData);
      const cssW = canvas.clientWidth || Math.round(w / 2);
      const count = Math.max(64, Math.min(140, Math.round(cssW / 4)));
      const pts = this._visWavePoints(this._visTimeData, count, dt);
      const midY = h / 2;
      const amp = h * 0.42;

      const key = 'wave:' + w + ':' + cols.from + '>' + cols.to;
      if (!this._visGrad || this._visGradKey !== key) {
        const grad = ctx.createLinearGradient(0, 0, w, 0);
        grad.addColorStop(0, cols.from);
        grad.addColorStop(0.5, cols.to);
        grad.addColorStop(1, cols.from);
        this._visGrad = grad;
        this._visGradKey = key;
      }
      const fkey = 'wavefill:' + h + ':' + cols.from + '>' + cols.to;
      if (!this._visWaveFill || this._visWaveFillKey !== fkey) {
        const fg = ctx.createLinearGradient(0, 0, 0, h);
        fg.addColorStop(0, this._hexA(cols.to, 0.05));
        fg.addColorStop(0.5, this._hexA(cols.to, 0.22));
        fg.addColorStop(1, this._hexA(cols.to, 0.05));
        this._visWaveFill = fg;
        this._visWaveFillKey = fkey;
      }

      // Trazo suavizado con curvas cuadráticas por puntos medios
      const tracePath = () => {
        ctx.beginPath();
        let px = 0, py = midY + pts[0] * amp;
        ctx.moveTo(px, py);
        for (let i = 1; i < count; i++) {
          const x = (i / (count - 1)) * w;
          const y = midY + pts[i] * amp;
          ctx.quadraticCurveTo(px, py, (px + x) / 2, (py + y) / 2);
          px = x; py = y;
        }
        ctx.lineTo(px, py);
      };

      const lineW = Math.max(2, Math.min(3.2, w / 220));
      ctx.lineJoin = 'round';
      ctx.lineCap = 'round';
      // Halo ancho y tenue bajo el trazo: la «fluidez» visual
      ctx.save();
      ctx.globalAlpha = 0.15;
      ctx.strokeStyle = this._visGrad;
      ctx.lineWidth = lineW * 3.4;
      tracePath();
      ctx.stroke();
      ctx.restore();
      // Relleno suave entre la onda y su línea central
      tracePath();
      ctx.lineTo(w, midY);
      ctx.lineTo(0, midY);
      ctx.closePath();
      ctx.fillStyle = this._visWaveFill;
      ctx.fill();
      // Trazo principal
      ctx.strokeStyle = this._visGrad;
      ctx.lineWidth = lineW;
      tracePath();
      ctx.stroke();
    }
});
