/* =====================================================================
 *  js/ui.js — Aurora Music Player
 *  Sheets · confirmación · vistas · Media Session · Wake Lock · Sleep · Toast
 *
 *  Parte del refactor (C) de app.js: mismo código, módulos por funcionalidad.
 *  Este archivo se carga tras js/state.js y completa el objeto App con
 *  Object.assign (los scripts son clásicos por compatibilidad webxdc).
 * ===================================================================== */

'use strict';

Object.assign(App, {
    /* ============================================================
     *  Sheets
     * ============================================================ */
    /* ============================================================
     *  Confirmación genérica (sustituye a confirm() nativo)
     *  Devuelve una Promise<boolean>: true = aceptar, false = cancelar.
     *  Si cierran el sheet por backdrop/X también resuelve false
     *  (ver hook en closeSheet).
     * ============================================================ */
    showConfirm(opts = {}) {
      return new Promise((resolve) => {
        // Si ya había una confirmación pendiente, resolverla como cancelada:
        // de lo contrario su Promise quedaría colgada para siempre.
        if (this._confirmResolver) {
          const prev = this._confirmResolver;
          this._confirmResolver = null;
          try { prev(false); } catch (e) {}
        }
        const sheet = document.getElementById('sheetConfirm');
        if (!sheet) {
          // Fallback extremo: sin markup, usar el nativo
          resolve(window.confirm(opts.message || ''));
          return;
        }
        const msg = document.getElementById('confirmMsg');
        const icon = document.getElementById('confirmIcon');
        const okBtn = document.getElementById('btnConfirmOk');
        const cancelBtn = document.getElementById('btnConfirmCancel');
        if (msg) msg.textContent = opts.message || '';
        // El panel de confirmación no tiene <h3>: se anuncia con el mensaje.
        const panel = sheet.querySelector('.sheet-panel');
        if (panel) panel.setAttribute('aria-labelledby', 'confirmMsg');
        if (icon) icon.classList.toggle('hidden', opts.danger === false);
        if (okBtn) {
          okBtn.textContent = opts.okLabel || this.t('confirm_ok');
          okBtn.classList.toggle('danger', opts.danger !== false);
        }
        if (cancelBtn) {
          if (opts.cancelLabel) cancelBtn.textContent = opts.cancelLabel;
          // hideCancel: aviso informativo con un solo botón (no pregunta)
          cancelBtn.style.display = opts.hideCancel ? 'none' : '';
        }
        let done = false;
        this._confirmResolver = (val) => {
          if (done) return;
          done = true;
          this._confirmResolver = null;
          this.closeSheet('sheetConfirm');
          resolve(val);
        };
        if (okBtn) okBtn.onclick = () => { if (this._confirmResolver) this._confirmResolver(true); };
        if (cancelBtn) cancelBtn.onclick = () => { if (this._confirmResolver) this._confirmResolver(false); };
        this.openSheet('sheetConfirm');
      });
    },

    openSheet(id) {
      const s = document.getElementById(id);
      if (!s) return;
      if (!this._sheetStack) this._sheetStack = [];
      if (!s.classList.contains('open')) {
        s._prevFocus = document.activeElement;
        this._sheetStack.push(id);
      } else {
        const i = this._sheetStack.lastIndexOf(id);
        if (i >= 0) this._sheetStack.splice(i, 1);
        this._sheetStack.push(id);
      }
      s.classList.add('open');
      /* Invariante de navegación: si se abre una pestaña (Biblioteca,
       * Buscar, Favoritos), su botón inferior queda activo. Así el
       * resaltado no depende de qué camino abrió la pestaña. */
      const TAB_NAV = { sheetLibrary: 'library', sheetSearch: 'search', sheetFavorites: 'favorites' };
      if (TAB_NAV[id] && typeof this.setNavActive === 'function') this.setNavActive(TAB_NAV[id]);
      // Quitar inert/aria-hidden del panel que se abre. La capa superior
      // se recalcula en _syncSheetLayer().
      try { s.inert = false; } catch (e) { s.removeAttribute('inert'); }
      s.setAttribute('aria-hidden', 'false');
      this._syncSheetLayer();
      const panel = s.querySelector('.sheet-panel');
      if (panel) {
        panel.setAttribute('role', 'dialog');
        panel.setAttribute('aria-modal', 'true');
        if (!panel.hasAttribute('tabindex')) panel.setAttribute('tabindex', '-1');
        // axe: un role=dialog sin nombre accesible es violación seria.
        // Se toma el <h3> del sheet; si no existe (p. ej. confirmación),
        // showConfirm() asigna aria-labelledby al mensaje.
        if (!panel.hasAttribute('aria-label') && !panel.hasAttribute('aria-labelledby')) {
          const heading = panel.querySelector('h3');
          if (heading) {
            if (!heading.id) heading.id = id + '-title';
            panel.setAttribute('aria-labelledby', heading.id);
          } else {
            panel.setAttribute('aria-label', this.t('app_title'));
          }
        }
      }
      const focusable = s.querySelector('button, a[href], input:not([type="hidden"]), textarea, select, [tabindex]:not([tabindex="-1"])');
      setTimeout(() => {
        try { (focusable || panel).focus({ preventScroll: true }); } catch (e) {}
      }, 40);
      // [4]: las hojas declaran aria-modal pero el Tab escapaba al
      // fondo (medido por auditoría externa). Se instala una sola vez
      // la trampa de foco sobre la hoja superior de la pila.
      if (!this._tabTrapBound) {
        this._tabTrapBound = true;
        document.addEventListener('keydown', (e) => this._sheetTabTrap(e), true);
      }
      if (typeof this.updateChrome === 'function') this.updateChrome();
    },
    /* Trampa de foco ([4]): con una hoja abierta, Tab/Shift+Tab
 * ciclan dentro de su panel; si el foco ya está fuera (p. ej. tras
 * cerrar una hoja hija), lo devuelve al primer/último control. */
    _sheetTabTrap(e) {
      if (e.key !== 'Tab' || !this._sheetStack || !this._sheetStack.length) return;
      const s = document.getElementById(this._sheetStack[this._sheetStack.length - 1]);
      if (!s || !s.classList.contains('open')) return;
      const panel = s.querySelector('.sheet-panel') || s;
      const sel = 'button:not([disabled]), a[href], area[href], input:not([type="hidden"]):not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';
      let f = Array.from(panel.querySelectorAll(sel)).filter(el => el.getClientRects().length > 0);
      if (!f.length) f = Array.from(panel.querySelectorAll(sel));
      if (!f.length) { e.preventDefault(); try { panel.focus({ preventScroll: true }); } catch (err) {} return; }
      const first = f[0], last = f[f.length - 1];
      const inside = panel.contains(document.activeElement);
      if (e.shiftKey && (!inside || document.activeElement === first)) {
        e.preventDefault(); try { last.focus({ preventScroll: true }); } catch (err) {}
      } else if (!e.shiftKey && (!inside || document.activeElement === last)) {
        e.preventDefault(); try { first.focus({ preventScroll: true }); } catch (err) {}
      }
    },
    closeSheet(id) {
      const s = document.getElementById(id);
      if (s) {
        s.classList.remove('open');
        s.setAttribute('aria-hidden', 'true');
        // inert evita que el foco del teclado entre en un sheet cerrado.
        // (En navegadores antiguos se ignora; el CSS visibility:hidden
        // ya lo impide).
        try { s.inert = true; } catch (e) { s.setAttribute('inert', ''); }
        const prev = s._prevFocus;
        s._prevFocus = null;
        if (this._sheetStack) {
          const i = this._sheetStack.lastIndexOf(id);
          if (i >= 0) this._sheetStack.splice(i, 1);
        }
        s.style.zIndex = '';
        this._syncSheetLayer();
        if ((!this._sheetStack || !this._sheetStack.length) && prev && typeof prev.focus === 'function') {
          try { prev.focus(); } catch (e) {}
        }
      }
      // Si se cierra el sheet de confirmación por backdrop/X, resolver false
      if (id === 'sheetConfirm' && this._confirmResolver) {
        this._confirmResolver(false);
      }
      // (: al cerrar la hoja de creación ya no hay «modo add»
      // que limpiar: _addingToPlaylistId fue extirpado.)
      // Si se cierra el sheet de edición, limpiar editing
      if (id === 'sheetEditPlaylist') {
        this._editingPlaylistId = null;
      }
      // Si se cierra una pestaña de navegación (Biblioteca, Buscar, Favoritos), volver a activar 'home'
      if (id === 'sheetLibrary' || id === 'sheetSearch' || id === 'sheetFavorites') {
        const remainingTabs = (this._sheetStack || []).filter(s => s === 'sheetLibrary' || s === 'sheetSearch' || s === 'sheetFavorites');
        if (!remainingTabs.length && typeof this.setNavActive === 'function') {
          this.setNavActive('home');
        }
      }
      if (typeof this.updateChrome === 'function') this.updateChrome();
    },

    _syncSheetLayer() {
      const stack = (this._sheetStack || []).filter(sid => {
        const el = document.getElementById(sid);
        return !!(el && el.classList.contains('open'));
      });
      stack.forEach((sid, i) => {
        const el = document.getElementById(sid);
        if (!el) return;
        const base = el.classList.contains('sheet-confirm')
          ? 160
          : (el.classList.contains('sheet-tab') ? 90 : 130);
        el.style.zIndex = String(base + i);
        const isTop = i === stack.length - 1;
        // Solo el sheet superior debe ser accesible. Los inferiores siguen
        // visibles pero quedan inertes para teclado y lectores de pantalla.
        el.setAttribute('aria-hidden', isTop ? 'false' : 'true');
        try { el.inert = !isTop; } catch (e) {
          if (isTop) el.removeAttribute('inert');
          else el.setAttribute('inert', '');
        }
      });
    },

    _trapSheetFocus(e) {
      const open = document.querySelectorAll('.sheet.open');
      if (!open.length) return;
      const sheet = open[open.length - 1];
      const nodes = Array.from(sheet.querySelectorAll(
        'button, [href], input:not([type="hidden"]), textarea, select, [tabindex]:not([tabindex="-1"])'
      )).filter(el => !el.disabled && el.offsetParent !== null);
      if (nodes.length < 1) return;
      const first = nodes[0];
      const last = nodes[nodes.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    },

    /* ============================================================
     *  Cambio de vista (player ↔ lyrics)
     * ============================================================ */
    showView(name) {
      //  el modo inmersivo de portada pertenece al reproductor;
      // al ir a otra vista se abandona (y al volver no resucita).
      if (name !== 'player' && this._coverFs && typeof this.setCoverFullscreen === 'function') {
        this.setCoverFullscreen(false);
      }
      const views = document.querySelectorAll('.view');
      const wide = document.documentElement.classList.contains('aurora-wide');
      views.forEach(v => {
        let isActive = v.dataset.view === name;
        if (wide && v.dataset.view === 'home') isActive = true;
        if (wide && v.dataset.view === 'player') isActive = name !== 'lyrics';
        if (isActive) v.classList.add('active');
        else v.classList.remove('active');
        // Una vista oculta solo con opacity/pointer-events seguía en el
        // orden de tabulación y en el árbol de accesibilidad: se podía
        // enfocar el reproductor desde Letras o al revés. inert la saca
        // del foco y aria-hidden del árbol; el CSS además la oculta con
        // visibility (ver .view en styles.css).
        try {
          v.inert = !isActive;
        } catch (e) {
          if (isActive) v.removeAttribute('inert');
          else v.setAttribute('inert', '');
        }
        v.setAttribute('aria-hidden', isActive ? 'false' : 'true');
      });
      // Si el foco estaba dentro de la vista que acaba de ocultarse, no
      // dejarlo en el vacío: moverlo a la navegación visible.
      const focused = document.activeElement;
      if (focused && typeof focused.closest === 'function') {
        const owner = focused.closest('.view');
        if (owner && !owner.classList.contains('active')) {
          const fallback = document.querySelector('.bottom-nav .nav-btn.active') ||
                           document.querySelector('.bottom-nav .nav-btn');
          if (fallback) {
            try { fallback.focus({ preventScroll: true }); } catch (e) {}
          }
        }
      }
      // Letras: RAF solo mientras la vista está visible.
      const lyricsOn = name === 'lyrics';
      if (!lyricsOn && this.lrcRafId) {
        cancelAnimationFrame(this.lrcRafId);
        this.lrcRafId = null;
      } else if (lyricsOn && typeof this.startLrcRafSync === 'function') {
        this.startLrcRafSync();
      }
      if (typeof this.updateChrome === 'function') this.updateChrome();
    },

    /* Al elegir una canción en una lista (playlist, cola, favoritos,
     * biblioteca, buscar, Inicio) se cierra el listado y se abre el
     * reproductor. Antes la lista se quedaba encima: la canción sonaba pero
     * el usuario seguía viendo el sheet y parecía que no había pasado nada. */
    openPlayerForTrackPick() {
      this.closeAllSheets();
      this.showView('player');
    },

    /* ============================================================
     *  Media Session API
     * ============================================================ */
    updateMediaSession() {
      if (!('mediaSession' in navigator) || !this.currentTrack) return;
      const t = this.currentTrack;
      try {
        navigator.mediaSession.metadata = new MediaMetadata({
          title: t.title,
          artist: t.artist,
          album: t.album,
          artwork: [
            { src: this.canvasToUrl(t, 96),   sizes: '96x96',   type: 'image/png' },
            { src: this.canvasToUrl(t, 256),  sizes: '256x256', type: 'image/png' },
            { src: this.canvasToUrl(t, 512),  sizes: '512x512', type: 'image/png' }
          ]
        });

        const safeSetAction = (action, handler) => {
          try {
            navigator.mediaSession.setActionHandler(action, handler);
          } catch (err) {}
        };

        safeSetAction('play', () => this.togglePlay(true));
        safeSetAction('pause', () => this.togglePlay(false));
        safeSetAction('previoustrack', () => this.prev());
        safeSetAction('nexttrack', () => this.next());
        safeSetAction('seekto', (d) => {
          if (d && d.seekTime != null) { this.seekToTime(d.seekTime); }
        });
        safeSetAction('seekbackward', (d) => {
          const skip = (d && d.seekOffset) ? d.seekOffset : 10;
          const curr = this.audio ? this.audio.currentTime : 0;
          this.seekToTime(Math.max(0, curr - skip));
        });
        safeSetAction('seekforward', (d) => {
          const skip = (d && d.seekOffset) ? d.seekOffset : 10;
          const curr = this.audio ? this.audio.currentTime : 0;
          this.seekToTime(curr + skip);
        });
        safeSetAction('stop', () => {
          this.togglePlay(false);
          this.seekToTime(0);
        });

        this.updateMediaPosition(true);
      } catch (e) {}
    },

    canvasToUrl(track, size) {
      if (!this._artworkCache) this._artworkCache = new Map();
      const key = (track.id || track.title) + ':' + size;
      if (this._artworkCache.has(key)) return this._artworkCache.get(key);
      const url = this._renderArtwork(track, size);
      // Caché acotada (FIFO): evita regenerar PNG en cada cambio de pista
      if (this._artworkCache.size >= 40) {
        const oldest = this._artworkCache.keys().next().value;
        this._artworkCache.delete(oldest);
      }
      this._artworkCache.set(key, url);
      return url;
    },

    _renderArtwork(track, size) {
      // La portada personalizada manda también en el artwork grande.
      if (track.customCover) {
        return size <= 96
          ? (track.customCover.thumb || track.customCover.lg || '')
          : (track.customCover.lg || track.customCover.thumb || '');
      }
      // Si la portada ya es una imagen (dataURL), usarla directamente
      const isImage = track.coverIsImage || (typeof track.cover === 'string' && track.cover.startsWith('data:'));
      if (size <= 96 && track.coverThumb) return track.coverThumb;
      if (size <= 256 && track.coverThumbLg) return track.coverThumbLg;
      if (track.coverThumbLg) return track.coverThumbLg;
      if (isImage) {
        return typeof track.cover === 'string' ? track.cover : '';
      }
      const c = document.createElement('canvas');
      c.width = size; c.height = size;
      const ctx = c.getContext('2d');
      const cover = (track.cover && typeof track.cover === 'object' && track.cover.from) ? track.cover : (this.coverFallback ? this.coverFallback() : { from: '#6E5CFF', to: '#FF7AB6' });
      const g = ctx.createLinearGradient(0,0,size,size);
      g.addColorStop(0, cover.from);
      g.addColorStop(1, cover.to);
      ctx.fillStyle = g; ctx.fillRect(0,0,size,size);
      ctx.fillStyle = 'rgba(255,255,255,0.9)';
      ctx.font = `900 ${size*0.45}px Outfit, ui-rounded, -apple-system, sans-serif`;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(this.coverInitial(track.title), size/2, size/2);
      return c.toDataURL('image/png');
    },

    /* Invalidar artwork cacheado (al borrar o re-etiquetar pistas). */
    _invalidateArtwork(trackId) {
      if (!this._artworkCache) return;
      if (!trackId) {
        this._artworkCache.clear();
        return;
      }
      for (const k of this._artworkCache.keys()) {
        if (k === trackId + ':96' || k === trackId + ':256' || k === trackId + ':512') {
          this._artworkCache.delete(k);
        }
      }
    },

    /* ============================================================
     *  Wake Lock (mantener pantalla encendida)
     * ============================================================ */
    async requestWakeLock() {
      try {
        if ('wakeLock' in navigator) {
          this.wakeLock = await navigator.wakeLock.request('screen');
        }
      } catch (e) {}
    },
    async releaseWakeLock() {
      if (this.wakeLock) {
        try { await this.wakeLock.release(); this.wakeLock = null; } catch(e) {}
      }
    },

    /* ============================================================
     *  Sleep timer
     * ============================================================ */
    startSleep(minutes) {
      this.cancelSleep();
      const parsed = parseInt(minutes, 10);
      // Aceptar solo enteros positivos. Antes, un valor inválido caía en
      // 1 minuto y apagaba la música sin que el usuario lo esperara.
      if (!isFinite(parsed) || parsed <= 0) {
        this.toast(this.t('sleep_invalid'));
        return false;
      }
      const mins = Math.min(24 * 60, parsed);
      this.sleepEndAt = Date.now() + mins * 60 * 1000;
      this.sleepTick = setInterval(() => {
        if (!this.sleepEndAt) return;
        if (Date.now() >= this.sleepEndAt) this._fireSleep();
        else this.updateSleepStatus();
      }, 1000);
      this.updateSleepStatus();
      this.toast(this.t('toast_sleep_started').replace('X', mins));
      return true;
    },
    startSleepEndOfTrack() {
      this.cancelSleep();
      this._sleepEndOfTrack = true;
      this.updateSleepStatus();
      this.toast(this.t('toast_sleep_eot'));
    },
    async _fireSleep() {
      if (this._sleepFading) return;
      this._sleepFading = true;
      const hadTimer = !!this.sleepEndAt || this._sleepEndOfTrack;
      if (this.sleepTimer) { clearTimeout(this.sleepTimer); this.sleepTimer = null; }
      if (this.sleepTick) { clearInterval(this.sleepTick); this.sleepTick = null; }
      this.sleepEndAt = null;
      this._sleepEndOfTrack = false;
      this.updateSleepStatus();
      if (!hadTimer && !this.isPlaying) {
        this._sleepFading = false;
        return;
      }
      const fadeSec = 10;
      try {
        if (this.audio && this.isPlaying) {
          if (this.gainNode && this.audioCtx) {
            const now = this.audioCtx.currentTime;
            const g = this.gainNode.gain;
            g.cancelScheduledValues(now);
            g.setValueAtTime(g.value, now);
            g.linearRampToValueAtTime(0.001, now + fadeSec);
            await new Promise(r => setTimeout(r, fadeSec * 1000));
          } else {
            const startVol = this.audio.volume;
            const steps = 20;
            for (let i = 1; i <= steps; i++) {
              if (!this._sleepFading) break;
              this.audio.volume = startVol * (1 - i / steps);
              await new Promise(r => setTimeout(r, fadeSec * 1000 / steps));
            }
          }
          //  ¿cancelado durante el fundido? cancelSleep ya
          // restauró ganancia y volumen: no pausar ni seguir.
          if (!this._sleepFading) return;
          this.togglePlay(false);
          try { this.audio.volume = this.volume; } catch (e) {}
          this._setPlaybackGain(this._normGain || 1, true);
        }
      } catch (e) {
        this.togglePlay(false);
      }
      this._sleepFading = false;
      document.querySelectorAll('.sleep-opt').forEach(x => x.classList.remove('active'));
      this.toast(this.t('toast_sleep_done'));
    },
    cancelSleep() {
      if (this.sleepTimer) { clearTimeout(this.sleepTimer); this.sleepTimer = null; }
      if (this.sleepTick) { clearInterval(this.sleepTick); this.sleepTick = null; }
      this.sleepEndAt = null;
      this._sleepEndOfTrack = false;
      if (this._sleepFading) {
        this._sleepFading = false;
        try { if (this.audio) this.audio.volume = this.volume; } catch (e) {}
        this._setPlaybackGain(this._normGain || 1, true);
      }
      this.updateSleepStatus();
    },
    updateSleepStatus() {
      const el = document.getElementById('sleepStatus');
      // No hay botón dedicado en la barra: el estado se refleja en la fila
      // «Sleep» del menú Más (y en el sheet si está abierto).
      const btn = document.getElementById('btnSleep') || document.getElementById('menuSleep');
      const menu = document.getElementById('menuSleep');
      // (idea 6): la fila «Sleep» del menú enseña la cuenta
      // atrás sin abrir su hoja (este método ya corre cada
      // segundo mientras el temporizador vive).
      const menuVal = document.getElementById('sleepMenuValue');
      if (this._sleepEndOfTrack) {
        if (el) el.textContent = this.t('sleep_eot_status');
        if (btn) btn.classList.add('active');
        if (menu) menu.classList.add('active');
        if (menuVal) menuVal.textContent = this.t('sleep_end_of_track');
        return;
      }
      if (this.sleepEndAt) {
        const ms = Math.max(0, this.sleepEndAt - Date.now());
        const m = Math.floor(ms / 60000);
        const s = Math.floor((ms % 60000) / 1000);
        const label = `${this.t('sleep_active_prefix')} ${m}:${String(s).padStart(2,'0')} ${this.t('sleep_remaining')}`;
        if (el) el.textContent = label;
        if (btn) btn.classList.add('active');
        if (menu) menu.classList.add('active');
        if (menuVal) menuVal.textContent = m + ':' + String(s).padStart(2, '0');
      } else {
        if (el) el.textContent = '';
        if (btn) btn.classList.remove('active');
        if (menu) menu.classList.remove('active');
        if (menuVal) menuVal.textContent = '';
      }
    },

    /* ============================================================
     *  Toast
     * ============================================================ */
    /* toast(msg, ms) admite:
     *   - un número de milisegundos,
     *   - 'danger',
     *   - un objeto { ms, danger, action: { label, onClick } }.
     * La acción (p. ej. «Deshacer») añade un botón al propio toast y
     * mantiene el aviso visible más tiempo para poder pulsarlo. */
    toast(msg, ms = 2400) {
      const t = document.getElementById('toast');
      if (!t) return;
      let danger = false;
      let action = null;
      if (ms === 'danger') { danger = true; ms = 2400; }
      else if (ms && typeof ms === 'object') {
        danger = !!ms.danger;
        action = ms.action || null;
        ms = ms.ms || (action ? 6000 : 2400);
      }
      // textContent limpia el botón de una acción anterior; después se
      // añade el nuevo para no arrastrar listeners viejos.
      t.textContent = msg;
      t.classList.toggle('is-danger', danger);
      t.classList.toggle('has-action', !!action);
      if (action && action.label) {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'toast-action';
        btn.textContent = action.label;
        btn.addEventListener('click', () => {
          clearTimeout(this._toastTimer);
          t.classList.remove('show');
          t.classList.remove('is-danger');
          t.classList.remove('has-action');
          try { if (typeof action.onClick === 'function') action.onClick(); } catch (e) {}
        });
        t.appendChild(btn);
      }
      // Forzar reflow para que el toast reaparezca aunque ya estuviera
      // visible con el mismo mensaje (dos borrados seguidos).
      void t.offsetWidth;
      t.classList.add('show');
      clearTimeout(this._toastTimer);
      this._toastTimer = setTimeout(() => {
        t.classList.remove('show');
        t.classList.remove('is-danger');
        t.classList.remove('has-action');
      }, ms);
    },

    esc(s) {
      // null/undefined no deben convertirse en la cadena "undefined" dentro
      // de un atributo o de innerHTML.
      if (s == null) return '';
      return String(s).replace(/[&<>"']/g, m => ({
        '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
      }[m]));
    },

    /* Markup único de estado vacío. Antes cada lista inventaba el suyo
     * (texto plano, <li> suelto, párrafo…): ahora todos usan el mismo
     * icono, titular, explicación y CTA opcional que la bienvenida de
     * Inicio. Los textos se escapan siempre. */
    emptyStateHtml(opts = {}) {
      const icon = opts.icon || 'music';
      const title = opts.title ? `<h4>${this.esc(opts.title)}</h4>` : '';
      const text = opts.text ? `<p>${this.esc(opts.text)}</p>` : '';
      let ctaHtml = '';
      if (opts.cta && opts.cta.label) {
        const id = opts.cta.id ? ` id="${this.esc(opts.cta.id)}"` : '';
        const ctaIcon = opts.cta.icon || 'plus';
        ctaHtml = `<button class="primary-btn empty-cta" type="button"${id}>
          <svg class="ico" aria-hidden="true"><use href="#i-${this.esc(ctaIcon)}"></use></svg>
          <span>${this.esc(opts.cta.label)}</span>
        </button>`;
      }
      return `<div class="empty-icon"><svg class="ico" aria-hidden="true"><use href="#i-${this.esc(icon)}"></use></svg></div>${title}${text}${ctaHtml}${opts.extra || ''}`;
    },
});
