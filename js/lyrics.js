/* =====================================================================
 *  js/lyrics.js — Aurora Music Player
 *  Letras LRC: parser, render, editor, offset, loop
 *
 *  Parte del refactor (C) de app.js: mismo código, módulos por funcionalidad.
 *  Este archivo se carga tras js/state.js y completa el objeto App con
 *  Object.assign (los scripts son clásicos por compatibilidad webxdc).
 * ===================================================================== */

'use strict';

Object.assign(App, {
    /* ============================================================
     *  Letras LRC
     * ============================================================
     *  Soporta dos tipos de letras:
     *   1. LRC sincronizado: líneas con timestamps [mm:ss.xx]texto
     *   2. Texto plano: líneas sin timestamps (de USLT ID3)
     *  El parser marca cada línea como timed/untimed para que el
     *  highlight sepa si sincronizar o mostrar estático.
     * ============================================================ */
    /* ============================================================
     *  Parser LRC tolerante (#21)
     * ============================================================
     *  Soporta:
     *   - Timestamps múltiples en una línea: [00:01.00][00:15.00]Letra
     *   - Metadata LRC: [ar:], [ti:], [al:], [by:], [offset:], etc.
     *   - Compensación [offset:] aplicada a todos los timestamps
     *   - Espacios irregulares y formatos variados
     *   - Líneas de texto plano (sin timestamp)
     *   - Traducciones embebidas (formato [tr:xx] o doble línea)
     * ============================================================ */
    parseLrc(arr) {
      if (!arr || !arr.length) return [];
      // Si arr es un string (no array), dividirlo por líneas
      if (typeof arr === 'string') {
        arr = arr.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
      }
      const result = [];
      let hasTimed = false;
      let globalOffset = 0;

      // Primera pasada: detectar offset global
      for (const line of arr) {
        if (typeof line !== 'string') continue;
        const offMatch = line.match(/\[offset:\s*(-?\d+)\s*\]/i);
        if (offMatch) {
          globalOffset = parseInt(offMatch[1]) / 1000;
        }
      }

      // Segunda pasada: parsear líneas
      for (const line of arr) {
        if (typeof line !== 'string') continue;
        const trimmed = line.trim();
        //  las líneas vacías del archivo ya no crean una
        // entrada fantasma (texto '', sin tiempo) que luego se
        // pintaba como una línea en blanco moviéndose por la
        // letra. Vacío = nada que mostrar: se salta y punto.
        if (!trimmed) continue;

        // Saltar metadata LRC pura
        if (/^\[(ar|ti|al|by|offset|length|re|ve|id):/i.test(trimmed)) continue;

        // Buscar TODOS los timestamps en la línea.
        //  el comentario prometía [h:mm:ss.xx] desde siempre,
        // pero el regex solo aceptaba mm:ss — y tampoco la coma
        // decimal ([00:12,50], habitual en LRC europeos). Ahora:
        // [mm:ss.xx], [mm:ss], [m:ss.xx], [h:mm:ss.xx], coma o punto.
        const timestampRegex = /\[(?:(\d+):)?(\d{1,2}):(\d{1,2}(?:[.,]\d+)?)\]/g;
        const stamps = [];
        let m;
        while ((m = timestampRegex.exec(trimmed)) !== null) {
          stamps.push({
            time: (parseInt(m[1] || '0', 10) * 3600) + (parseInt(m[2], 10) * 60)
              + parseFloat(m[3].replace(',', '.')) + globalOffset,
            match: m[0]
          });
        }

        if (stamps.length > 0) {
          hasTimed = true;
          const lastStampEnd = trimmed.lastIndexOf(stamps[stamps.length - 1].match) + stamps[stamps.length - 1].match.length;
          const rawText = trimmed.substring(lastStampEnd).trim();
          const text = this.stripKaraokeTags(rawText);
          for (const stamp of stamps) {
            result.push({
              time: Math.max(0, stamp.time),
              text: text,
              timed: true
            });
          }
        } else {
          // Línea de texto plano (sin timestamp)
          result.push({
            time: -1,
            text: this.stripKaraokeTags(trimmed),
            timed: false
          });
        }
      }

      // Si hay timestamps, ordenar por tiempo
      if (hasTimed) {
        //  las líneas sin timestamp (créditos sueltos entre
        // estrofas) se anclan al tiempo de la línea temporizada
        // ANTERIOR en el archivo, no a 0: antes la ordenación las
        // teletransportaba todas al principio de la letra.
        let anchor = 0;
        for (const line of result) {
          if (line.timed) anchor = line.time;
          line._sk = line.timed ? line.time : anchor;
        }
        result.sort((a, b) => a._sk - b._sk);
        for (const line of result) delete line._sk;

        // Fusionar líneas con el MISMO timestamp: la primera es el texto
        // principal y la siguiente es su traducción (formato LRC bilingüe,
        // muy común en archivos con idioma original + traducción).
        const merged = [];
        for (const line of result) {
          const prev = merged[merged.length - 1];
          if (
            line.timed && prev && prev.timed &&
            Math.abs(prev.time - line.time) < 0.001 &&
            !prev.translation
          ) {
            if (!prev.text && line.text) {
              prev.text = line.text;   // la 1ª estaba vacía: promover su texto
            } else if (line.text) {
              prev.translation = line.text;
            }
            continue;
          }
          merged.push(line);
        }
        result.length = 0;
        result.push(...merged);
      }
      result.hasTimed = hasTimed;
      return result;
    },

    stripKaraokeTags(text) {
      return String(text || '').replace(/<\d{1,2}:\d{2}(?:\.\d{1,3})?>/g, '');
    },

    /*  karaoke por palabras retirado; stripKaraokeTags sigue
 * limpiando los <mm:ss> de los LRC mejorados al pintar la línea. */

    _setLyricsEmpty(on) {
      const emptyEl = document.getElementById('lrcEmpty');
      const scroll = document.getElementById('lyricsScroll');
      if (emptyEl) emptyEl.hidden = !on;
      if (scroll) {
        scroll.classList.toggle('has-empty', !!on);
        if (on) this._setLrcFocus(false); //  sin letra no hay foco que mostrar
      }
      //  sin letra, la barra de herramientas (tamaño, desfase,
      // velocidad, bucle…) solo hacía ruido sobre el vacío y duplicaba
      // las acciones de la tarjeta: la vista entra en modo limpio y la
      // barra vuelve en cuanto hay letra que ajustar.
      const view = document.getElementById('viewLyrics');
      const noTrack = !!on && !this.currentTrack;
      if (view) {
        view.classList.toggle('lrc-is-empty', !!on);
        view.classList.toggle('lrc-no-track', noTrack);
      }
      // Sin pista cargada, «Cargar .lrc» no tiene dónde aplicarse: la
      // tarjeta cambia el mensaje y esconde las acciones.
      const title = document.getElementById('lrcEmptyTitle');
      const hint = document.getElementById('lrcEmptyHint');
      if (title) title.textContent = noTrack ? this.t('no_track_playing') : this.t('lrc_empty_title');
      if (hint) hint.textContent = noTrack ? this.t('load_track_to_start') : this.t('lrc_empty_hint');
    },

    /*  modo «foco» de la letra sincronizada. Con la clase
 *.lrc-focus en el contenedor, el CSS difumina todas las líneas
 * menos la que suena (y sus vecinas, a media opacidad). Solo se
 * activa con letra CON tiempos y una vez que suena la primera
 * línea: en la intro —o con letra sin sincronizar— todo se lee
 * como siempre. */
    _setLrcFocus(on) {
      const sc = document.getElementById('lyricsScroll');
      if (sc && sc.classList.contains('lrc-focus') !== !!on) {
        sc.classList.toggle('lrc-focus', !!on);
      }
    },

    /* ============================================================
     *  Render de letras con todas las mejoras
     * ============================================================ */
    renderLyrics() {
      const cont = document.getElementById('lyricsContent');
      if (!cont) return;
      cont.innerHTML = '';
      const t = this.currentTrack;

      // Aplicar tamaño de fuente guardado
      const scroll = document.getElementById('lyricsScroll');
      if (scroll) scroll.style.setProperty('--lrc-font-size', this._lrcFontCss());

      if (!t || !t.lrc || (Array.isArray(t.lrc) && t.lrc.length === 0)) {
        this.lrcLines = [];
        this.lrcHasTimed = false;
        this._setLyricsEmpty(true);
        return;
      }
      this._setLyricsEmpty(false);

      // Cache: si ya tenemos las líneas parseadas para esta pista, reutilizar
      if (t._lrcCache && t._lrcCacheKey === JSON.stringify(t.lrc)) {
        this.lrcLines = t._lrcCache;
        this.lrcHasTimed = !!t._lrcCache.hasTimed;
      } else {
        this.lrcLines = this.parseLrc(t.lrc);
        this.lrcHasTimed = !!this.lrcLines.hasTimed;
        t._lrcCache = this.lrcLines;
        t._lrcCacheKey = JSON.stringify(t.lrc);
      }

      if (this.lrcLines.length === 0) {
        this._setLyricsEmpty(true);
        return;
      }

      // Badge de estado (sincronizada / no sincronizada)
      if (!this.lrcHasTimed) {
        const badge = document.createElement('div');
        badge.className = 'lrc-status-badge';
        badge.textContent = this.t('lrc_not_synced');
        cont.appendChild(badge);
      }

        this.lrcLines.forEach((l, i) => {
        const div = document.createElement('div');
        div.className = 'lrc-line';
        if (!l.text) div.classList.add('empty');
        if (!this.lrcHasTimed) div.classList.add('untimed');
        // Traducción (LRC bilingüe): línea secundaria bajo el texto principal
        if (l.translation) {
          div.innerHTML = '<span class="lrc-main">' + this.esc(l.text || '♪') + '</span>' +
            '<span class="lrc-translation">' + this.esc(l.translation) + '</span>';
        } else {
          div.textContent = l.text || '♪';
        }
        div.dataset.idx = i;
        // Tap en una línea con timestamp → saltar a ese punto (#11)
        if (l.timed && l.time >= 0) {
          div.addEventListener('click', () => {
            this.seekToTime(l.time + (this.lrcOffset || 0));
            if (navigator.vibrate) navigator.vibrate(10);
          });
        }
        cont.appendChild(div);
      });

      this.activeLrcIdx = -1;
      this._lastActiveKey = '';
      this._lrcLineEls = null;  // invalidar caché de elementos DOM
      // Detectar scroll manual del usuario (#13)
      this.wireLyricsUserScroll();
      // Iniciar sincronización con RAF (#22), solo con la vista
      // de letras activa.: antes había DOS llamadas seguidas
      // (una incondicional y otra con guardia) — la segunda
      // cancelaba y rearrancaba la primera en el mismo pintado.
      const lv = document.getElementById('viewLyrics');
      if (lv && lv.classList.contains('active')) this.startLrcRafSync();
    },

    /* Sincronización precisa con requestAnimationFrame (#22) */
    startLrcRafSync() {
      if (this.lrcRafId) cancelAnimationFrame(this.lrcRafId);
      //  también se cancela el respiro en pausa pendiente,
      // para que nunca convivan dos cadenas de sincronización.
      if (this._lrcRafTimer) { clearTimeout(this._lrcRafTimer); this._lrcRafTimer = null; }
      if (!this.lrcHasTimed) return;
      const tick = () => {
        const lyricsView = document.getElementById('viewLyrics');
        if (!lyricsView || !lyricsView.classList.contains('active')) {
          // Antes seguía programando RAF para siempre aunque la vista
          // estuviera oculta (batería/CPU en móvil). Se detiene y showView()
          // lo reinicia al volver.
          this.lrcRafId = null;
          return;
        }
        if (this.audio && this.currentTrack) {
          // cur = tiempo actual - offset (offset positivo = letra adelantada)
          const cur = (this.audio.currentTime || 0) - this.lrcOffset;
          this.updateLyricsHighlight(cur);
          // La repetición de sección se aplica en updateProgress(): así sigue
          // activa aunque el usuario vuelva al reproductor (el RAF solo corre
          // con la vista de letras abierta).
        }
        //  en pausa, pintar a 60 fps es batería tirada (la
        // línea no se mueve): se respira a 4 fps, suficiente para
        // seguir un seek con la reproducción detenida.
        if (this.audio && this.audio.paused) {
          this._lrcRafTimer = setTimeout(() => {
            this._lrcRafTimer = null;
            this.lrcRafId = requestAnimationFrame(tick);
          }, 250);
          return;
        }
        this.lrcRafId = requestAnimationFrame(tick);
      };
      tick();
    },

    /* Detecta cuando el usuario hace scroll manual para pausar el auto-scroll (#13) */
    wireLyricsUserScroll() {
      const sc = document.getElementById('lyricsScroll');
      if (!sc || sc._userScrollWired) return;
      sc._userScrollWired = true;
      let scrollTimer = null;
      sc.addEventListener('scroll', () => {
        // Si el scroll fue provocado por JS (auto-scroll), ignorar
        if (this._autoScrolling) return;
        this.lrcUserScrolling = true;
        sc.classList.add('user-scrolling');
        if (scrollTimer) clearTimeout(scrollTimer);
        scrollTimer = setTimeout(() => {
          this.lrcUserScrolling = false;
          sc.classList.remove('user-scrolling');
        }, 3000);  // Reanudar auto-scroll tras 3s sin tocar
      }, { passive: true });
    },

    /* Actualiza el highlight y el scroll de las letras.
     * Usa búsqueda LINEAL (no binaria) porque el array puede tener
     * líneas timed y untimed mezcladas, lo que rompe la búsqueda binaria. */
    updateLyricsHighlight(cur) {
      if (!this.lrcLines.length || !this.lrcHasTimed) {
        this._setLrcFocus(false); //  sin sincronía no hay difuminado
        return;
      }

      // === BÚSQUEDA LINEAL del índice activo ===
      // Encontrar la última línea timed con time <= cur.
      // Es O(n) pero para 50-100 líneas a 60fps es insignificante.
      let idx = -1;
      for (let i = 0; i < this.lrcLines.length; i++) {
        const l = this.lrcLines[i];
        if (l.timed && l.time <= cur) {
          idx = i;
        } else if (l.timed && l.time > cur) {
          break;
        }
      }

      if (idx < 0) {
        if (this.activeLrcIdx !== -1) {
          this.activeLrcIdx = -1;
          this._lastActiveKey = '';
          // Limpiar clases usando caché
          if (this._lrcLineEls) {
            for (let i = 0; i < this._lrcLineEls.length; i++) {
              const el = this._lrcLineEls[i];
              el.className = 'lrc-line' + (this.lrcLines[i] && !this.lrcLines[i].timed ? ' untimed' : '');
            }
          }
        }
        //  antes de la primera línea (intro) todo visible.
        this._setLrcFocus(false);
        return;
      }

      // === Buscar líneas con el mismo timestamp (solo mirar alrededor de idx) ===
      const activeTime = this.lrcLines[idx].time;
      const activeIndices = [idx];
      // Buscar hacia atrás
      for (let i = idx - 1; i >= 0; i--) {
        if (this.lrcLines[i].timed && Math.abs(this.lrcLines[i].time - activeTime) < 0.01) {
          activeIndices.unshift(i);
        } else break;
      }
      // Buscar hacia adelante
      for (let i = idx + 1; i < this.lrcLines.length; i++) {
        if (this.lrcLines[i].timed && Math.abs(this.lrcLines[i].time - activeTime) < 0.01) {
          activeIndices.push(i);
        } else break;
      }

      // === Solo actualizar DOM si cambió la línea activa ===
      const key = activeIndices[0] + '';  // clave simple: primer índice
      this._setLrcFocus(true); //  ya suena una línea: a difuminar el resto
      if (key !== this._lastActiveKey) {
        this._lastActiveKey = key;
        this.activeLrcIdx = idx;

        // Usar caché de elementos DOM si existe, sino crearla
        if (!this._lrcLineEls) {
          const cont = document.getElementById('lyricsContent');
          if (cont) this._lrcLineEls = Array.from(cont.querySelectorAll('.lrc-line'));
        }

        if (this._lrcLineEls) {
          const firstActive = activeIndices[0];
          const lastActive = activeIndices[activeIndices.length - 1];
          for (let i = 0; i < this._lrcLineEls.length; i++) {
            const el = this._lrcLineEls[i];
            const isActive = (i >= firstActive && i <= lastActive);
            // Calcular distancia mínima al rango activo
            let minDist;
            if (i < firstActive) minDist = firstActive - i;
            else if (i > lastActive) minDist = i - lastActive;
            else minDist = 0;

            // Actualizar clases de forma eficiente (solo si cambiaron)
            const hasActive = el.classList.contains('active');
            const hasNear = el.classList.contains('near');
            const hasNear2 = el.classList.contains('near-2');

            if (isActive !== hasActive) el.classList.toggle('active', isActive);
            const shouldNear = !isActive && minDist === 1;
            if (shouldNear !== hasNear) el.classList.toggle('near', shouldNear);
            const shouldNear2 = !isActive && minDist === 2;
            if (shouldNear2 !== hasNear2) el.classList.toggle('near-2', shouldNear2);
          }
        }
      }

      // === SCROLL: interpolar hacia el objetivo en cada frame ===
      if (!this.lrcUserScrolling && activeIndices.length > 0 && this._lrcLineEls) {
        const sc = document.getElementById('lyricsScroll');
        if (sc) {
          const firstActiveEl = this._lrcLineEls[activeIndices[0]];
          if (firstActiveEl) {
            const targetTop = this._lrcScrollTarget(firstActiveEl, sc);
            const current = sc.scrollTop;
            const diff = targetTop - current;
            if (Math.abs(diff) > 0.5) {
              this._autoScrolling = true;
              sc.scrollTop = current + diff * 0.5;
            } else {
              this._autoScrolling = false;
            }
          }
        }
      }

    },

    /* Posición de reposo de la línea activa: su centro, en el centro
 * del área visible. Antes el modo normal la aparcaba al 25%
 * de la altura (más arriba) y solo la pantalla completa la
 * centraba: la misma canción «saltaba» al alternar modos. Si algún
 * día se quiere otro encuadre, es esta fracción: 0.5 = centro. */
    _lrcScrollTarget(el, sc) {
      return el.offsetTop - (sc.clientHeight / 2) + (el.clientHeight / 2);
    },

    /* ============================================================
     *  Cargar .lrc externo (#1)
     * ============================================================ */
    async loadExternalLrc() {
      // Delta Chat nativo: selector integrado antes que <input>
      const nativeFiles = await this.pickFilesWebxdc({ extensions: ['.lrc', '.txt'], multiple: false });
      if (nativeFiles) {
        if (nativeFiles.length > 0) await this._applyExternalLrc(nativeFiles[0]);
        return;
      }
      let input = document.getElementById('lrcFileInput');
      if (!input) {
        input = document.createElement('input');
        input.type = 'file';
        input.id = 'lrcFileInput';
        input.accept = '.lrc,.txt';
        input.style.display = 'none';
        document.body.appendChild(input);
        input.addEventListener('change', async (e) => {
          const file = e.target.files[0];
          if (file) await this._applyExternalLrc(file);
          e.target.value = '';
        });
      }
      input.value = '';
      input.click();
    },

    /* Aplica el .lrc elegido (del <input> o de webxdc.importFiles). */
    async _applyExternalLrc(file) {
      if (!file) return;
      try {
        const text = await file.text();
        if (this.currentTrack) {
          const lines = text.split(/\r?\n/);
          this.currentTrack.lrc = lines;
          // Invalidar caché
          this.currentTrack._lrcCache = null;
          this.persistTrack(this.currentTrack);
          this.renderLyrics();
          this.toast(this.t('lrc_loaded'));
          if (typeof this._syncLyricsButton === 'function') this._syncLyricsButton();
        }
      } catch (err) {
        this.toast(this.t('toast_load_error'));
      }
    },

    /* ============================================================
     *  Editor de letras (#2)
     * ============================================================ */
    openLrcEditor() {
      const ta = document.getElementById('lrcEditorText');
      if (!ta) return;
      // Rellenar con la letra actual (si existe)
      if (this.currentTrack && this.currentTrack.lrc) {
        const lines = Array.isArray(this.currentTrack.lrc) ? this.currentTrack.lrc : [this.currentTrack.lrc];
        ta.value = lines.join('\n');
      } else {
        ta.value = '';
      }
      this.openSheet('sheetLrcEditor');
    },

    saveLrcFromEditor() {
      const ta = document.getElementById('lrcEditorText');
      if (!ta || !this.currentTrack) return;
      const text = ta.value.trim();
      if (!text) {
        this.currentTrack.lrc = null;
      } else {
        this.currentTrack.lrc = text.split(/\r?\n/);
      }
      this.currentTrack._lrcCache = null;
      this.persistTrack(this.currentTrack);
      this.renderLyrics();
      this.closeSheet('sheetLrcEditor');
      this.toast(this.t('lrc_saved'));
      if (typeof this._syncLyricsButton === 'function') this._syncLyricsButton();
    },

    /*  «sincronizar tocando» retirado con su panel y métodos
 * (la letra se sigue pudiendo pegar con sellos [mm:ss.xx]). */

    /* Exportar / compartir letra LRC activa en Delta Chat o descarga local */
    async exportCurrentLyrics() {
      const t = this.currentTrack;
      const ta = document.getElementById('lrcEditorText');
      const textFromEditor = ta ? ta.value.trim() : '';
      let text = '';
      if (textFromEditor) {
        text = textFromEditor;
      } else if (t && t.lrc && t.lrc.length) {
        text = Array.isArray(t.lrc) ? t.lrc.join('\n') : String(t.lrc);
      }
      if (!text) {
        this.toast(this.t('lrc_empty_title'));
        return;
      }
      const title = (t && t.title) ? t.title : 'letra';
      const artist = (t && t.artist) ? t.artist : '';
      const safeTitle = title.replace(/[\\/:*?"<>|]/g, '_');
      const safeArtist = artist.replace(/[\\/:*?"<>|]/g, '_');
      const fileName = safeArtist ? `${safeArtist} - ${safeTitle}.lrc` : `${safeTitle}.lrc`;
      const caption = `📜 Letra: ${title}` + (artist ? ` · ${artist}` : '');

      try {
        const ok = await this.exportFile({
          name: fileName,
          content: text,
          mimeType: 'text/plain;charset=utf-8',
          caption
        });
        this.toast(ok ? this.t('toast_lrc_exported') : this.t('toast_share_error'), ok ? undefined : 'danger');
      } catch (e) {
        this.toast(this.t('toast_share_error'));
      }
    },

    /* ============================================================
     *  Ajuste de offset manual (#12)
     * ============================================================ */
    adjustLrcOffset(delta) {
      // Redondear a décimas: sumar 0.5 repetidamente acumula 0.30000000004.
      this.lrcOffset = Math.round((this.lrcOffset + delta) * 10) / 10;
      // Persistir por pista
      if (this.currentTrack) {
        this.currentTrack.lrcOffset = this.lrcOffset;
        this.persistTrack(this.currentTrack);
      }
      this.updateLrcOffsetUI();
      const sign = this.lrcOffset > 0 ? '+' : '';
      this.toast(this.t('lrc_offset_toast').replace('X', sign + this.lrcOffset.toFixed(1) + 's'));
    },

    /* Pinta el valor actual del desfase dentro del grupo de botones.
     * Sin esto el usuario no tenía forma de saber en qué punto estaba. */
    updateLrcOffsetUI() {
      const out = document.getElementById('lrcOffsetValue');
      if (!out) return;
      const v = Math.round((this.lrcOffset || 0) * 10) / 10;
      const sign = v > 0 ? '+' : '';
      out.textContent = sign + v.toFixed(1) + 's';
      out.classList.toggle('is-zero', v === 0);
    },
    /* Restablece TODA la letra: desfase, tamaño, velocidad y bucle.
     * El desfase suelto se ajusta con − / + del grupo «Desfase». */
    resetLyricsPrefs() {
      // Reset COMPLETO: deshace todos los cambios hechos en la vista de letras
      // (offset, tamaño de fuente, velocidad, loop)
      // [9]: auditoría externa vio el toast sin origen aparente. No
      // hay ningún camino que lo dispare al cambiar de pista (solo este
      // botón), pero sí saltaba aunque no hubiera nada que reiniciar y
      // parecía espontáneo: ahora solo avisa si algo cambió de verdad.
      const view0 = document.getElementById('viewLyrics');
      const changed = (this.lrcOffset || 0) !== 0
        || (Number(this.lrcFontSize) || 19) !== 19
        || (this.playbackRate || 1) !== 1
        || !!this.lrcLoop || this._lrcLoopA != null
        || !!(view0 && view0.classList.contains('lyrics-fullscreen'));
      // 1. Offset
      this.lrcOffset = 0;
      if (this.currentTrack) {
        this.currentTrack.lrcOffset = 0;
        this.persistTrack(this.currentTrack);
      }
      this.updateLrcOffsetUI();
      // 2. Tamaño de fuente → valor por defecto
      this.setLrcFontSize(19);
      try { localStorage.removeItem('aurora_lrc_fontsize'); } catch (e) {}
      // 3. Velocidad → 1.0×
      if (this.currentTrack) this.currentTrack.lrcSpeed = 1;
      this.setPlaybackRate(1.0);
      try { localStorage.removeItem('aurora_playback_rate'); } catch (e) {}
      // 4. Loop de sección
      this.clearLyricsLoop();
      // 5. Salir de pantalla completa si estaba activa
      const view = document.getElementById('viewLyrics');
      if (view && view.classList.contains('lyrics-fullscreen')) {
        view.classList.remove('lyrics-fullscreen');
      }
      // Re-renderizar para aplicar cambios visuales
      this.renderLyrics();
      if (changed) this.toast(this.t('lrc_reset_done'));
    },

    /* ============================================================
     *  Tamaño de fuente ajustable (#7)
     * ============================================================ */
    /* El tamaño guardado sigue en «px equivalentes» (12–32) por
     * compatibilidad con ajustes ya guardados, pero se aplica en rem para
     * que escale con el tamaño de fuente del sistema. */
    _lrcFontCss() {
      return ((Number(this.lrcFontSize) || 19) / 16) + 'rem';
    },

    setLrcFontSize(size) {
      this.lrcFontSize = Math.max(12, Math.min(32, size));
      try { localStorage.setItem('aurora_lrc_fontsize', this.lrcFontSize); } catch (e) {}
      // Setear la variable CSS en todos los contenedores relevantes
      const scroll = document.getElementById('lyricsScroll');
      const content = document.getElementById('lyricsContent');
      const val = this._lrcFontCss();
      if (scroll) scroll.style.setProperty('--lrc-font-size', val);
      if (content) content.style.setProperty('--lrc-font-size', val);
      // Reflejar los límites: si ya no se puede subir o bajar, el botón
      // se desactiva (antes parecía que el toque no hacía nada).
      const dec = document.getElementById('btnLrcFontDec');
      const inc = document.getElementById('btnLrcFontInc');
      if (dec) dec.disabled = this.lrcFontSize <= 12;
      if (inc) inc.disabled = this.lrcFontSize >= 32;
    },

    /* ============================================================
     *  Pantalla completa / modo inmersivo (#14)
     * ============================================================ */
    toggleLyricsFullscreen() {
      const view = document.getElementById('viewLyrics');
      if (!view) return;
      view.classList.toggle('lyrics-fullscreen');
      // Asegurar wake lock (#15)
      if (view.classList.contains('lyrics-fullscreen')) {
        this.requestWakeLock();
      }
    },

    /* ============================================================
     *  Ajuste de velocidad de reproducción (#18)
     * ============================================================ */
    setPlaybackRate(rate) {
      this.playbackRate = Math.max(0.5, Math.min(2.0, Math.round(rate * 10) / 10));
      if (this.audio) {
        this.audio.playbackRate = this.playbackRate;
        if (this.preservesPitch !== undefined) {
          this.audio.preservesPitch = this.preservesPitch;
          this.audio.mozPreservesPitch = this.preservesPitch;
          this.audio.webkitPreservesPitch = this.preservesPitch;
        }
      }
      const label = document.getElementById('lrcSpeedLabel');
      if (label) label.textContent = this.playbackRate.toFixed(1) + '×';
      //  la velocidad vive solo aquí (Ajustes ya no la duplica).
      try { localStorage.setItem('aurora_playback_rate', this.playbackRate); } catch (e) {}
      if (this.currentTrack) {
        this.currentTrack.lrcSpeed = this.playbackRate;
        this.persistTrack(this.currentTrack);
      }
    },

    /* ============================================================
     *  Loop de sección (#19)
     * ============================================================ */
    /* Repetición de sección elegida por el usuario, igual que el A-B del
     * reproductor: 1.er toque fija A en el instante actual, 2.º fija B y
     * activa el bucle, 3.er toque lo desactiva.
     *
     * Antes se elegía solo: del inicio de la línea actual a 8 líneas
     * después, y el usuario no podía escoger el rango.
     */
    toggleLyricsLoop() {
      if (this.lrcLoop) {
        this.clearLyricsLoop();
        this.toast(this.t('lrc_loop_cleared'));
        return;
      }
      const now = Math.max(0, (this.audio ? this.audio.currentTime || 0 : 0) - (this.lrcOffset || 0));
      // Ajustar a la línea de letra actual (si la hay) para que el salto
      // caiga exactamente al principio de una línea.
      const snap = this._lrcLineTimeAt(now);
      if (this._lrcLoopA === null || this._lrcLoopA === undefined) {
        this._lrcLoopA = snap !== null ? snap : now;
        this._updateLrcLoopIndicator();
        this.toast(this.t('lrc_loop_a_set').replace('X', this.fmtTime(this._lrcLoopA)));
        return;
      }
      let end = snap !== null ? snap : now;
      if (end <= this._lrcLoopA + 0.3) end = this._lrcLoopA + 2; // mínimo 2 s
      this.lrcLoop = { start: this._lrcLoopA, end };
      this._lrcLoopA = null;
      this._updateLrcLoopIndicator();
      this.toast(this.t('lrc_loop_ab_active')
        .replace('X', this.fmtTime(this.lrcLoop.start))
        .replace('Y', this.fmtTime(this.lrcLoop.end)));
      if (this.audio && (this.audio.currentTime < this.lrcLoop.start ||
          this.audio.currentTime >= this.lrcLoop.end)) {
        this.seekToTime(this.lrcLoop.start + (this.lrcOffset || 0));
      }
    },

    /* Devuelve el tiempo de la última línea con timestamp <= t (o null). */
    _lrcLineTimeAt(t) {
      if (!this.lrcHasTimed || !this.lrcLines || !this.lrcLines.length) return null;
      let found = null;
      for (let i = 0; i < this.lrcLines.length; i++) {
        const l = this.lrcLines[i];
        // Margen mínimo (20 ms): sin él, 0,1 s antes de una línea ya se
        // anclaba a la línea siguiente y A quedaba en el futuro.
        if (l && l.timed && l.time <= t + 0.02) found = l.time;
        if (l && l.timed && l.time > t + 0.02) break;
      }
      return found;
    },

    /* Indicador superior: muestra A mientras se elige B y el rango completo
     * cuando el bucle está activo. */
    _updateLrcLoopIndicator() {
      const indicator = document.getElementById('lyricsLoopIndicator');
      const text = document.getElementById('lyricsLoopText');
      const btn = document.getElementById('btnLrcLoop');
      const clearBtn = document.getElementById('btnLrcLoopClear');
      const hasA = this._lrcLoopA !== null && this._lrcLoopA !== undefined;
      if (btn) {
        btn.classList.toggle('active', !!this.lrcLoop);
        btn.classList.toggle('setting-b', hasA);
      }
      if (clearBtn) clearBtn.hidden = !(hasA || this.lrcLoop);
      if (!indicator || !text) return;
      if (this.lrcLoop) {
        text.textContent = this.t('lrc_loop_ab_active')
          .replace('X', this.fmtTime(this.lrcLoop.start))
          .replace('Y', this.fmtTime(this.lrcLoop.end));
        indicator.style.display = 'flex';
      } else if (hasA) {
        text.textContent = this.t('lrc_loop_a_set').replace('X', this.fmtTime(this._lrcLoopA)) +
          ' · ' + this.t('lrc_loop_tap_b');
        indicator.style.display = 'flex';
      } else {
        indicator.style.display = 'none';
      }
    },

    clearLyricsLoop() {
      this.lrcLoop = null;
      this._lrcLoopA = null;
      this._updateLrcLoopIndicator();
    },

    /* ============================================================
     *  Restaurar offset y tamaño de fuente guardados al cargar pista
     * ============================================================ */
    restoreLyricsPrefs() {
      try {
        const fs = localStorage.getItem('aurora_lrc_fontsize');
        if (fs) this.lrcFontSize = parseInt(fs);
      } catch (e) {}
      if (typeof this.setLrcFontSize === 'function') this.setLrcFontSize(this.lrcFontSize || 19);
      let rate = 1;
      try {
        const pr = localStorage.getItem('aurora_playback_rate');
        if (pr) rate = parseFloat(pr) || 1;
      } catch (e) {}
      if (this.currentTrack && this.currentTrack.lrcSpeed) {
        rate = this.currentTrack.lrcSpeed;
      }
      this.playbackRate = Math.max(0.5, Math.min(2.0, Math.round(rate * 10) / 10));
      if (this.audio) this.audio.playbackRate = this.playbackRate;
      const label = document.getElementById('lrcSpeedLabel');
      if (label) label.textContent = this.playbackRate.toFixed(1) + '×';
      // Offset por pista
      if (this.currentTrack && this.currentTrack.lrcOffset) {
        this.lrcOffset = this.currentTrack.lrcOffset;
      } else {
        this.lrcOffset = 0;
      }
      this.updateLrcOffsetUI();
      // Repintar el grupo A-B: al volver a la vista con un bucle activo,
      // el botón debe seguir marcado aunque renderLyrics() haya vaciado
      // los elementos.
      this._updateLrcLoopIndicator();
      // El rango A-B pertenece a la pista anterior: no arrastrarlo.
      const trackId = this.currentTrack ? this.currentTrack.id : null;
      if (this._lrcLoopTrackId !== trackId) {
        this.clearLyricsLoop();
        this._lrcLoopTrackId = trackId;
      }
    },
});
