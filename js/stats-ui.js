/* =====================================================================
 *  js/stats-ui.js — Aurora Music Player
 *  Render de estadísticas y favoritos
 *
 *  Parte del refactor (C) de app.js: mismo código, módulos por funcionalidad.
 *  Este archivo se carga tras js/state.js y completa el objeto App con
 *  Object.assign (los scripts son clásicos por compatibilidad webxdc).
 * ===================================================================== */

'use strict';

Object.assign(App, {
    /* ============================================================
     *  Render de la pantalla de Estadísticas (#13)
     * ============================================================ */
    renderStats() {
      const cont = document.getElementById('statsContent');
      if (!cont) return;
      const playsObj = (this.stats && this.stats.plays) || {};
      const topTracks = this.getTopTracks(10);
      const topArtists = this.getTopArtists(5);
      //  «Más saltadas» y «Olvidadas» se retiraron de
      // Estadísticas; quedan reproducciones, tops y tiempo.
      const totalPlays = Object.values(playsObj).reduce((a, b) => a + (Number(b) || 0), 0);
      const totalSec = (this.stats && this.stats.totalSeconds) || 0;

      cont.innerHTML = `
        <div class="stats-grid">
          <div class="stat-card">
            <div class="stat-value">${totalPlays}</div>
            <div class="stat-label">${this.t('stats_plays')}</div>
          </div>
          <div class="stat-card">
            <div class="stat-value">${this.fmtDuration(totalSec)}</div>
            <div class="stat-label">${this.t('stats_listening_time')}</div>
          </div>
          <div class="stat-card">
            <div class="stat-value">${this.tracks.length}</div>
            <div class="stat-label">${this.t('all_tracks_section')}</div>
          </div>
          <div class="stat-card">
            <div class="stat-value">${topArtists.length}</div>
            <div class="stat-label">${this.t('stats_artists')}</div>
          </div>
        </div>

        <h4 class="section-title">${this.t('stats_top_artists')}</h4>
        ${topArtists.length === 0 ? '<p class="stats-empty">' + this.t('no_results') + '</p>' : ''}
        <ul class="stats-list">
          ${topArtists.map((a, i) => `
            <li class="stats-row" data-artist="${this.esc(a.artist)}">
              <div class="stats-rank">${i + 1}</div>
              <div class="stats-info">
                <div class="stats-name">${this.esc(a.artist)}</div>
                <div class="stats-sub">${a.count} ${this.t('stats_plays').toLowerCase()}</div>
              </div>
            </li>
          `).join('')}
        </ul>

        <h4 class="section-title">${this.t('stats_top_tracks')}</h4>
        ${topTracks.length === 0 ? '<p class="stats-empty">' + this.t('no_results') + '</p>' : ''}
        <ul class="stats-list">
          ${topTracks.map((t, i) => `
            <li class="stats-row" data-track="${this.esc(t.track.id)}">
              <div class="stats-rank">${i + 1}</div>
              <div class="row-cover"><canvas width="144" height="144"></canvas></div>
              <div class="stats-info">
                <div class="stats-name">${this.esc(t.track.title)}</div>
                <div class="stats-sub">${this.esc(t.track.artist)} · ${t.count} ${this.t('stats_plays').toLowerCase()}</div>
              </div>
            </li>
          `).join('')}
        </ul>

      `;

      const resetDiv = document.createElement('div');
      resetDiv.className = 'stats-reset-wrap';
      resetDiv.innerHTML = `
        <button class="primary-btn compact ghost danger" id="btnResetStats"><svg class="ico" aria-hidden="true"><use href="#i-trash-can"></use></svg> ${this.esc(this.t('stats_reset_btn'))}</button>
      `;
      cont.appendChild(resetDiv);
      const btnRS = document.getElementById('btnResetStats');
      if (btnRS) btnRS.addEventListener('click', async () => {
        if (await this.showConfirm({ message: this.t('stats_reset_confirm'), danger: false })) this.resetStats();
      });

      // Dibujar covers
      cont.querySelectorAll('.stats-row').forEach((row, i) => {
        const artist = row.dataset.artist;
        if (artist) {
          row.addEventListener('click', () => {
            if (typeof this.goToArtist === 'function') this.goToArtist(artist);
          });
          return;
        }
        const tid = row.dataset.track;
        if (!tid) return;
        const track = this.tracks.find(t => t.id === tid);
        if (track) {
          const cv = row.querySelector('canvas');
          if (cv) this.drawRowCover(cv, track);
        }
        row.addEventListener('click', () => {
          // Sin contexto, playTrack dejaba el anterior con la cola de
          // toda la biblioteca: etiqueta y cola divorciadas. Manda la
          // lista de la canción, como en Buscar (/).
          if (tid && track) this.playTrack(tid, typeof this.trackPlayContextFor === 'function' ? this.trackPlayContextFor(track) : undefined);
        });
      });
    },

    cleanSearchStr(str) {
      if (!str) return '';
      // \w solo cubre ASCII: en ruso, chino o japonés borraba TODA la
      // consulta y la búsqueda no encontraba nada. Se usan propiedades
      // Unicode (letras + números) conservando los 8 idiomas.
      return String(str)
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .replace(/[^\p{L}\p{N}\s]/gu, ' ')
        .replace(/\s+/g, ' ')
        .trim();
    },

    /* Textos de búsqueda ya normalizados por pista, cacheados en un
     * WeakMap (no se persisten ni ensucian el objeto pista). La clave
     * guarda el texto origen: si el usuario edita las etiquetas, la
     * siguiente búsqueda detecta el cambio y recalcula sola. */
    _searchClean(t) {
      if (!this._srchCache) this._srchCache = new WeakMap();
      const src = (t.title || '') + '\u0000' + (t.artist || '') + '\u0000' + (t.album || '');
      let c = this._srchCache.get(t);
      if (!c || c.src !== src) {
        const title = this.cleanSearchStr(t.title);
        const artist = this.cleanSearchStr(t.artist);
        const album = this.cleanSearchStr(t.album);
        c = { src, title, artist, album, all: (title + ' ' + artist + ' ' + album).trim() };
        this._srchCache.set(t, c);
      }
      return c;
    },

    /* Contexto de reproducción para una canción suelta elegida
     * fuera de su lista (Buscar, Inicio, Historial, menú de pista).
     * Antes todo salía como «Todas las canciones» aunque la canción
     * viviera en una lista, y la cola que se creaba era la biblioteca
     * entera. Ahora manda la lista de la canción: primero las listas
     * del usuario y, si solo está en la automática, «Mi Música»; la
     * cola pasa a ser esa lista, así que siguiente/anterior y el
     * «Reproduciendo desde…» cuentan lo mismo. */
    trackPlayContextFor(t) {
      let miMusica = null;
      for (const pl of this.playlists || []) {
        if (!pl || !Array.isArray(pl.trackIds) || !t || !pl.trackIds.includes(t.id)) continue;
        if (pl.id === 'mi-musica') { miMusica = pl; continue; }
        return { type: 'playlist', id: pl.id, name: pl.name };
      }
      if (miMusica) return { type: 'playlist', id: miMusica.id, name: miMusica.name };
      return { type: 'all' };
    },

    /*  searchPlayContextFor extirpado — alias histórico
 * sin llamadores; todos usan trackPlayContextFor directo. */

    runSearch(q, filter) {
      const ul = document.getElementById('searchResults');
      if (!ul) return;
      if (typeof this.unbindVirtualList === 'function') this.unbindVirtualList(ul);
      ul.innerHTML = '';
      if (!q || q.trim().length === 0) {
        this.renderSearchHistory(ul);
        return;
      }
      const qClean = this.cleanSearchStr(q);
      const qTokens = qClean.split(' ').filter(Boolean);
      const f = filter || 'all';

      const matchText = (text) => {
        if (!text) return false;
        if (!qTokens.length) return String(text).toLowerCase().includes(q.toLowerCase());
        const clean = this.cleanSearchStr(text);
        return qTokens.every(tok => clean.includes(tok));
      };

      const matchTrack = (t) => {
        // Sin tokens (consulta de solo símbolos) se conserva el
        // comportamiento histórico sobre el texto crudo.
        if (!qTokens.length) {
          return matchText(t.title) || matchText(t.artist) || matchText(t.album);
        }
        // Con tokens se busca sobre los textos ya normalizados y
        // cacheados por pista: normalizar 5.000 títulos por tecla
        // disparaba el coste de cada pulsación (ver prueba de estrés).
        const c = this._searchClean(t);
        if (f === 'title') return qTokens.every(tok => c.title.includes(tok));
        if (f === 'artist') return qTokens.every(tok => c.artist.includes(tok));
        if (f === 'album') return qTokens.every(tok => c.album.includes(tok));
        return qTokens.every(tok => c.all.includes(tok));
      };

      if (f === 'all') {
        const artists = (typeof this.getArtists === 'function' ? this.getArtists() : [])
          .filter(a => matchText(a.name)).slice(0, 8);
        const albums = (typeof this.getAlbums === 'function' ? this.getAlbums() : [])
          .filter(a => matchText(a.name) || matchText(a.artist)).slice(0, 8);
        const songs = this.tracks.filter(matchTrack);
        if (!artists.length && !albums.length && !songs.length) {
          ul.innerHTML = '<li class="track-row empty-placeholder">' + this.t('no_results') + '</li>';
          return;
        }
        const addTitle = (key) => {
          const li = document.createElement('li');
          li.className = 'search-section-title';
          li.textContent = this.t(key);
          ul.appendChild(li);
        };
        if (artists.length) {
          addTitle('search_section_artists');
          artists.forEach(ar => {
            const li = document.createElement('li');
            li.className = 'artist-row';
            li.innerHTML = `<div class="row-text"><div class="row-title">${this.esc(ar.name)}</div><div class="row-sub">${this.esc(this.fmtTracksCount(ar.tracks.length))}</div></div><svg class="ico row-chevron" aria-hidden="true"><use href="#i-chevron-right"></use></svg>`;
            li.addEventListener('click', () => this.goToArtist(ar.name));
            ul.appendChild(li);
          });
        }
        if (albums.length) {
          addTitle('search_section_albums');
          albums.forEach(al => {
            const li = document.createElement('li');
            li.className = 'artist-row';
            li.innerHTML = `<div class="row-text"><div class="row-title">${this.esc(al.name)}</div><div class="row-sub">${this.esc(al.artist)} · ${this.esc(this.fmtTracksCount(al.tracks.length))}</div></div><svg class="ico row-chevron" aria-hidden="true"><use href="#i-chevron-right"></use></svg>`;
            li.addEventListener('click', () => this.goToAlbum(al.name, al.artist));
            ul.appendChild(li);
          });
        }
        if (songs.length) {
          addTitle('search_section_songs');
          if (songs.length > 80 && typeof this.fillVirtualList === 'function') {
            const rest = document.createElement('ul');
            rest.className = 'track-list';
            rest.id = 'searchResultsSongs';
            const wrap = document.createElement('li');
            wrap.style.listStyle = 'none';
            wrap.appendChild(rest);
            ul.appendChild(wrap);
            this.fillVirtualList(rest, songs, (tr) => this.makeTrackRow(tr, { playContext: this.trackPlayContextFor(tr) }), {
              scroller: ul.closest('.sheet-body'),
              rowHeight: 64
            });
          } else {
            songs.forEach(tr => ul.appendChild(this.makeTrackRow(tr, { playContext: this.trackPlayContextFor(tr) })));
          }
        }
        return;
      }
      const res = this.tracks.filter(matchTrack);
      if (res.length === 0) {
        ul.innerHTML = '<li class="track-row empty-placeholder">' + this.t('no_results') + '</li>';
        return;
      }
      if (typeof this.fillVirtualList === 'function') {
        this.fillVirtualList(ul, res, (tr) => this.makeTrackRow(tr, { playContext: this.trackPlayContextFor(tr) }), {
          scroller: ul.closest('.sheet-body'),
          rowHeight: 64
        });
      } else {
        res.forEach(tr => ul.appendChild(this.makeTrackRow(tr, { playContext: this.trackPlayContextFor(tr) })));
      }
    },

    renderSearchHistory(ul) {
      const hist = Array.isArray(this._searchHistory) ? this._searchHistory : [];
      if (!hist.length) {
        ul.innerHTML = '';
        const li = document.createElement('li');
        li.className = 'empty-state compact';
        li.innerHTML = this.emptyStateHtml({
          icon: 'clock-rotate-left',
          // Antes se reutilizaba el placeholder del input como titular:
          // se veía «Canción, artista o ál…» en grande, duplicado con
          // el propio campo de búsqueda de encima.
          title: this.t('search_empty_title'),
          text: this.t('search_empty_hint')
        });
        ul.appendChild(li);
        return;
      }
      const title = document.createElement('li');
      title.className = 'search-section-title';
      title.textContent = this.t('search_recent');
      ul.appendChild(title);
      hist.forEach(q => {
        const li = document.createElement('li');
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'search-history-row';
        btn.innerHTML = '<svg class="ico" aria-hidden="true"><use href="#i-clock-rotate-left"></use></svg><span>' + this.esc(q) + '</span>';
        btn.addEventListener('click', () => {
          const inp = document.getElementById('searchInput');
          if (inp) inp.value = q;
          this.runSearch(q, this._searchFilter || 'all');
        });
        li.appendChild(btn);
        ul.appendChild(li);
      });
      const clear = document.createElement('li');
      const cbtn = document.createElement('button');
      cbtn.type = 'button';
      cbtn.className = 'search-history-row';
      cbtn.innerHTML = '<svg class="ico" aria-hidden="true"><use href="#i-xmark"></use></svg><span>' + this.esc(this.t('search_clear_history')) + '</span>';
      cbtn.addEventListener('click', () => {
        this.clearSearchHistory();
        this.runSearch('', this._searchFilter || 'all');
      });
      clear.appendChild(cbtn);
      ul.appendChild(clear);
    },

    /* ============================================================
     *  Render de la lista de Favoritos
     * ============================================================ */
    renderFavorites() {
      const ul = document.getElementById('favoritesList');
      if (!ul) return;
      const countEl = document.getElementById('favoritesCount');
      ul.innerHTML = '';
      // Favoritos también se ve y suena en orden de estrellas
      const favTracks = this.sortByRating(this.tracks.filter(t => this.favorites.has(t.id)));
      // «Reproducir Todo» sin favoritos no pinta nada: se oculta (el
      // estado vacío ya lo explica). Y si Favoritos es la lista que
      // suena, el botón lo dice con el mismo anillo que el hero.
      const playBtn = document.getElementById('btnPlayFavoritesNow');
      if (playBtn) {
        playBtn.style.display = favTracks.length ? '' : 'none';
        playBtn.classList.toggle('is-playing',
          favTracks.length > 0 && this.isPlaying &&
          !!this.playContext && this.playContext.type === 'favorites');
      }
      if (countEl) {
        const n = favTracks.length;
        countEl.textContent = n === 0
          ? this.t('favorites_count_zero')
          : (n === 1 ? this.t('favorites_count_one') : this.t('favorites_count_many').replace('X', n));
        // El estado vacío ya explica que no hay favoritos.
        countEl.hidden = n === 0;
      }
      if (favTracks.length === 0) {
        // Estado vacío sin botón de «ir a Biblioteca»: Favoritos ya es
        // una pestaña junto a Biblioteca en la barra inferior, así que
        // el CTA era un rodeo innecesario.
        ul.innerHTML = '';
        const li = document.createElement('li');
        li.className = 'empty-state fav-empty';
        li.innerHTML = this.emptyStateHtml({
          icon: 'heart',
          title: this.t('favorites_empty_title'),
          text: this.t('favorites_count_zero')
        });
        ul.appendChild(li);
        return;
      }
      // Para que pulsar una pista desde favoritos reproduzca TODA la lista
      // de favoritos (no solo la pista aislada), construimos el contexto.
      // Virtualizada como la cola y la biblioteca: con cientos de
      // favoritos, crear todas las filas de golpe congelaba la hoja.
      if (typeof this.fillVirtualList === 'function' && typeof this.makeTrackRow === 'function') {
        this.fillVirtualList(ul, favTracks,
          (t) => this.makeTrackRow(t, { playContext: { type: 'favorites' } }),
          { scroller: ul.closest('.sheet-body'), rowHeight: 64 });
      }
    },

    /*  compartir estadísticas retirado; la hoja se queda. */
});
