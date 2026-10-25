/* =====================================================================
 *  js/player-ui.js — Aurora Music Player
 *  Render de la pista actual
 *
 *  Parte del refactor (C) de app.js: mismo código, módulos por funcionalidad.
 *  Este archivo se carga tras js/state.js y completa el objeto App con
 *  Object.assign (los scripts son clásicos por compatibilidad webxdc).
 * ===================================================================== */

'use strict';

Object.assign(App, {
    /* ============================================================
     *  UI: render pista actual
     * ============================================================ */
    renderCurrentTrack() {
      const t = this.currentTrack;
      if (!t) {
        this._shownCoverTrackId = null;
        if (typeof this.setBuffering === 'function') this.setBuffering(false);
        // Limpiar UI
        this.setMarqueeText(document.getElementById('trackTitle'), '—');
        this.setMarqueeText(document.getElementById('trackArtist'), this.t('load_track_to_start'));
        const albumEmpty = document.getElementById('trackAlbum');
        if (albumEmpty) { albumEmpty.textContent = ''; albumEmpty.style.display = 'none'; }
        document.getElementById('timeTotal').textContent = '0:00';
        document.getElementById('timeCurrent').textContent = '0:00';
        this._syncLyricsButton();
        document.getElementById('progressFill').style.width = '0%';
        this._applyCoverPalette(this.coverFallback());
        // La cabecera vuelve a su texto neutro cuando no hay pista.
        const ctxIdle = document.getElementById('nowPlayingContext');
        if (ctxIdle) {
          ctxIdle.textContent = this.t('your_library');
          ctxIdle.removeAttribute('title');
        }
        return;
      }
      this.setMarqueeText(document.getElementById('trackTitle'), t.title);
      this.setMarqueeText(document.getElementById('trackArtist'), t.artist || this.t('unknown_artist'));
      const albumEl = document.getElementById('trackAlbum');
      if (albumEl) {
        // El álbum se oculta si no aporta nada: vacío/marcador, o igual
        // al título (típico en sencillos: el mismo nombre dos veces)
        // o al artista. La comparación ignora mayúsculas y espacios.
        const normTxt = (v) => String(v == null ? '' : v).trim().toLowerCase();
        const hasAlbum = t.album && !this.isPlaceholderAlbum(t.album)
          && normTxt(t.album) !== normTxt(t.title)
          && normTxt(t.album) !== normTxt(t.artist);
        albumEl.textContent = hasAlbum ? t.album : '';
        albumEl.style.display = hasAlbum ? '' : 'none';
      }
      // Estrellas del Reproductor: reflejan la nota de la pista.
      if (typeof this._syncRatingUI === 'function') this._syncRatingUI(t);
      this._syncLyricsButton();
      document.getElementById('timeTotal').textContent = this.fmtTime(t.duration);
      document.getElementById('miniTitle').textContent = t.title;
      document.getElementById('miniArtist').textContent = t.artist;
      // La cabecera de Letras ya no repite título — artista (va en la
      // mini-cabecera). Su barra inferior sí muestra la duración total.
      const lrcTotal = document.getElementById('lyricsTimeTotal');
      if (lrcTotal) lrcTotal.textContent = this.fmtTime(t.duration);
      // Cabecera en una sola frase: «Reproduciendo desde <contexto>»
      // (la lista, Favoritos, el álbum…). Sin contexto se queda el
      // texto neutro de la biblioteca. El título no va aquí: ya va en
      // grande bajo la portada; completo queda en el tooltip.
      const ctxEl = document.getElementById('nowPlayingContext');
      if (ctxEl) {
        const ctxLabel = (typeof this.getPlayContextLabel === 'function') ? this.getPlayContextLabel() : null;
        ctxEl.textContent = ctxLabel
          ? this.t('playing_from') + ' ' + ctxLabel
          : this.t('your_library');
        const fullTitle = (t.title || '') + (t.artist ? ' — ' + t.artist : '');
        if (fullTitle) ctxEl.setAttribute('title', fullTitle);
        else ctxEl.removeAttribute('title');
      }

      // Colores dinámicos (fondo y visualizador,): la paleta de
      // la portada — diseñada si es generada, extraída de la imagen
      // si la hay, y el acento por defecto si no hay nada.
      const cover = this.coverPaletteFor(t);
      this._applyCoverPalette(cover);
      if (!t.coverPalette && (t.coverIsImage || t.customCover)) this._ensureCoverPalette(t);

      // Portada canvas (imagen si existe, si no, gradiente generado)
      if (this._shownCoverTrackId && this._shownCoverTrackId !== t.id) {
        if (typeof this.animateCoverTransition === 'function') this.animateCoverTransition();
      }
      this._shownCoverTrackId = t.id;
      this.drawCover('coverCanvas', t);
      this.drawCover('miniCoverCanvas', t, true);
      // (idea 3): en el modo inmersivo el título flotante
      // reaparece con cada canción y vuelve a desvanecerse.
      if (this._coverFs) this._pokeCoverFsMeta();
      // (idea 17): la portada SIGUIENTE se decodifica ya,
      // en silencio, para que el cambio no parpadee en blanco.
      this._preloadNextCover();

      // Vinilo en lugar de cover si está reproduciendo
      this.updateCoverA11y();

      // Favorito
      this.updateFavoriteUI();

      // Render cola
      this.renderQueue();
    },

    /* (idea 17): decodifica en segundo plano la portada de la
 * siguiente pista de la cola (la que tocará, con repetición
 * «todo» incluida). drawCover la reutiliza si ya está lista:
 * cambiar de canción deja de pasar por el fondo gris de
 * «cargando». Sin imagen (gradiente generado) no hay nada
 * que preparar y se sale sin coste. */
    _preloadNextCover() {
      if (!Array.isArray(this.queue) || !this.queue.length) return;
      let idx = (this.queueIdx || 0) + 1;
      if (idx >= this.queue.length) {
        if (this.repeat === 'all') idx = 0;
        else return;
      }
      const id = this.queue[idx];
      if (!id || (this.currentTrack && id === this.currentTrack.id)) return;
      const byId = typeof this.trackMap === 'function' ? this.trackMap() : null;
      const t = byId ? byId.get(id) : this.tracks.find(x => x.id === id);
      if (!t) return;
      const isImage = t.coverIsImage || (typeof t.cover === 'string' && t.cover.startsWith('data:'));
      if (!isImage) return;
      const src = typeof t.cover === 'string' ? t.cover
        : (this.coverSrcForRow ? this.coverSrcForRow(t, 720) : null)
          || (t.cover && t.cover.dataURL) || '';
      if (!src) return;
      if (this._nextCoverPreload && this._nextCoverPreload.src === src) return;
      const img = new Image();
      img.src = src;
      if (typeof img.decode === 'function') img.decode().catch(() => {});
      this._nextCoverPreload = { id: t.id, src, img };
    },

    drawCover(canvasId, track, mini) {
      const c = document.getElementById(canvasId);
      if (!c) return;
      //  cada pintado invalida los onload de imagen pendientes
      // de ESTE lienzo (ver el uso del sello en la rama de imagen).
      const coverToken = (c._coverToken = (c._coverToken || 0) + 1);
      const ctx = c.getContext('2d');
      const w = c.width, h = c.height;

      // Si la portada es una imagen (dataURL), dibujarla
      const isImage = track.coverIsImage || (typeof track.cover === 'string' && track.cover.startsWith('data:'));
      if (isImage) {
        /* Hay pistas que pueden traer `coverIsImage` sin el campo
         * `cover`; antes se leía
         * `track.cover.dataURL` sin proteger y la vista del reproductor
         * reventaba. Se usa la miniatura disponible y, si no hay nada
         * dibujable, se cae al gradiente como en las filas. */
        const src = typeof track.cover === 'string' ? track.cover
          : (this.coverSrcForRow ? this.coverSrcForRow(track, Math.max(w, h)) : null)
            || (track.cover && track.cover.dataURL) || '';
        if (src) {
          //  el sello de la entrada manda — si el usuario
          // salta de canción mientras esta imagen carga, el
          // onload tardío ya no pinta sobre la portada actual.
          //  si la precarga (idea 17) ya la decodificó, se
          // pinta al momento, sin fondo gris intermedio.
          const pre = (this._nextCoverPreload && this._nextCoverPreload.id === track.id
            && this._nextCoverPreload.src === src) ? this._nextCoverPreload.img : null;
          const img = pre || new Image();
          const paint = () => {
            if (c._coverToken !== coverToken) return; // ya hay otra pista
            ctx.clearRect(0, 0, w, h);
            // Modo "cover": misma geometría que las filas (_fitRect,)
            const r = typeof this._fitRect === 'function'
              ? this._fitRect(img.width, img.height, w, h, 'cover')
              : { x: 0, y: 0, w, h };
            ctx.drawImage(img, r.x, r.y, r.w, r.h);
          };
          if (img.complete && img.naturalWidth > 0) { paint(); return; }
          img.onload = paint;
          if (!pre) img.src = src;
          // Fondo provisional mientras carga
          ctx.fillStyle = '#222';
          ctx.fillRect(0, 0, w, h);
          return;
        }
      }

      // Generar gradiente dinámico
      const cover = (track.cover && typeof track.cover === 'object' && track.cover.from) ? track.cover : (this.coverFallback ? this.coverFallback() : { from: '#6E5CFF', to: '#FF7AB6' });
      const grad = ctx.createLinearGradient(0, 0, w, h);
      grad.addColorStop(0, cover.from);
      grad.addColorStop(1, cover.to);
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, w, h);

      // Patrón de ondas circulares
      ctx.globalAlpha = 0.18;
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = mini ? 1 : 2;
      const cx = w / 2, cy = h / 2;
      for (let r = 30; r < Math.max(w, h); r += 30) {
        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, Math.PI * 2);
        ctx.stroke();
      }
      // Letra inicial
      ctx.globalAlpha = 0.85;
      ctx.fillStyle = '#fff';
      ctx.font = (mini ? '700 38px ' : '900 220px ') + "Outfit, ui-rounded, -apple-system, sans-serif";
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(this.coverInitial(track.title), cx, cy);
      ctx.globalAlpha = 1;
    },

    setShuffleUI() {
      const btn = document.getElementById('btnShuffle');
      if (!btn) return;
      btn.classList.toggle('active', !!this.shuffle);
      btn.setAttribute('aria-pressed', this.shuffle ? 'true' : 'false');
    },

    setRepeatUI() {
      const btn = document.getElementById('btnRepeat');
      if (!btn) return;
      const mode = this.repeat || 'off';
      btn.classList.toggle('active', mode !== 'off');
      btn.dataset.mode = mode;
      //  aria-pressed no distingue «todo» de «una»; el nombre sí.
      const repLabel = mode === 'off' ? this.t('toast_repeat_off')
                     : mode === 'all' ? this.t('toast_repeat_all') : this.t('toast_repeat_one');
      btn.setAttribute('aria-label', this.t('repeat') + ': ' + repLabel);
      btn.style.position = 'relative';
      btn.setAttribute('aria-pressed', mode !== 'off' ? 'true' : 'false');
      let badge = btn.querySelector('.repeat-badge');
      if (mode === 'one') {
        if (!badge) {
          badge = document.createElement('span');
          badge.className = 'repeat-badge';
          badge.textContent = '1';
          //  el «1» es decoración — el aria-label del botón
          // ya dice «Repetir: una»; sin esto el lector lo sumaba.
          badge.setAttribute('aria-hidden', 'true');
          btn.appendChild(badge);
        }
      } else if (badge) {
        badge.remove();
      }
    },

    /* Nombre accesible y estado de la portada (role=button). Se usa desde
     * renderCurrentTrack() y updatePlayUI(); antes el bloque estaba
     * duplicado y podía divergir entre ambos caminos. */
    updateCoverA11y() {
      const ca = document.getElementById('coverArt');
      if (!ca) return;
      ca.classList.toggle('playing', this.isPlaying);
      //  la portada ya no reproduce/pausa al tocarla — abre y
      // cierra el modo inmersivo. El nombre accesible anuncia ESA
      // acción y aria-pressed refleja el modo, no la reproducción
      // (antes anunciaba «Pausar», que ya no es lo que hace).
      const label = this.t(this._coverFs ? 'cover_exit_fullscreen' : 'cover_fullscreen');
      const title = this.currentTrack ? ' · ' + this.currentTrack.title : '';
      ca.setAttribute('aria-label', label + title);
      ca.setAttribute('aria-pressed', this._coverFs ? 'true' : 'false');
    },

    /* — Portada a pantalla completa (modo inmersivo).
 * Tocar la portada la agranda a toda la vista con el
 * visualizador encima; tocarla otra vez (o Escape, o cambiar
 * de vista) vuelve al reproductor normal. Solo cambia una
 * clase en la vista: el lienzo y el visualizador no se mueven
 * del DOM, así que nada se repinta ni se pierde. */
    toggleCoverFullscreen() {
      this.setCoverFullscreen(!this._coverFs);
    },

    setCoverFullscreen(on) {
      const view = document.getElementById('viewPlayer');
      if (!view) return;
      on = !!on;
      const was = !!this._coverFs;
      this._coverFs = on;
      view.classList.toggle('cover-fullscreen', on);
      this.updateCoverA11y();
      // El visualizador acompaña siempre al modo inmersivo, aunque
      // el ajuste guardado sea «apagado»: updateVisualizerUI y
      // startVisualizer respetan _coverFs sin tocar la preferencia.
      this.updateVisualizerUI();
      if (on) {
        this.requestWakeLock();
        if (this.isPlaying) this.startVisualizer();
        else this.stopVisualizer(); // pinta la onda en reposo al nuevo tamaño
      } else if (was) {
        if (this.visualizerMode === 'off') this.stopVisualizer();
        else if (this.isPlaying) this.startVisualizer(); // reencuadra la onda
        else this.stopVisualizer();
      }
      if (on) this._pokeCoverFsMeta();
      else {
        clearTimeout(this._coverFsMetaTimer);
        const meta = document.getElementById('coverFsMeta');
        if (meta) meta.classList.remove('show');
      }
    },

    /* (idea 3): título y artista flotando sobre la portada
 * inmersiva. Se muestran al entrar y al cambiar de canción
 * (y con el gesto de volumen, desde events.js) y se
 * desvanecen a los 3,6 s: la portada queda limpia, que es
 * para lo que existe el modo. */
    _pokeCoverFsMeta() {
      const meta = document.getElementById('coverFsMeta');
      if (!meta || !this._coverFs || !this.currentTrack) return;
      const titleEl = document.getElementById('coverFsTitle');
      const artistEl = document.getElementById('coverFsArtist');
      if (titleEl) titleEl.textContent = this.currentTrack.title || '—';
      if (artistEl) artistEl.textContent = this.currentTrack.artist || this.t('unknown_artist');
      meta.classList.add('show');
      clearTimeout(this._coverFsMetaTimer);
      this._coverFsMetaTimer = setTimeout(() => meta.classList.remove('show'), 3600);
    },

    /*  el botón «Letras» de la barra secundaria se veía igual con y
 * sin letra sincronizada. Un punto de acento lo anuncia (la vista
 * sigue abriéndose igual: desde ahí se puede cargar el.lrc). */
    _syncLyricsButton() {
      const btn = document.getElementById('btnLyrics');
      if (!btn) return;
      const t = this.currentTrack;
      btn.classList.toggle('has-lrc', !!(t && t.lrc && t.lrc.length));
    },

    updatePlayUI() {
      const play = document.getElementById('btnPlay');
      const playLyrics = document.getElementById('btnPlayLyrics');
      [play, playLyrics, document.getElementById('miniPlayerPlay')].forEach(b => {
        if (!b) return;
        const ip = b.querySelector('.icon-play');
        const ips = b.querySelector('.icon-pause');
        if (this.isPlaying) {
          if (ip) ip.style.display = 'none';
          if (ips) ips.style.display = 'block';
          b.setAttribute('aria-label', this.t('pause'));
        } else {
          if (ip) ip.style.display = 'block';
          if (ips) ips.style.display = 'none';
          b.setAttribute('aria-label', this.t('play'));
        }
      });
      this.updateCoverA11y();

      /* Los anillos de «esta lista está sonando» (hero de la lista
       * abierta y «Reproducir Todo» de Favoritos) se pintan al
       * renderizar, pero pausar desde el mini-reproductor con la hoja
       * abierta no re-renderiza: quedaban encendidos en pausa. Aquí
       * se re-sincronizan con cada cambio de play/pausa. */
      const favBtn = document.getElementById('btnPlayFavoritesNow');
      if (favBtn) {
        favBtn.classList.toggle('is-playing',
          this.isPlaying && !!this.playContext && this.playContext.type === 'favorites');
      }
      if (this._editingPlaylistId && typeof this.isPlaylistPlaying === 'function') {
        const pl = (this.playlists || []).find(p => p && p.id === this._editingPlaylistId);
        if (pl) {
          const on = this.isPlaylistPlaying(pl);
          const hero = document.getElementById('btnPlayPlaylistNow');
          if (hero) hero.classList.toggle('is-playing', on);
          const cover = document.getElementById('editPlaylistCover');
          if (cover) cover.classList.toggle('is-playing', on);
        }
      }

      /* «Seguir escuchando» de Inicio: mientras la pista suena, la
       * tarjeta sobra (ya la estás escuchando); al pausar vuelve
       * como «retomar». Se conmuta sin repintar Inicio entero. Si
       * la pista cambió con Inicio montado, el data-track no
       * coincide y sí se repinta para no enseñar la anterior. */
      const homeHeroEl = document.getElementById('homeHero');
      if (homeHeroEl) {
        if (this.currentTrack && homeHeroEl.dataset.track && homeHeroEl.dataset.track !== this.currentTrack.id) {
          if (typeof this.renderHome === 'function') this.renderHome();
        } else {
          homeHeroEl.hidden = !!this.isPlaying;
        }
      }

      // Visualizador en tiempo real
      if (this.isPlaying) {
        if (typeof this.startVisualizer === 'function') this.startVisualizer();
      } else {
        if (typeof this.stopVisualizer === 'function') this.stopVisualizer();
      }

      //  aquí vivía el bloque que mostraba/ocultaba «Ir al
      // artista / Ir al álbum» en el menú ⋯ según hubiera pista.
      // Esas filas salieron del menú en la auditoría —
      // viven en el menú de pista — y el bloque quedó muerto.

      /* Cada cambio de play/pausa pasa por aquí, y la visibilidad del
 * mini reproductor depende de isPlaying (en Inicio se oculta en
 * pausa,): sin este refresco, el mini solo obedecía al
 * navegar y quedaba congelado tras pausar o reanudar. */
      if (typeof this.updateChrome === 'function') this.updateChrome();
    },

    updateProgress() {
      const a = this.audio;
      const cur = a.currentTime || 0;
      const dur = a.duration || this.currentTrack?.duration || 0;

      // Repetición A-B. Con el bucle activo, al llegar
      // a B se vuelve a A y no se pinta más en este ciclo. Va
      // antes que el bucle de sección de Letras: este manda
      // sobre dos instantes de la canción.
      if (this.abRepeat && this.abRepeat.active && this.abRepeat.b !== null && this.abRepeat.a !== null) {
        if (cur >= this.abRepeat.b) {
          this.seekToTime(this.abRepeat.a);
          return;
        }
      }

      // Repetición de sección de letras (#19): rango elegido a mano en la
      // vista de letras ({start, end} en segundos de la canción). Se aplica
      // aquí, no en el RAF de letras, para que siga activa al volver al
      // reproductor.
      if (this.lrcLoop && this.lrcLoop.end > this.lrcLoop.start) {
        const lyrCur = cur - (this.lrcOffset || 0);
        if (lyrCur >= this.lrcLoop.end) {
          this.seekToTime(this.lrcLoop.start + (this.lrcOffset || 0));
          return;
        }
      }

      const pct = dur > 0 ? (cur / dur) * 100 : 0;
      const fill = document.getElementById('progressFill');
      const curEl = document.getElementById('timeCurrent');
      if (fill) fill.style.width = pct + '%';
      // Barra de progreso de la vista de Letras (misma fuente de verdad).
      const lrcFill = document.getElementById('lyricsProgressFill');
      if (lrcFill) lrcFill.style.width = pct + '%';
      const lrcCur = document.getElementById('lyricsTimeCurrent');
      if (lrcCur) lrcCur.textContent = this.fmtTime(cur);
      const lrcTot = document.getElementById('lyricsTimeTotal');
      if (lrcTot && dur > 0) lrcTot.textContent = this.fmtTime(dur);
      const mini = document.getElementById('miniProgress');
      if (mini) mini.style.width = pct + '%';
      if (curEl) curEl.textContent = this.fmtTime(cur);
      //  la duración total puede enseñar el tiempo restante
      // («-1:12») si el usuario lo eligió tocándola; se refresca aquí
      // porque es el único sitio que conoce cur y dur a la vez.
      const totEl = document.getElementById('timeTotal');
      if (totEl && dur > 0) {
        totEl.textContent = this._showRemaining
          ? '-' + this.fmtTime(Math.max(0, dur - cur))
          : this.fmtTime(dur);
      }
      const track = document.getElementById('progressTrack');
      if (track) {
        track.setAttribute('aria-valuenow', String(Math.round(pct)));
        track.setAttribute('aria-valuetext', this.fmtTime(cur) + ' / ' + this.fmtTime(dur));
      }

      // Buffer (: con duración 0/desconocida salía Infinity%)
      const buf = document.getElementById('progressBuffer');
      if (buf && a.buffered && a.buffered.length > 0 && isFinite(dur) && dur > 0) {
        try {
          const end = a.buffered.end(a.buffered.length - 1);
          buf.style.width = Math.min(100, (end / dur) * 100) + '%';
        } catch (e) {}
      }

      if (typeof this.updateMediaPosition === 'function') this.updateMediaPosition();
    },

    fmtTime(s) {
      if (!s || isNaN(s)) return '0:00';
      s = Math.floor(s);
      const r = s % 60;
      const pad = (n) => (n < 10 ? '0' : '') + n;
      // A partir de una hora, «90:00» engaña: formato h:mm:ss.
      if (s >= 3600) {
        const h = Math.floor(s / 3600);
        const m = Math.floor((s % 3600) / 60);
        return h + ':' + pad(m) + ':' + pad(r);
      }
      return Math.floor(s / 60) + ':' + pad(r);
    },

    setMarqueeText(el, text) {
      if (!el) return;
      let inner = el.querySelector('.marquee-inner');
      if (!inner) {
        inner = document.createElement('span');
        inner.className = 'marquee-inner';
        el.textContent = '';
        el.appendChild(inner);
      }
      inner.textContent = text == null ? '' : String(text);
      this._syncMarquee(el);
    },

    /*  applyVinylMode retirado con el modo vinilo. */

    _syncMarquee(el) {
      if (!el) return;
      const inner = el.querySelector('.marquee-inner');
      if (!inner) return;
      el.classList.remove('is-marquee');
      if (typeof inner.getAnimations === 'function') {
        inner.getAnimations().forEach(a => a.cancel());
      }
      inner.style.transform = '';
      const reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      requestAnimationFrame(() => {
        const overflow = inner.scrollWidth - el.clientWidth;
        if (reduce || this._marqueeEnabled === false || overflow <= 8) return;
        const ws = window.getComputedStyle(el).whiteSpace;
        if (ws && ws !== 'nowrap') return;
        el.classList.add('is-marquee');
        const slide = Math.max(2.4, overflow / 42);
        const pause = 1.5;
        const reset = 0.7;
        const total = pause + slide + pause + reset;
        if (typeof inner.animate !== 'function') return;
        inner.animate([
          { transform: 'translateX(0)', offset: 0 },
          { transform: 'translateX(0)', offset: pause / total },
          { transform: 'translateX(' + (-overflow) + 'px)', offset: (pause + slide) / total },
          { transform: 'translateX(' + (-overflow) + 'px)', offset: (pause + slide + pause) / total },
          { transform: 'translateX(0)', offset: 1 }
        ], { duration: total * 1000, iterations: Infinity, easing: 'ease-in-out' });
      });
    },
});
