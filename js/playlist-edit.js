/* =====================================================================
 *  js/playlist-edit.js — Aurora Music Player
 *  Crear / editar / añadir a playlists
 *
 *  Parte del refactor (C) de app.js: mismo código, módulos por funcionalidad.
 *  Este archivo se carga tras js/state.js y completa el objeto App con
 *  Object.assign (los scripts son clásicos por compatibilidad webxdc).
 * ===================================================================== */

'use strict';

Object.assign(App, {
    /* ============================================================
     *  Crear / editar / añadir a playlists
     * ============================================================ */

    /* Abre el sheet "Crear playlist" en modo creación (vacío).
     * Las pistas son opcionales: se puede crear una lista vacía. */
    openCreatePlaylistSheet() {
      // Cada apertura empieza sin bandera de «guardar cola»
      // (openSaveQueueSheet la pone después de llamar).: el
      // modo «inteligente» se fue con las listas por reglas;
      // crear es siempre lista normal.
      this._queueSaveMode = false;
      // Reset del formulario
      const nameInput = document.getElementById('playlistName');
      const descInput = document.getElementById('playlistDesc');
      if (nameInput) nameInput.value = '';
      if (descInput) descInput.value = '';
      //  al crear no se eligen pistas (se añaden después desde
      // la vista de edición); el selector que aquí se ocultaba era
      // del modo «añadir» retirado y ya no existe en la hoja.
      // Título
      const titleEl = document.getElementById('createPlaylistTitle');
      if (titleEl) titleEl.textContent = this.t('create_playlist_title');
      // Botón primario: "Guardar lista"
      const btn = document.getElementById('btnSavePlaylist');
      if (btn) btn.textContent = this.t('save_playlist');
      this.openSheet('sheetCreatePlaylist');
    },

    /*  aquí vivía openAddTracksSheet — el modo «añadir a
 * existente» de esta hoja, inalcanzable desde la (las
 * pistas se añaden desde la vista de edición). Cadáver
 * extirpado con todo su clúster: _addingToPlaylistId,
 * renderPickTracks y el selector de pistas de la hoja. */

    /* Abre el sheet "Editar playlist" con el detalle de una playlist */
    openEditPlaylist(playlistId) {
      const pl = this.playlists.find(p => p.id === playlistId);
      if (!pl) return;
      this._editingPlaylistId = playlistId;
      this.renderEditPlaylist();
      const titleEl = document.getElementById('editPlaylistTitle');
      if (titleEl) titleEl.textContent = pl.name;
      // Todas las listas se pueden eliminar: ya no hay lista predefinida.
      const btnDeleteFull = document.getElementById('btnDeletePlaylistFull');
      if (btnDeleteFull) btnDeleteFull.style.display = '';
      this.openSheet('sheetEditPlaylist');
      //  abrir la lista DONDE suena — si la canción actual
      // está en ella (su fila ya sale marcada con .current), se
      // desplaza hasta ella al terminar la animación de apertura.
      // Solo al abrir: los re-pintados posteriores no secuestran
      // la posición de quien está mirando otra parte de la lista.
      if (this.currentTrack) {
        const curId = this.currentTrack.id;
        setTimeout(() => {
          if (this._editingPlaylistId !== playlistId) return;
          const ul = document.getElementById('editPlaylistTracks');
          if (!ul) return;
          //  con lista virtual (>80) la fila puede no existir
          // aún en el DOM: primero se lleva el scroll a su ventana
          // (64 px por fila, dos de margen arriba) y se pide el
          // repintado; después se centra la fila ya creada. Es el
          // mismo patrón probado en la cola.
          if (ul._virt) {
            const scroller = ul.closest('.sheet-body');
            const idx = this.playlistTracksSorted(pl).findIndex(t => t.id === curId);
            if (scroller && idx >= 0) {
              scroller.scrollTop = Math.max(0, (idx * 64) - 128);
              if (ul._virt.onScroll) ul._virt.onScroll();
            }
            requestAnimationFrame(() => {
              const row = ul.querySelector('li[data-track-id="' + curId + '"]');
              if (row) {
                try { row.scrollIntoView({ block: 'center' }); } catch (e) {}
              }
            });
            return;
          }
          const row = ul.querySelector('li[data-track-id="' + curId + '"]');
          if (row) {
            try { row.scrollIntoView({ block: 'center', behavior: 'smooth' }); } catch (e) {}
          }
        }, 380);
      }
    },

    /*  aquí vivía _fillSmartGenreSelect, el relleno del
 * selector de géneros de la regla inteligente. */

    /* Pinta el contenido del sheet "Editar playlist" */
    renderEditPlaylist() {
      const pl = this.playlists.find(p => p.id === this._editingPlaylistId);
      if (!pl) return;
      const nameEl = document.getElementById('editPlaylistName');
      const metaEl = document.getElementById('editPlaylistMeta');
      const ul = document.getElementById('editPlaylistTracks');
      const coverEl = document.getElementById('editPlaylistCover');
      if (nameEl && nameEl.tagName !== 'INPUT') {
        nameEl.textContent = pl.name;
        nameEl.title = this.t('rename_playlist_btn');
        nameEl.onclick = () => this.startRenamePlaylist();
      }
      if (metaEl) metaEl.textContent = this.playlistMetaLabel(pl);
      // Selector de orden sincronizado con la lista.
      const sortSel = document.getElementById('plSortSelect');
      if (sortSel) sortSel.value = pl.sort || 'stars';
      // El botón «hero» de reproducir refleja si esta lista es la que
      // suena (anillo de acento), igual que la portada.
      const heroPlay = document.getElementById('btnPlayPlaylistNow');
      if (heroPlay) heroPlay.classList.toggle('is-playing', this.isPlaylistPlaying(pl));
      if (coverEl) {
        const cover = this.getPlaylistCover(pl);
        coverEl.classList.toggle('is-playing', this.isPlaylistPlaying(pl));
        if (typeof cover === 'string' && typeof this._safeImageDataUrl === 'function' && this._safeImageDataUrl(cover)) {
          coverEl.style.background = '';
          const img = document.createElement('img');
          img.src = cover;
          img.alt = '';
          coverEl.textContent = '';
          coverEl.appendChild(img);
        } else {
          const from = (cover && cover.from) || ((this.coverFallback && this.coverFallback().from) || '#6E5CFF');
          const to = (cover && cover.to) || ((this.coverFallback && this.coverFallback().to) || '#FF7AB6');
          coverEl.style.background = 'linear-gradient(135deg, ' + from + ', ' + to + ')';
          const iconName = 'list-ul'; //  sin lista favorita especial
          coverEl.innerHTML = this.ico(iconName);
        }
      }
      if (!ul) return;
      //  soltar la lista virtual anterior (si la hubo) ANTES de
      // vaciar: su listener de scroll repintaría filas viejas sobre
      // el contenido nuevo o sobre el estado vacío.
      if (typeof this.unbindVirtualList === 'function') this.unbindVirtualList(ul);
      ul.innerHTML = '';
      const sortedTracks = this.playlistTracksSorted(pl);
      if (sortedTracks.length === 0) {
        const li = document.createElement('li');
        li.className = 'pl-empty-tracks';
        li.innerHTML = '<svg class="ico" aria-hidden="true"><use href="#i-cloud-arrow-up"></use></svg><p>' + this.esc(this.t('no_tracks_in_playlist')) + '</p>';
        ul.appendChild(li);
        return;
      }
      // La lista se ve en el orden elegido (; por defecto el de
      // estrellas de). El orden guardado no se reescribe.
      const makeEditRow = (t, i) => {
        const id = t.id;
        const isCurrent = this.currentTrack && this.currentTrack.id === id;
        const li = document.createElement('li');
        li.className = 'track-row' + (isCurrent ? ' current' : '');
        li.dataset.trackId = id;
        li.dataset.idx = String(i);
        li.innerHTML = `
          <div class="row-cover"><canvas width="144" height="144"></canvas></div>
          <div class="row-text">
            <div class="row-title">${this.esc(t.title)}</div>
            <div class="row-sub">${this.esc(t.artist)} <span class="row-rating"${this._ratingOf(t) ? '' : ' hidden'}>${'★'.repeat(this._ratingOf(t))}</span></div>
          </div>
          <div class="row-duration">${isCurrent ? '<svg class="ico now-eq" aria-hidden="true"><use href="#i-volume-high"></use></svg> ' : ''}${this.fmtRowDuration(t)}</div>
          <button class="row-action track-menu-btn" type="button" aria-label="${this.esc(this.t('more_options'))}"><svg class="ico" aria-hidden="true"><use href="#i-ellipsis-vertical"></use></svg></button>
          <button class="row-action remove-from-pl" aria-label="${this.esc(this.t('remove_from_playlist'))}"><svg class="ico" aria-hidden="true"><use href="#i-xmark"></use></svg></button>
        `;
        li.addEventListener('click', (e) => {
          if (e.target.closest('.remove-from-pl, .track-menu-btn')) return;
          // Reproducir esta pista dentro del contexto de la playlist.
          // playTrack se encarga de setear la cola = pistas de la playlist.
          this.playTrack(t.id, { type: 'playlist', id: pl.id, name: pl.name });
          this.renderQueue();
          if (typeof this.openPlayerForTrackPick === 'function') this.openPlayerForTrackPick();
        });
        const menuBtn = li.querySelector('.track-menu-btn');
        if (menuBtn) menuBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          this.openTrackMenu(t.id);
        });
        if (typeof this.wireTrackLongPress === 'function') this.wireTrackLongPress(li, t.id);
        const removeBtn = li.querySelector('.remove-from-pl');
        if (removeBtn) removeBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          this.removeFromPlaylist(pl.id, t.id);
        });
        const cv = li.querySelector('canvas');
        if (cv) this.drawRowCover(cv, t);
        return li;
      };
      //  con listas enormes, pintar TODAS las filas (cada una
      // con su canvas, sus listeners y su portada) hacía la
      // apertura lenta y el desplazamiento a tirones. Se reusa la
      // lista virtual de la cola y de Favoritos: hasta 80 filas se
      // pinta todo como siempre; por encima, solo vive en el DOM
      // la ventana visible. La fila conserva TODO: tocar
      // reproduce en contexto, menú ⋯, pulsación larga, quitar
      // de la lista y portada.
      if (typeof this.fillVirtualList === 'function') {
        this.fillVirtualList(ul, sortedTracks, makeEditRow, { rowHeight: 64 });
      } else {
        sortedTracks.forEach((t, i) => {
          const li = makeEditRow(t, i);
          if (li) ul.appendChild(li);
        });
      }
    },

    /* Renombrar la lista (: arreglo del fallo «no hay forma de
 * confirmar el renombre»).
 * Antes el <input> reemplazaba al <h4 id="editPlaylistName"> SIN
 * conservar el id: al confirmar, renderEditPlaylist ya no
 * encontraba el título, la vista se quedaba con el campo de texto
 * para siempre y no existía ningún botón de confirmar.
 * Ahora el campo nace con botones ✓ (confirmar) y ✗ (cancelar)
 * bien visibles; Enter confirma, Escape cancela, y al terminar se
 * restaura el <h4> con su id para que la vista vuelva a pintar el
 * nombre (y se pueda renombrar otra vez). */
    startRenamePlaylist() {
      const pl = this.playlists.find(p => p.id === this._editingPlaylistId);
      if (!pl) return;
      const nameEl = document.getElementById('editPlaylistName');
      if (!nameEl) return;
      // Ya hay un renombre en curso (el nombre vive dentro del wrap).
      if (nameEl.closest && nameEl.closest('.edit-pl-rename')) return;
      const wrap = document.createElement('div');
      wrap.className = 'edit-pl-rename';
      const input = document.createElement('input');
      input.type = 'text';
      input.className = 'edit-pl-name-input';
      input.value = pl.name;
      input.maxLength = 80;
      input.setAttribute('aria-label', this.t('rename_playlist_btn'));
      const btnOk = document.createElement('button');
      btnOk.type = 'button';
      btnOk.className = 'edit-pl-rename-btn confirm';
      btnOk.innerHTML = '<svg class="ico" aria-hidden="true"><use href="#i-check"></use></svg>';
      btnOk.setAttribute('aria-label', this.t('rename_confirm'));
      btnOk.title = this.t('rename_confirm');
      const btnCancel = document.createElement('button');
      btnCancel.type = 'button';
      btnCancel.className = 'edit-pl-rename-btn';
      btnCancel.innerHTML = '<svg class="ico" aria-hidden="true"><use href="#i-xmark"></use></svg>';
      btnCancel.setAttribute('aria-label', this.t('cancel'));
      btnCancel.title = this.t('cancel');
      wrap.append(input, btnOk, btnCancel);
      nameEl.replaceWith(wrap);
      input.focus();
      input.select();
      let done = false;
      // Sin preventDefault en mousedown, tocar ✓/✗ dispararía el blur
      // del input y confirmaría antes de saber qué botón se tocó.
      [btnOk, btnCancel].forEach(b => b.addEventListener('mousedown', (e) => e.preventDefault()));
      const finish = (save) => {
        if (done) return;
        done = true;
        const v = input.value.trim();
        if (save && v && v !== pl.name) {
          pl.name = v;
          this.persistPlaylist(pl);
          this.renderPlaylists();
          if (typeof this.renderHome === 'function') this.renderHome();
          this.toast(this.t('toast_playlist_renamed'));
        }
        // Restaurar el <h4 id="editPlaylistName"> ANTES de repintar:
        // es el elemento que renderEditPlaylist() busca por id.
        const h = document.createElement('h4');
        h.id = 'editPlaylistName';
        h.textContent = pl.name;
        wrap.replaceWith(h);
        this.renderEditPlaylist();
      };
      btnOk.addEventListener('click', () => finish(true));
      btnCancel.addEventListener('click', () => finish(false));
      input.addEventListener('blur', () => finish(true));
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') { e.preventDefault(); finish(true); }
        if (e.key === 'Escape') { e.preventDefault(); finish(false); }
      });
    },

    /* Quita una pista de una playlist */
    removeFromPlaylist(playlistId, trackId) {
      const pl = this.playlists.find(p => p.id === playlistId);
      if (!pl) return;
      const i = pl.trackIds.indexOf(trackId);
      if (i < 0) return;
      const wasCurrent = this.currentTrack && this.currentTrack.id === trackId;
      if (wasCurrent && this.playContext && this.playContext.type === 'playlist' && this.playContext.id === playlistId) {
        const qIdx = this.queue.indexOf(trackId);
        if (qIdx >= 0) {
          this.queue.splice(qIdx, 1);
          if (qIdx < this.queueIdx) this.queueIdx--;
          else if (qIdx === this.queueIdx) this.queueIdx = Math.min(this.queueIdx, this.queue.length - 1);
          if (this.queueIdx < 0) this.queueIdx = 0;
        }
      }
      pl.trackIds.splice(i, 1);
      this._invalidatePlaylistCover(pl);
      this.persistPlaylist(pl);
      if (wasCurrent) {
        this.stopPlayback();
        this.skipToNextOrPrevPaused();
      }
      // Actualizar solo el contador y la lista, sin parpadeo
      this._updatePlaylistMeta(pl);
      // Si el editor de esta playlist está abierto:
      // - lista vacía → re-render completo (muestra el estado "sin pistas")
      // - si no → quitar solo la fila afectada
      if (this._editingPlaylistId === playlistId) {
        if (pl.trackIds.length === 0) this.renderEditPlaylist();
        else this._removeTrackFromEditView(trackId);
      }
      this.renderQueue();
      this.toast(this.t('toast_removed_from_playlist'));
    },

    /* Actualizar solo el contador de una playlist sin re-render completo */
    _updatePlaylistMeta(pl) {
      const meta = document.getElementById('editPlaylistMeta');
      if (meta) meta.textContent = this.playlistMetaLabel(pl);
    },

    /* Eliminar una pista de la vista de edición sin re-render completo */
    _removeTrackFromEditView(trackId) {
      // Match por data-track-id (robusto): antes se buscaba por el texto
      // del título, lo que eliminaba de la vista TODAS las filas de
      // canciones con el mismo nombre aunque solo se quitara una.
      const row = document.querySelector('#editPlaylistTracks .track-row[data-track-id="' + CSS.escape(trackId) + '"]');
      if (row) {
        row.style.transition = 'opacity .2s, transform .2s';
        row.style.opacity = '0';
        row.style.transform = 'translateX(-20px)';
        setTimeout(() => row.remove(), 200);
      }
    },

    /* Vacía una playlist (sin borrar las pistas de la biblioteca) */
    async clearPlaylist(playlistId) {
      const pl = this.playlists.find(p => p.id === playlistId);
      if (!pl) return;
      if (pl.trackIds.length === 0) {
        this.toast(this.t('toast_playlist_cleared'));
        return;
      }
      const ok = await this.showConfirm({
        message: this.t('confirm_clear_playlist'),
        okLabel: this.t('confirm_delete')
      });
      if (!ok) return;
      // Guardamos el orden exacto para poder deshacer.
      const previousIds = pl.trackIds.slice();
      pl.trackIds = [];
      this._invalidatePlaylistCover(pl);
      this.persistPlaylist(pl);
      // Actualizar vista sin parpadeo
      const ul = document.getElementById('editPlaylistTracks');
      if (ul) {
        //  si la lista era virtual (>80), soltar su estado
        // primero: si no, su listener de scroll repintaría filas
        // sobre el estado vacío que se muestra al terminar.
        if (typeof this.unbindVirtualList === 'function') this.unbindVirtualList(ul);
        // Animar salida de todos los items
        ul.querySelectorAll('.track-row').forEach((item, i) => {
          setTimeout(() => {
            item.style.transition = 'opacity .2s, transform .2s';
            item.style.opacity = '0';
            item.style.transform = 'translateX(-20px)';
            setTimeout(() => item.remove(), 200);
          }, i * 20);
        });
        // Mostrar estado vacío coherente después (mismo componente que
        // Biblioteca/Favoritos, en su variante compacta).
        setTimeout(() => {
          ul.innerHTML = '';
          const li = document.createElement('li');
          li.className = 'empty-state compact';
          li.innerHTML = this.emptyStateHtml({
            icon: 'list-ul',
            title: this.t('no_tracks_in_playlist')
          });
          ul.appendChild(li);
        }, 300);
      }
      this._updatePlaylistMeta(pl);
      this.toast(this.t('toast_playlist_cleared'), {
        ms: 6500,
        action: {
          label: this.t('undo'),
          onClick: () => {
            pl.trackIds = previousIds.slice();
            this._invalidatePlaylistCover(pl);
            this.persistPlaylist(pl);
            this.renderEditPlaylist();
            this.renderPlaylists();
            this._updatePlaylistMeta(pl);
            this.toast(this.t('toast_restored'));
          }
        }
      });
    },

    createPlaylist(name, desc, trackIds) {
      // Validación defensiva: la función es pública y también la usa el
      // sheet; sin límites un nombre enorme rompía la cabecera y el M3U.
      const cleanName = String(name == null ? '' : name).replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, 80);
      const cleanDesc = String(desc == null ? '' : desc).replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, 300);
      if (this.playlists.some(p => (p.name || '').trim().toLowerCase() === cleanName.toLowerCase())) {
        this.toast(this.t('playlist_name_exists'));
        return null;
      }
      const id = 'pl-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6);
      const colors = ['#6E5CFF','#FF7AB6','#1A6A88','#3EC8B8','#2A6B48','#A8C86A','#C45C18','#E8B84A','#A61B3A','#E85A7A'];
      const from = colors[Math.floor(Math.random() * colors.length)];
      const to = colors[Math.floor(Math.random() * colors.length)];
      const pl = {
        id,
        name: cleanName || this.t('create_playlist_title'),
        description: cleanDesc,
        trackIds: Array.isArray(trackIds) ? trackIds.filter(x => this.trackMap().has(x)) : [],
        cover: { from, to, angle: 135 }
      };
      this.playlists.push(pl);
      this.persistPlaylist(pl);
      this.renderPlaylists();
      return pl;
    },

    /* Exportar playlist (formato M3U8 estándar y enviar a chat o descargar) */
    async exportPlaylist(playlistId) {
      const id = playlistId || this._editingPlaylistId;
      if (!id) return;
      const pl = this.playlists.find(p => p.id === id);
      if (!pl) return;
      //  las inteligentes exportan sus pistas efectivas (trackIds va vacío).
      const tracks = this.playlistTracksSorted(pl);
      const safeName = (pl.name || 'playlist').replace(/[\\/:*?"<>|]/g, '_');

      // Generar archivo M3U8 estándar con directivas de playlist y tracks
      // Quitar CR/LF de todos los campos de texto: un salto de línea en el
      // nombre o en el archivo inyectaría entradas falsas en el M3U.
      const oneLine = (v) => String(v == null ? '' : v).replace(/[\r\n]+/g, ' ').trim();
      let m3u = '#EXTM3U\n';
      m3u += `#PLAYLIST:${oneLine(pl.name)}\n`;
      tracks.forEach(t => {
        const dur = Math.max(-1, Math.floor(t.duration || -1));
        const artist = t.artist || this.t('unknown_artist');
        const title = t.title || this.t('unknown_track');
        const fn = oneLine(t.fileName) || `${oneLine(artist)} - ${oneLine(title)}.mp3`;
        m3u += `#EXTINF:${dur},${oneLine(artist)} - ${oneLine(title)}\n${fn}\n`;
      });

      const caption = `🎶 Lista: ${pl.name} (${tracks.length} canciones) · Aurora Music Player`;
      try {
        const ok = await this.exportFile({
          name: `${safeName}.m3u8`,
          content: m3u,
          mimeType: 'application/x-mpegurl',
          caption
        });
        // Antes: toast de éxito incondicional aunque Delta no hubiera
        // enviado nada — el «no funciona» de compartir lista.
        this.toast(ok === 'chat' ? this.t('toast_playlist_shared') : ok === 'download' ? this.t('toast_downloaded') : this.t('toast_share_error'), ok ? undefined : 'danger');
      } catch (e) {
        this.toast(this.t('toast_share_error'), 'danger');
      }
    }
});
