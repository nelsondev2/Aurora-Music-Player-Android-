/* =====================================================================
 *  js/nav.js — Aurora Music Player
 *  Mini-player · Inicio · pestañas de biblioteca · menú de pista
 * ===================================================================== */

'use strict';

Object.assign(App, {

    /* ============================================================
     *  Chrome: nav inferior + mini-player
     * ============================================================ */
    updateChrome() {
      const screen = document.getElementById('deviceScreen');
      if (!screen) return;
      const lyrics = !!(document.getElementById('viewLyrics') && document.getElementById('viewLyrics').classList.contains('active'));
      const player = !!(document.getElementById('viewPlayer') && document.getElementById('viewPlayer').classList.contains('active'));
      const openSheets = Array.from(document.querySelectorAll('.sheet.open'));
      const wide = document.documentElement.classList.contains('aurora-wide');

      /* Hay un menú/modal si hay cualquier sheet abierta que no sea una pestaña persistente (Biblioteca, Buscar, Favoritos) */
      const hasModal = openSheets.some(s => !s.classList.contains('sheet-tab'));

      /* El mini reproductor:
 * - Solo en vistas de navegación general (Inicio, Biblioteca, Buscar, Favoritos)
 * - NUNCA en pantalla completa de Now Playing ni en Letras
 * - NUNCA cuando hay un menú, modal o diálogo de confirmación abierto
 * - Solo si hay una pista actual y no estamos en modo escritorio dividido
 * - En Inicio (sin ninguna pestaña encima), solo mientras suena:
 * en pausa sobra, porque el hero «Retomar en…» ya ofrece seguir
 * donde ibas y la pantalla queda limpia. Fuera de Inicio
 * se comporta como siempre, también en pausa. */
      const homeView = document.getElementById('viewHome');
      const tabOpen = openSheets.some(s => s.classList.contains('sheet-tab'));
      const onHome = !!(homeView && homeView.classList.contains('active')) && !tabOpen;
      const showMini = !wide && !!this.currentTrack && !lyrics && !player && !hasModal
        && !(onHome && !this.isPlaying);

      screen.classList.toggle('has-mini', showMini);
      screen.classList.toggle('has-overlay', !wide && hasModal);
      screen.classList.toggle('chrome-hidden', lyrics && !wide);
      this.updateMiniPlayer();
    },

    updateMiniPlayer() {
      const bar = document.getElementById('miniPlayer');
      if (!bar) return;
      const t = this.currentTrack;
      if (!t) {
        bar.classList.add('is-empty');
        const title = document.getElementById('miniPlayerTitle');
        const artist = document.getElementById('miniPlayerArtist');
        if (title) title.textContent = this.t('load_track_to_start');
        if (artist) artist.textContent = '';
        return;
      }
      bar.classList.remove('is-empty');
      const title = document.getElementById('miniPlayerTitle');
      const artist = document.getElementById('miniPlayerArtist');
      if (title) title.textContent = t.title || '—';
      if (artist) artist.textContent = t.artist || this.t('unknown_artist');
      const cv = document.getElementById('miniPlayerCover');
      if (cv) this.drawRowCover(cv, t);
      const play = document.getElementById('miniPlayerPlay');
      if (play) {
        const ip = play.querySelector('.icon-play');
        const ips = play.querySelector('.icon-pause');
        if (this.isPlaying) {
          if (ip) ip.style.display = 'none';
          if (ips) ips.style.display = 'block';
          play.setAttribute('aria-label', this.t('pause'));
        } else {
          if (ip) ip.style.display = 'block';
          if (ips) ips.style.display = 'none';
          play.setAttribute('aria-label', this.t('play'));
        }
      }
      this._syncMiniMarquee();
    },

    _syncMiniMarquee() {
      const el = document.getElementById('miniPlayerTitle');
      if (!el) return;
      el.classList.toggle('marquee', el.scrollWidth > el.clientWidth + 4);
    },

    openNowPlaying() {
      this.closeAllSheets();
      this.showView('player');
      if (this.currentTrack) this.hideEmptyState();
      else this.showEmptyState();
      this.updateChrome();
    },

    setNavActive(nav) {
      document.querySelectorAll('.nav-btn').forEach(b => {
        const on = b.dataset.nav === nav;
        b.classList.toggle('active', on);
        // El lector de pantalla también debe saber dónde estás.
        if (on) b.setAttribute('aria-current', 'page');
        else b.removeAttribute('aria-current');
      });
    },

    goNav(nav) {
      /* El resaltado se aplica AL FINAL, no al principio: cerrar la
       * pestaña anterior dispara en closeSheet() el «volver a Inicio»,
       * y si la pestaña nueva ya se había marcado, ese reset la borraba
       * y el resaltado se quedaba en Inicio (reportado en dispositivo
       * al saltar entre Favoritos, Buscar y Biblioteca). */
      if (nav === 'home') {
        this.closeAllSheets();
        this.showView('home');
        this.renderHome();
      } else if (nav === 'library') {
        this.closeAllSheets();
        this.showView('home');
        this.openSheet('sheetLibrary');
        this.renderLibrarySections();
      } else if (nav === 'favorites') {
        this.closeAllSheets();
        this.showView('home');
        this.renderFavorites();
        this.openSheet('sheetFavorites');
      } else if (nav === 'search') {
        this.closeAllSheets();
        this.showView('home');
        this.openSheet('sheetSearch');
        const inp = document.getElementById('searchInput');
        this.runSearch(inp ? inp.value : '', this._searchFilter || 'all');
        setTimeout(() => {
          if (inp) inp.focus();
        }, 350);
      }
      this.setNavActive(nav);
      this.updateChrome();
    },

    /* ============================================================
     *  Inicio (hub)
     * ============================================================ */
    renderHome() {
      const root = document.getElementById('homeContent');
      if (!root) return;
      const homeView = document.getElementById('viewHome');
      if (homeView) homeView.classList.toggle('is-empty', !this.tracks.length);
      if (!this.tracks.length) {
        // Bienvenida de primer arranque. Sin wordmark «AURORA» bajo el
        // icono (el icono ya es la marca), con Ajustes a mano —la cabecera
        // de Inicio se oculta en este estado y dejaba la app sin ajustes
        // hasta cargar música— y perks informativos con descripción,
        // para que no parezcan botones que no hacen nada.
        root.innerHTML = `
          <div class="home-welcome">
            <div class="home-welcome-aurora" aria-hidden="true">
              <span class="hw-orb hw-orb-a"></span>
              <span class="hw-orb hw-orb-b"></span>
              <span class="hw-orb hw-orb-c"></span>
            </div>
            <button class="icon-btn home-welcome-settings" id="btnHomeWelcomeSettings" type="button" data-i18n-aria="settings_title" aria-label="${this.esc(this.t('settings_title'))}">
              <svg class="ico" aria-hidden="true"><use href="#i-gear"></use></svg>
            </button>
            <div class="home-welcome-mark">
              <img src="icon.png" alt="" width="88" height="88">
            </div>
            <h2>${this.esc(this.t('home_welcome_title'))}</h2>
            <p class="home-welcome-lead">${this.esc(this.t('home_welcome_lead'))}</p>
            <button class="primary-btn home-welcome-cta" id="btnHomeLoad" type="button">
              <svg class="ico" aria-hidden="true"><use href="#i-plus"></use></svg>
              <span>${this.esc(this.t('load_music'))}</span>
            </button>
            <ul class="home-welcome-formats" aria-label="${this.esc(this.t('empty_format_hint'))}">
              <li>MP3</li><li>FLAC</li><li>M4A</li><li>WAV</li><li>OGG</li><li>OPUS</li>
            </ul>
            <div class="home-welcome-perks">
              <div><svg class="ico" aria-hidden="true"><use href="#i-align-left"></use></svg><span class="hw-perk-text"><strong>${this.esc(this.t('home_perk_lyrics'))}</strong><small>${this.esc(this.t('home_perk_lyrics_desc'))}</small></span></div>
              <div><svg class="ico" aria-hidden="true"><use href="#i-list-ul"></use></svg><span class="hw-perk-text"><strong>${this.esc(this.t('home_perk_playlists'))}</strong><small>${this.esc(this.t('home_perk_playlists_desc'))}</small></span></div>
              <div><svg class="ico" aria-hidden="true"><use href="#i-lock"></use></svg><span class="hw-perk-text"><strong>${this.esc(this.t('home_perk_offline'))}</strong><small>${this.esc(this.t('home_perk_offline_desc'))}</small></span></div>
            </div>
          </div>`;
        const btn = document.getElementById('btnHomeLoad');
        if (btn) btn.addEventListener('click', () => this.openFilePicker());
        const btnSettings = document.getElementById('btnHomeWelcomeSettings');
        if (btnSettings) btnSettings.addEventListener('click', () => this.openSheet('sheetSettings'));
        return;
      }

      const t = this.currentTrack;
      let hero = '';
      if (t) {
        // La tarjeta «Continuar» es la misma pista que muestra el
        // mini-reproductor: para que aporte algo más que un duplicado,
        // si hay posición de reproducción enseña dónde retomar
        // («Retomar en 1:24»). Sin posición queda título y artista.
        // Y si la pista ESTÁ SONANDO no hay nada que «seguir»
        // escuchando: nace oculta y updatePlayUI la conmuta.
        const pos = (this.audio && this.audio.currentTime) || 0;
        const dur = (this.audio && this.audio.duration) || t.duration || 0;
        const resumeLine = (pos > 5 && (!dur || pos < dur - 2))
          ? `<span class="home-hero-resume">${this.esc(this.t('home_resume_at').replace('X', this.fmtTime(pos)))}</span>`
          : '';
        hero = `
          <button class="home-hero" id="homeHero" type="button" data-track="${this.esc(t.id)}"${this.isPlaying ? ' hidden' : ''}>
            <div class="home-hero-cover"><canvas id="homeHeroCanvas" width="216" height="216"></canvas></div>
            <div class="home-hero-text">
              <span class="home-kicker">${this.esc(this.t('home_continue'))}</span>
              <strong>${this.esc(t.title)}</strong>
              <span>${this.esc(t.artist || this.t('unknown_artist'))}</span>
              ${resumeLine}
            </div>
            <svg class="ico home-hero-chevron" aria-hidden="true"><use href="#i-chevron-right"></use></svg>
          </button>`;
      }

      const recent = this.getRecentlyAdded(12);
      const top = this.getTopTracks(8).map(x => x.track).filter(Boolean);
      const lists = this.playlists.slice(0, 8);

      root.innerHTML = hero +
        this._homeRail('homeRecent', this.t('home_recent'), recent, 'track') +
        this._homePlaylists(lists) +
        this._homeRail('homeTop', this.t('home_top'), top, 'track') +
        this._homeRatedRail();

      if (t) {
        const cv = document.getElementById('homeHeroCanvas');
        if (cv) this.drawRowCover(cv, t);
        const heroEl = document.getElementById('homeHero');
        if (heroEl) heroEl.addEventListener('click', () => this.openNowPlaying());
      }
      this._bindHomeRails();
    },

    /* Cabecera de sección con «Ver todo»: lleva a Biblioteca, donde
     * viven la lista completa de canciones y la de listas. */
    _sectionHead(title, target) {
      return `<div class="home-section-head">
        <h3 class="home-section-title">${this.esc(title)}</h3>
        <button class="home-see-all" type="button" data-see-all="${target || 'library'}">${this.esc(this.t('see_all'))}</button>
      </div>`;
    },

    _homeRail(id, title, tracks, kind) {
      if (!tracks || !tracks.length) return '';
      const curId = this.currentTrack && this.currentTrack.id;
      const items = tracks.map(t => {
        if (!t) return '';
        // La pista cargada se marca en su tarjeta: distintivo de
        // ecualizador sobre la portada (animado solo si está sonando).
        const isCur = t.id === curId;
        const nowBadge = isCur
          ? `<span class="eq-badge${this.isPlaying ? ' playing' : ''}" aria-hidden="true"><i></i><i></i><i></i></span>`
          : '';
        return `<button class="home-card${isCur ? ' is-current' : ''}" type="button" data-kind="${kind}" data-id="${this.esc(t.id)}">
          <div class="home-card-cover"><canvas width="384" height="384"></canvas>${nowBadge}</div>
          <span class="home-card-title">${this.esc(t.title)}</span>
          <span class="home-card-sub">${this.esc(t.artist || '')}</span>
        </button>`;
      }).join('');
      return `<section class="home-section">
        ${this._sectionHead(title)}
        <div class="home-rail" id="${id}">${items}</div>
      </section>`;
    },

    /* Escaparate «Más valoradas» de Inicio (redefinido en):
 * solo si hay alguna nota. Ya NO es una lista aparte —sin hoja ni
 * contexto propio—: las tarjetas suenan con el contexto de la
 * lista de cada canción, como el resto de Inicio. Es el escaparate
 * de las estrellas; el orden de verdad vive en las listas. */
    _homeRatedRail() {
      const rated = typeof this.getTopRatedTracks === 'function' ? this.getTopRatedTracks().slice(0, 10) : [];
      if (!rated.length) return '';
      const curId = this.currentTrack && this.currentTrack.id;
      const items = rated.map(t => {
        const isCur = t.id === curId;
        const nowBadge = isCur
          ? `<span class="eq-badge${this.isPlaying ? ' playing' : ''}" aria-hidden="true"><i></i><i></i><i></i></span>`
          : '';
        return `<button class="home-card${isCur ? ' is-current' : ''}" type="button" data-kind="track" data-id="${this.esc(t.id)}">
          <div class="home-card-cover"><canvas width="384" height="384"></canvas>${nowBadge}</div>
          <span class="home-card-title">${this.esc(t.title)}</span>
          <span class="home-card-sub rated-sub"><span class="sub-stars" aria-hidden="true">${'★'.repeat(this._ratingOf(t))}</span><span class="sub-artist">${this.esc(t.artist || '')}</span></span>
        </button>`;
      }).join('');
      return `<section class="home-section">
        <div class="home-section-head">
          <h3 class="home-section-title">${this.esc(this.t('rated_title'))}</h3>
        </div>
        <div class="home-rail" id="homeRated">${items}</div>
      </section>`;
    },

    /* Refresca SOLO el raíl de valoradas en sitio: al valorar,
 * Inicio enseñaba la nota que hubiera cuando se pintó, y una
 * canción recién valorada ni siquiera aparecía. Se reconstruye su
 * sección y se re-enlazan sus tarjetas (sin tocar el resto de
 * Inicio ni su posición de desplazamiento). Si aún no existe y
 * ya hay valoradas, se repinta Inicio entero. */
    _refreshRatedRail() {
      const home = document.getElementById('homeContent');
      if (!home) return;
      const rail = document.getElementById('homeRated');
      if (!rail) {
        if (this.getTopRatedTracks && this.getTopRatedTracks().length) this.renderHome();
        return;
      }
      const section = rail.closest('.home-section');
      const html = this._homeRatedRail();
      if (!html) { if (section) section.remove(); return; }
      const tpl = document.createElement('template');
      tpl.innerHTML = html.trim();
      const fresh = tpl.content.firstElementChild;
      if (!fresh || !section) return;
      section.replaceWith(fresh);
      this._bindSeeAll(fresh);
      this._bindHomeCards(fresh);
    },

    _homePlaylists(lists) {
      if (!lists || !lists.length) return '';
      const items = lists.map(pl => {
        const n = (pl.trackIds || []).length;
        return `<button class="home-card" type="button" data-kind="playlist" data-id="${this.esc(pl.id)}">
          <div class="home-card-cover" data-pl="${this.esc(pl.id)}" data-pl-cover="${this.esc(pl.id)}"></div>
          <span class="home-card-title">${this.esc(pl.name)}</span>
          <span class="home-card-sub">${this.esc(this.fmtTracksCount(n))}</span>
        </button>`;
      }).join('');
      return `<section class="home-section">
        ${this._sectionHead(this.t('home_playlists'))}
        <div class="home-rail" id="homePlaylists">${items}</div>
      </section>`;
    },

    _bindHomeRails() {
      const home = document.getElementById('homeContent');
      if (!home) return;
      this._bindSeeAll(home);
      this._bindHomeCards(home);
    },

    /* «Ver todo» de cada sección (su destino lo declara data-see-all). */
    _bindSeeAll(scope) {
      scope.querySelectorAll('[data-see-all]').forEach(btn => {
        btn.addEventListener('click', () => this.goNav(btn.dataset.seeAll));
      });
    },

    /* Enlaza las tarjetas de un ámbito (Inicio entero o una sección
 * reconstruida, como la de valoradas al refrescarla,). */
    _bindHomeCards(scope) {
      scope.querySelectorAll('.home-card').forEach(card => {
        const kind = card.dataset.kind;
        const id = card.dataset.id;
        if (kind === 'track') {
          const t = this.tracks.find(x => x.id === id);
          const cv = card.querySelector('canvas');
          // Tarjetas grandes de Inicio: la obra completa, sin recorte
          if (cv && t) this.drawRowCover(cv, t, { fit: 'ambient' });
          card.addEventListener('click', () => {
            // Tarjeta suelta de Inicio: la lista de la canción manda
            // (mismo criterio que Buscar,). También en el
            // escaparate de valoradas, que ya no es lista aparte.
            const ctx = typeof this.trackPlayContextFor === 'function' ? this.trackPlayContextFor(t) : { type: 'all' };
            this.playTrack(id, ctx);
            this.updateChrome();
            if (typeof this.openPlayerForTrackPick === 'function') this.openPlayerForTrackPick();
          });
          this.wireTrackLongPress(card, id);
        } else if (kind === 'playlist') {
          const pl = this.playlists.find(p => p.id === id);
          const coverEl = card.querySelector('[data-pl]');
          if (coverEl && pl) {
            const cover = this.getPlaylistCover(pl);
            if (typeof cover === 'string' && cover.startsWith('data:')) {
              coverEl.style.backgroundImage = 'url(' + cover + ')';
              coverEl.style.backgroundSize = 'cover';
            } else {
              const from = (cover && cover.from) || ((this.coverFallback && this.coverFallback().from) || '#6E5CFF');
              const to = (cover && cover.to) || ((this.coverFallback && this.coverFallback().to) || '#FF7AB6');
              coverEl.style.background = 'linear-gradient(135deg,' + from + ',' + to + ')';
            }
          }
          card.addEventListener('click', () => this.openEditPlaylist(id));
        }
      });
    },

    getRecentlyAdded(n) {
      const arr = this.tracks.slice().sort((a, b) => (b.addedAt || 0) - (a.addedAt || 0));
      if (arr.every(t => !t.addedAt)) return this.tracks.slice().reverse().slice(0, n);
      return arr.slice(0, n);
    },

    /* ============================================================
 * Biblioteca: solo listas de reproducción. Antes había
 * pestañas y después una sección «Todas las canciones» con su
 * ordenación y su selección por lotes: todo eso se fue a
 *. Álbumes y artistas siguen accesibles
 * desde el menú de cada pista («Ir al artista» / «Ir al álbum»).
 * ============================================================ */
    renderLibrarySections() {
      this.renderPlaylists();
      this.renderLibraryCatalog();
    },

    /*  pestañas de la biblioteca. 'playlists' es la vista de
 * siempre (: solo listas; NO vuelve «Todas las canciones»).
 * Álbumes/Artistas/Géneros son un índice navegable nuevo que el
 * usuario pidió expresamente tras la auditoría: tarjetas con
 * portada que abren la vista de álbum/artista ya existente. */
    setLibTab(tab) {
      this._libTab = tab || 'playlists';
      document.querySelectorAll('.lib-tab').forEach(b => {
        const on = b.dataset.libtab === this._libTab;
        b.classList.toggle('active', on);
        //  el estado visual debe reflejarse en ARIA — los
        // lectores de pantalla anuncian qué pestaña está activa.
        b.setAttribute('aria-selected', on ? 'true' : 'false');
      });
      const show = (id, on) => {
        const el = document.getElementById(id);
        if (el) el.hidden = !on;
      };
      show('libSectionPlaylists', this._libTab === 'playlists');
      show('libSectionAlbums', this._libTab === 'albums');
      show('libSectionArtists', this._libTab === 'artists');
      show('libSectionGenres', this._libTab === 'genres');
      if (this._libTab !== 'playlists') this.renderLibraryCatalog();
    },

    /*  pinta el índice de Álbumes / Artistas / Géneros según la
 * pestaña activa. Cada tarjeta abre openBrowse con sus pistas. */
    renderLibraryCatalog() {
      const tab = this._libTab || 'playlists';
      const gridId = tab === 'albums' ? 'libraryAlbums'
        : tab === 'artists' ? 'libraryArtists'
        : tab === 'genres' ? 'libraryGenres' : null;
      if (!gridId) return;
      const grid = document.getElementById(gridId);
      if (!grid) return;
      grid.innerHTML = '';
      const card = (name, sub, seedTrack, onOpen) => {
        const li = document.createElement('li');
        li.className = 'catalog-card';
        li.innerHTML = '<div class="cat-cover"><canvas width="240" height="240"></canvas></div>' +
          '<div class="cat-name">' + this.esc(name) + '</div>' +
          '<div class="cat-sub">' + this.esc(sub) + '</div>';
        li.addEventListener('click', onOpen);
        const cv = li.querySelector('canvas');
        if (cv && seedTrack) this.drawRowCover(cv, seedTrack);
        else if (cv) {
          const ctx = cv.getContext('2d');
          if (ctx) { ctx.fillStyle = (this.coverFallback && this.coverFallback().from) || '#6E5CFF'; ctx.fillRect(0, 0, 240, 240); }
        }
        return li;
      };
      if (tab === 'albums') {
        this.getAlbums().forEach(al => {
          const years = [...new Set(al.tracks.map(t => t.year).filter(Boolean))];
          const sub = al.artist + ' · ' + this.fmtTracksCount(al.tracks.length) + (years.length === 1 ? ' · ' + years[0] : '');
          const seed = al.tracks.find(t => t.coverIsImage) || al.tracks[0];
          grid.appendChild(card(al.name, sub, seed, () => this.goToAlbum(al.name, al.artist)));
        });
      } else if (tab === 'artists') {
        this.getArtists().forEach(ar => {
          const albums = new Set(ar.tracks.map(t => this.albumKey(t))).size;
          const sub = this.fmtTracksCount(ar.tracks.length) + ' · ' + albums + ' ' + this.t('tab_albums').toLowerCase();
          const seed = ar.tracks.find(t => t.coverIsImage) || ar.tracks[0];
          grid.appendChild(card(ar.name, sub, seed, () => this.goToArtist(ar.name)));
        });
      } else if (tab === 'genres') {
        this.getGenres().forEach(g => {
          const seed = g.tracks.find(t => t.coverIsImage) || g.tracks[0];
          grid.appendChild(card(g.name, this.fmtTracksCount(g.tracks.length), seed, () => {
            this.openBrowse({ type: 'genre', title: g.name, tracks: g.tracks.slice() });
          }));
        });
      }
    },

    albumKey(t) {
      const album = (t.album && !this.isPlaceholderAlbum(t.album)) ? t.album : this.t('no_album');
      const artist = (t.artist && !this.isPlaceholderArtist(t.artist)) ? t.artist : '';
      return album + '\0' + artist;
    },

    getAlbums() {
      const map = new Map();
      this.tracks.forEach(t => {
        const key = this.albumKey(t);
        if (!map.has(key)) {
          map.set(key, {
            key,
            name: (t.album && !this.isPlaceholderAlbum(t.album)) ? t.album : this.t('no_album'),
            artist: (t.artist && !this.isPlaceholderArtist(t.artist)) ? t.artist : this.t('unknown_artist'),
            tracks: []
          });
        }
        map.get(key).tracks.push(t);
      });
      return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));
    },

    getArtists() {
      const map = new Map();
      this.tracks.forEach(t => {
        const name = (t.artist && !this.isPlaceholderArtist(t.artist)) ? t.artist : this.t('unknown_artist');
        if (!map.has(name)) map.set(name, { name, tracks: [] });
        map.get(name).tracks.push(t);
      });
      return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));
    },

    /* ============================================================
     *  Vista Álbum / Artista
     * ============================================================ */
    openBrowse(opts) {
      this._browse = opts;
      //  cada vista nueva empieza en su orden natural.
      const sortSel = document.getElementById('browseSortSelect');
      if (sortSel) { this._browse.sort = 'added'; sortSel.value = 'added'; }
      const title = document.getElementById('browseTitle');
      const sub = document.getElementById('browseSubtitle');
      if (title) title.textContent = opts.title || '';
      if (sub) sub.textContent = opts.subtitle || this.fmtTracksCount((opts.tracks || []).length);
      const coverEl = document.getElementById('browseCover');
      if (coverEl) {
        coverEl.innerHTML = '<canvas width="240" height="240"></canvas>';
        const seed = (opts.tracks || []).find(t => t.coverIsImage) || (opts.tracks || [])[0];
        const cv = coverEl.querySelector('canvas');
        if (cv && seed) this.drawRowCover(cv, seed);
      }
      this.renderBrowseTracks();
      this.openSheet('sheetBrowse');
    },

    /*  las pistas de la vista actual en el orden elegido en su
 * selector (por defecto, el orden en que llegaron: 'added'). */
    browseTracksSorted() {
      if (!this._browse) return [];
      const sel = document.getElementById('browseSortSelect');
      const mode = this._browse.sort || (sel && sel.value) || 'added';
      return this.sortTracksBy(this._browse.tracks || [], mode);
    },

    renderBrowseTracks() {
      const ul = document.getElementById('browseTracks');
      if (!ul || !this._browse) return;
      ul.innerHTML = '';
      const tracks = this.browseTracksSorted();
      const ctx = this._browse.type === 'album'
        ? { type: 'album', name: this._browse.title, artist: this._browse.artist || this._browse.subtitle }
        : this._browse.type === 'genre'
          ? { type: 'genre', name: this._browse.title }
          : { type: 'artist', name: this._browse.title };
      tracks.forEach(t => ul.appendChild(this.makeTrackRow(t, { playContext: ctx })));
    },

    playBrowse() {
      if (!this._browse || !this._browse.tracks || !this._browse.tracks.length) {
        this.toast(this.t('toast_playlist_empty'));
        return;
      }
      //  «Reproducir Todo» suena en el orden que se ve (el del
      // selector), no en el orden interno de _browse.tracks.
      const ids = this.browseTracksSorted().map(t => t.id);
      this.queue = ids;
      this.queueIdx = 0;
      this._plSyncIds = null; //  álbum/artista/género no sincronizan
      this.playContext = this._browse.type === 'album'
        ? { type: 'album', name: this._browse.title, artist: this._browse.artist || this._browse.subtitle }
        : this._browse.type === 'genre'
          ? { type: 'genre', name: this._browse.title }
          : { type: 'artist', name: this._browse.title };
      // Igual que playPlaylist(): si shuffle está activo, barajar la cola nueva
      // anclando su primera pista (no la que sonaba antes); si no, limpiar la
      // cola original para no restaurar una lista ajena.
      if (this.shuffle) this._applyShuffle(ids[0]);
      else this._originalQueue = null;
      this.playFromQueue(0);
      this.updateChrome();
      this.renderQueue();
      if (typeof this.openPlayerForTrackPick === 'function') this.openPlayerForTrackPick();
    },

    goToArtist(name) {
      if (!name || this.isPlaceholderArtist(name)) {
        this.toast(this.t('unknown_artist'));
        return;
      }
      const tracks = this.tracks.filter(t => t.artist === name);
      this.closeSheet('sheetMore');
      this.closeSheet('sheetTrackMenu');
      this.closeSheet('sheetSearch');
      this.openBrowse({ type: 'artist', title: name, tracks });
    },

    goToAlbum(album, artist) {
      if (!album || this.isPlaceholderAlbum(album)) {
        this.toast(this.t('no_album'));
        return;
      }
      const tracks = this.tracks.filter(t => t.album === album && (!artist || t.artist === artist));
      this.closeSheet('sheetMore');
      this.closeSheet('sheetTrackMenu');
      this.openBrowse({
        type: 'album',
        title: album,
        subtitle: artist || '',
        tracks
      });
    },

    /* Duración para celdas de fila: si aún no se conocen los metadatos
     * (0/ausente) se deja la celda vacía. Mostrar «0:00» sugería que la
     * canción dura cero segundos, como se veía en las capturas. */
    fmtRowDuration(t) {
      const d = t && Number(t.duration);
      if (d > 0) return this.fmtTime(d);
      // Duración desconocida: un «—» muy tenue mantiene el ritmo de la
      // columna (dejar el hueco parecía un fallo de pintado). No se
      // inventa ninguna cifra.
      return '<span class="row-duration-na" aria-hidden="true">—</span>';
    },

    /* ============================================================
     *  Fila de pista + menú contextual
     * ============================================================ */
    makeTrackRow(t, opts) {
      opts = opts || {};
      const li = document.createElement('li');
      const isCurrent = this.currentTrack && this.currentTrack.id === t.id;
      li.className = 'track-row' + (isCurrent ? ' current' : '');
      li.dataset.track = t.id;
      // Subtítulo sin eco: el álbum se oculta cuando coincide con el
      // título o con el artista (sencillos: «BALALAIKA» y debajo
      // «9Lana · BALALAIKA» decía lo mismo dos veces). Igual que ya
      // hace el reproductor con su línea de álbum.
      const normRow = (v) => String(v == null ? '' : v).trim().toLowerCase();
      const showAlbum = t.album && !this.isPlaceholderAlbum(t.album)
        && normRow(t.album) !== normRow(t.title)
        && normRow(t.album) !== normRow(t.artist);
      // La pista cargada se marca sobre la portada con el ecualizador
      // (animado solo si está sonando), como en las tarjetas de Inicio.
      const nowBadge = isCurrent
        ? `<span class="eq-badge eq-badge-row${this.isPlaying ? ' playing' : ''}" aria-hidden="true"><i></i><i></i><i></i></span>`
        : '';
      li.innerHTML = `
        <div class="row-cover"><canvas width="144" height="144"></canvas>${nowBadge}</div>
        <div class="row-text">
          <div class="row-title">${this.esc(t.title)}</div>
          <div class="row-sub">${this.esc(t.artist)}${showAlbum ? ' · ' + this.esc(t.album) : ''} <span class="row-rating"${this._ratingOf(t) ? '' : ' hidden'}>${'★'.repeat(this._ratingOf(t))}</span></div>
        </div>
        <div class="row-duration">${this.fmtRowDuration(t)}</div>
        <button class="row-action track-menu-btn" type="button" aria-label="${this.esc(this.t('more_options'))}"><svg class="ico" aria-hidden="true"><use href="#i-ellipsis-vertical"></use></svg></button>`;
      const ctx = opts.playContext || { type: 'all' };
      li.addEventListener('click', (e) => {
        if (e.target.closest('.track-menu-btn')) return;
        this.playTrack(t.id, ctx);
        this.updateChrome();
        // Elegir canción en una lista abre el reproductor.
        if (typeof this.openPlayerForTrackPick === 'function') this.openPlayerForTrackPick();
      });
      const menuBtn = li.querySelector('.track-menu-btn');
      if (menuBtn) menuBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.openTrackMenu(t.id);
      });
      this.wireTrackLongPress(li, t.id);
      const cv = li.querySelector('canvas');
      if (cv) this.drawRowCover(cv, t);
      return li;
    },

    wireTrackLongPress(el, trackId) {
      let timer = null;
      let fired = false;
      const start = (e) => {
        if (e.target && e.target.closest && e.target.closest('.track-menu-btn, .row-action, .batch-checkbox')) return;
        fired = false;
        timer = setTimeout(() => {
          timer = null;
          fired = true;
          // Pulsación larga = menú de la canción (antes entraba en
          // el modo lote de «Todas las canciones», eliminado en).
          this.openTrackMenu(trackId);
          if (navigator.vibrate) navigator.vibrate(25);
        }, 520);
      };
      const cancel = () => { if (timer) { clearTimeout(timer); timer = null; } };
      el.addEventListener('touchstart', start, { passive: true });
      el.addEventListener('touchend', cancel);
      el.addEventListener('touchmove', cancel, { passive: true });
      el.addEventListener('mousedown', start);
      el.addEventListener('mouseup', cancel);
      el.addEventListener('mouseleave', cancel);
      el.addEventListener('click', (e) => {
        if (!fired) return;
        fired = false;
        e.preventDefault();
        e.stopPropagation();
      }, true);
    },

    openTrackMenu(trackId) {
      const t = this.tracks.find(x => x.id === trackId);
      if (!t) return;
      this._menuTrackId = trackId;
      const title = document.getElementById('trackMenuTitle');
      const sub = document.getElementById('trackMenuSub');
      if (title) title.textContent = t.title;
      // Misma regla sin eco que las filas: nada de «artista · álbum»
      // cuando el álbum repite el título o al propio artista.
      const normMenu = (v) => String(v == null ? '' : v).trim().toLowerCase();
      const menuAlbum = t.album && !this.isPlaceholderAlbum(t.album)
        && normMenu(t.album) !== normMenu(t.title)
        && normMenu(t.album) !== normMenu(t.artist);
      if (sub) sub.textContent = (t.artist || '') + (menuAlbum ? ' · ' + t.album : '');
      const cv = document.getElementById('trackMenuCover');
      if (cv) this.drawRowCover(cv, t);
      const goAlbum = document.getElementById('ctxGoAlbum');
      if (goAlbum) goAlbum.style.display = (t.album && !this.isPlaceholderAlbum(t.album)) ? '' : 'none';
      const goArtist = document.getElementById('ctxGoArtist');
      if (goArtist) goArtist.style.display = (t.artist && !this.isPlaceholderArtist(t.artist)) ? '' : 'none';
      // La fila de favorito refleja el estado real de esta pista (el menú
      // se reutiliza: no puede quedarse con el estado de la anterior).
      const favRow = document.getElementById('ctxToggleFavorite');
      const favLabel = document.getElementById('ctxFavoriteLabel');
      const isFav = this.favorites.has(trackId);
      if (favRow) {
        favRow.setAttribute('aria-pressed', isFav ? 'true' : 'false');
        favRow.classList.toggle('is-fav', isFav);
        const use = favRow.querySelector('use');
        if (use) use.setAttribute('href', isFav ? '#i-heart-solid' : '#i-heart');
      }
      if (favLabel) favLabel.textContent = this.t('favorite');
      // «Restablecer portada» solo tiene sentido si hay una personalizada.
      const rmCover = document.getElementById('ctxRemoveCover');
      if (rmCover) rmCover.hidden = !t.customCover;
      this._syncRatingUI(t);
      this.openSheet('sheetTrackMenu');
    },

    menuTrack() {
      return this.tracks.find(x => x.id === this._menuTrackId) || null;
    },

    /* ============================================================
 * Valoración por estrellas
 * ============================================================
 * track.rating guarda 1..5 (ausente/0 = sin valorar). Vive en el
 * registro de la pista: persistTrack lo guarda en IndexedDB
 * sin tocar nada más. Tocar la estrella ya puesta quita la nota. */
    _ratingOf(t) {
      const r = t && parseInt(t.rating, 10);
      return Number.isFinite(r) ? Math.max(0, Math.min(5, r)) : 0;
    },

    setTrackRating(trackId, value) {
      const t = this.tracks.find(x => x.id === trackId);
      if (!t) return;
      const v = Math.max(1, Math.min(5, parseInt(value, 10) || 0));
      t.rating = this._ratingOf(t) === v ? 0 : v;
      this.persistTrack(t);
      this._syncRatingUI(t);
      //  si lo que suena manda por más valoradas (lista con el
      // orden de estrellas o Favoritos), la cola viva se reordena
      // detrás de la actual: valorar y que no pase nada era la
      // mitad de la queja de «la cola por valoradas no funciona».
      if (!this.shuffle && typeof this.resortUpcomingQueue === 'function' && this.playContext) {
        if (this.playContext.type === 'favorites') {
          this.resortUpcomingQueue(false);
        } else if (this.playContext.type === 'playlist') {
          const plNow = this.playlists.find(p => p.id === this.playContext.id);
          if (plNow && (plNow.sort || 'stars') === 'stars') this.resortUpcomingQueue(false);
        }
      }
      // La hoja de «Más valoradas», si está abierta, se rinde otra vez:
      // la canción puede entrar, salir o cambiar de puesto.
      // Y el raíl de Inicio, que es la otra superficie de la nota:
      // sin esto enseñaba la valoración de cuando se pintó.
      this._refreshRatedRail();
    },

    /* Pinta el estado de las estrellas en los tres sitios vivos: el
     * menú de la canción, el Reproductor y las filas ya renderizadas
     * (sin re-renderizar listas: se toca solo la insignia de la fila). */
    _syncRatingUI(t) {
      if (!t) return;
      const r = this._ratingOf(t);
      const paint = (rootId) => {
        const root = document.getElementById(rootId);
        if (!root) return;
        root.querySelectorAll('.rate-star').forEach(b => {
          const v = parseInt(b.dataset.value, 10) || 0;
          b.classList.toggle('on', v <= r);
          b.setAttribute('aria-checked', v === r ? 'true' : 'false');
        });
      };
      if (this._menuTrackId === t.id) paint('ctxRatingStars');
      if (this.currentTrack && this.currentTrack.id === t.id) paint('npRatingStars');
      // data-track (filas makeTrackRow), data-track-id (lista y cola)
      document.querySelectorAll(
        '.track-row[data-track="' + t.id + '"] .row-rating, ' +
        '.track-row[data-track-id="' + t.id + '"] .row-rating, ' +
        '.queue-item[data-track-id="' + t.id + '"] .row-rating'
      ).forEach(slot => {
        slot.textContent = r ? '★'.repeat(r) : '';
        slot.hidden = !r;
      });
    },

    /* ============================================================
     *  Editar etiquetas
     * ============================================================ */
    openEditTrack(trackId) {
      const t = this.tracks.find(x => x.id === trackId);
      if (!t) return;
      this._editTrackId = trackId;
      const title = document.getElementById('editTrackTitle');
      const artist = document.getElementById('editTrackArtist');
      const album = document.getElementById('editTrackAlbum');
      if (title) title.value = t.title || '';
      if (artist) artist.value = this.isPlaceholderArtist(t.artist) ? '' : (t.artist || '');
      if (album) album.value = this.isPlaceholderAlbum(t.album) ? '' : (t.album || '');
      this.openSheet('sheetEditTrack');
    },

    async saveEditTrack() {
      const t = this.tracks.find(x => x.id === this._editTrackId);
      if (!t) return;
      const title = (document.getElementById('editTrackTitle') || {}).value || '';
      const artist = (document.getElementById('editTrackArtist') || {}).value || '';
      const album = (document.getElementById('editTrackAlbum') || {}).value || '';
      t.title = title.trim() || t.title;
      t.artist = artist.trim() || this.t('unknown_artist');
      t.album = album.trim() || this.t('no_album');
      //  marca de «editado a mano» — releer etiquetas ya no
      // pisa este texto con el del archivo (ver retagExistingTracks).
      t._userEdited = true;
      await this.persistTrack(t);
      this.closeSheet('sheetEditTrack');
      this.closeSheet('sheetTrackMenu');
      this.renderPlaylists();
      this.renderQueue();
      this.renderFavorites();
      this.renderHome();
      if (this.currentTrack && this.currentTrack.id === t.id) this.renderCurrentTrack();
      if (this._browse) this.renderBrowseTracks();
      this.updateMiniPlayer();
      this.toast(this.t('edit_track_saved'));
    }
});
