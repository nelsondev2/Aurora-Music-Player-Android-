/* =====================================================================
 *  js/device-library.js — Aurora Music Player
 *  Importar la música que ya está en el móvil, sin copiarla.
 *
 *  El resto del importador lee el archivo y lo guarda dentro de la app
 *  (IndexedDB). Eso tiene un precio: la misma canción ocupa dos veces en
 *  el dispositivo. Aquí, en cambio, se pregunta a MediaStore qué música
 *  hay y se guarda solo la ficha y su content://: el audio se lee del
 *  archivo original.
 *
 *  Esas pistas llevan `deviceUri` y no tienen blob. Todo lo demás —cola,
 *  letras, estadísticas, listas— funciona igual, y el motor nativo sabe
 *  reproducirlas directamente (NativePlayer.playUri). Borrarlas de la
 *  biblioteca no toca el archivo: solo se olvida la ficha.
 * ===================================================================== */

'use strict';

/* Páginas al consultar MediaStore: una biblioteca grande no cabe en una
 * sola cadena de JavaScript. */
const DEVICE_PAGE = 200;
/* Carátulas que se traen en una importación. Cada álbum cuesta una
 * llamada al puente; con 150 se cubre de sobra una biblioteca normal sin
 * inflar IndexedDB (cada una ronda los 15 KB). */
const DEVICE_ART_LIMIT = 150;

const DeviceLibrary = {
  /* ¿Esta build sabe leer MediaStore? */
  get available() {
    const D = window.AuroraDevice;
    return !!(D && typeof D.scan === 'function' && typeof D.status === 'function');
  },

  /* Estado del permiso y total de pistas, o null si no hay puente. */
  status() {
    if (!this.available) return null;
    try {
      return JSON.parse(window.AuroraDevice.status());
    } catch (e) {
      return null;
    }
  },

  /* Pide el permiso de lectura de audio (la respuesta llega a
   * window.AuroraDeviceAccess). */
  requestAccess() {
    if (!this.available) return;
    try { window.AuroraDevice.requestAccess(); } catch (e) {}
  },

  /* Recorre MediaStore pagina a pagina. Devuelve la lista completa de
   * fichas (sin carátulas) o lanza un error con `code`. */
  async scanAll(onProgress) {
    if (!this.available) {
      const err = new Error('sin puente de dispositivo');
      err.code = 'unavailable';
      throw err;
    }
    const first = this.status();
    if (first && first.granted === false) {
      const err = new Error('permiso');
      err.code = 'permission';
      throw err;
    }

    const out = [];
    let offset = 0;
    let total = 0;
    for (;;) {
      let page;
      try {
        page = JSON.parse(window.AuroraDevice.scan(offset, DEVICE_PAGE));
      } catch (e) {
        const err = new Error('respuesta ilegible');
        err.code = 'parse';
        throw err;
      }
      if (page && page.error === 'permission') {
        const err = new Error('permiso');
        err.code = 'permission';
        throw err;
      }
      if (page && page.error) {
        const err = new Error(page.error);
        err.code = 'scan';
        throw err;
      }
      const items = (page && page.items) || [];
      total = (page && page.total) || total;
      items.forEach(it => out.push(it));
      if (onProgress) onProgress(out.length, total);
      if (items.length < DEVICE_PAGE) break;
      offset += items.length;
      if (offset > 20000) break; // freno de seguridad ante un cursor raro
    }
    return { items: out, total: total || out.length };
  },

  /* Carátula de un álbum, como data URL ('' si no hay). */
  albumArt(albumId, trackId) {
    if (!this.available || typeof window.AuroraDevice.albumArt !== 'function') return '';
    try {
      return window.AuroraDevice.albumArt(Number(albumId) || 0, Number(trackId) || 0) || '';
    } catch (e) {
      return '';
    }
  },

  /* Convierte una ficha de MediaStore en una pista de la app. */
  toTrack(item) {
    const ext = (item.fileName && item.fileName.indexOf('.') > 0)
      ? item.fileName.split('.').pop().toLowerCase() : '';
    const durationSec = item.duration > 10000 ? Math.round(item.duration / 1000) : (item.duration || 0);
    return {
      id: 'dev-' + item.id,
      title: item.title || (item.fileName || '').replace(/\.[^.]+$/, '') || 'Sin título',
      artist: item.artist || '',
      album: item.album || '',
      duration: durationSec,
      src: item.uri,
      // La ficha del archivo original: es lo que permite reproducir sin copia.
      deviceUri: item.uri,
      deviceId: item.id,
      deviceExt: ext || 'audio',
      fileName: item.fileName || '',
      fileSize: item.size || 0,
      mime: item.mime || '',
      genre: '',
      year: item.year || null,
      addedAt: item.addedAt || Date.now(),
      // Sin blob que releer: el re-etiquetado no la toca.
      _tagsChecked: true,
      _device: true
    };
  }
};

window.DeviceLibrary = DeviceLibrary;

Object.assign(App, {
  /* ¿Se puede escanear el dispositivo en esta build? */
  canScanDevice() {
    return DeviceLibrary.available;
  },

  /* Entrada del menú «Escanear el móvil». */
  async scanDeviceLibrary(targetPlaylistId) {
    if (!this.canScanDevice()) {
      this.toast(this.t('device_unavailable'), 'danger');
      return;
    }
    if (this._scanningDevice) return;
    if (this._importing) {
      this.toast(this.t('toast_import_running'));
      return;
    }

    const st = DeviceLibrary.status();
    if (st && st.granted === false) {
      // El permiso se pide y la respuesta vuelve por AuroraDeviceAccess.
      this._pendingDeviceScan = targetPlaylistId || null;
      this.toast(this.t('device_permission_ask'));
      DeviceLibrary.requestAccess();
      return;
    }

    this._scanningDevice = true;
    this._importCancelled = false;
    this.showImportOverlay(0, 0, this.t('device_scanning'));
    try {
      const { items } = await DeviceLibrary.scanAll((done, total) => {
        this.updateImportOverlay(done, total || done, this.t('device_scanning'));
      });
      if (!items.length) {
        this.hideImportOverlay();
        this.toast(this.t('device_empty'));
        return;
      }
      await this._importDeviceItems(items, targetPlaylistId || null);
    } catch (err) {
      this.hideImportOverlay();
      if (err && err.code === 'permission') {
        this._pendingDeviceScan = targetPlaylistId || null;
        this.toast(this.t('device_permission_ask'));
        DeviceLibrary.requestAccess();
      } else {
        console.error('[Aurora] escaneo del dispositivo:', err);
        this.toast(this.t('device_scan_failed'), 'danger');
      }
    } finally {
      this._scanningDevice = false;
    }
  },

  /* Convierte las fichas en pistas, evita duplicados y las guarda. */
  async _importDeviceItems(items, targetPlaylistId) {
    // Índice de lo que ya hay: por id de MediaStore y por nombre+tamaño
    // (una canción importada antes copiándola no debe entrar dos veces).
    const byDevice = new Set();
    const byKey = new Set();
    for (const t of this.tracks) {
      if (t.deviceId) byDevice.add(String(t.deviceId));
      if (t.fileName) byKey.add(this._dupKey(t.fileName, t.fileSize));
    }

    const fresh = [];
    let dupCount = 0;
    for (const item of items) {
      if (byDevice.has(String(item.id))) { dupCount++; continue; }
      const track = DeviceLibrary.toTrack(item);
      const key = this._dupKey(track.fileName, track.fileSize);
      if (track.fileName && byKey.has(key)) { dupCount++; continue; }
      byDevice.add(String(item.id));
      if (track.fileName) byKey.add(key);
      fresh.push({ track, item });
    }

    if (!fresh.length) {
      this.hideImportOverlay();
      this.toast(this.t('toast_import_dupes').replace('X', String(dupCount)));
      return;
    }

    // Carátulas: una por álbum, con tope, y con progreso a la vista.
    const albums = new Map();
    for (const { item } of fresh) {
      if (item.albumId && !albums.has(String(item.albumId))) albums.set(String(item.albumId), item);
    }
    let done = 0;
    for (const [albumId, item] of albums) {
      if (done >= DEVICE_ART_LIMIT) break;
      const art = DeviceLibrary.albumArt(albumId, item.id);
      if (art) {
        for (const entry of fresh) {
          if (String(entry.item.albumId) === albumId) {
            entry.track.cover = art;
            entry.track.coverIsImage = true;
            entry.track.coverThumb = art;
            entry.track.coverThumbLg = art;
          }
        }
      }
      done++;
      // Progreso real de carátulas (una por álbum, con tope).
      this.updateImportOverlay(done, Math.min(albums.size, DEVICE_ART_LIMIT),
        this.t('device_art_progress'));
    }

    const newTracks = fresh.map(f => f.track);
    this.tracks.push(...newTracks);
    try {
      if (typeof this.persistTracksBatch === 'function') await this.persistTracksBatch(newTracks);
      else for (const t of newTracks) await this.persistTrack(t);
    } catch (e) {
      console.warn('[Aurora] no se pudieron guardar las pistas del dispositivo:', e);
    }

    // Lista de destino (si la importación venía de una lista) o Mi Música.
    const ids = newTracks.map(t => t.id);
    if (targetPlaylistId) {
      const dest = this.playlists.find(p => p.id === targetPlaylistId);
      if (dest) {
        dest.trackIds = Array.isArray(dest.trackIds) ? dest.trackIds : [];
        for (const id of ids) if (!dest.trackIds.includes(id)) dest.trackIds.push(id);
        try { await this.persistPlaylist(dest); } catch (e) {}
      }
    } else if (typeof this._ensureMiMusica === 'function') {
      try { this._ensureMiMusica(ids); } catch (e) {}
    }

    // Cola y pantallas: como cualquier importación.
    if (!this.queue.length) this.queue = this.tracks.map(t => t.id);
    else for (const t of newTracks) if (!this.queue.includes(t.id)) this.queue.push(t.id);

    this.hideImportOverlay();
    try { this.renderPlaylists(); } catch (e) {}
    try { this.renderQueue(); } catch (e) {}
    try { if (typeof this.renderHome === 'function') this.renderHome(); } catch (e) {}
    try { this.renderFavorites(); } catch (e) {}
    if (typeof this.hideEmptyState === 'function') this.hideEmptyState();
    if (!this.currentTrack && newTracks.length) {
      this.currentTrack = newTracks[0];
      this.renderCurrentTrack();
    }

    // El motor nativo es el único que reproduce content:// con garantías:
    // si el usuario tiene el motor web, avisarle una sola vez.
    if (!this.isNativeAudio() && !this._deviceEngineWarned) {
      this._deviceEngineWarned = true;
      this.toast(this.t('device_needs_native'));
    }

    const msg = this.t('toast_device_imported').replace('X', String(newTracks.length));
    this.toast(dupCount > 0
      ? msg + ' · ' + this.t('toast_import_dupes_short').replace('X', String(dupCount))
      : msg);
    if (typeof this.saveSession === 'function') this.saveSession();
    if (typeof this.syncNativeQueue === 'function') this.syncNativeQueue();
  },

  /*  Añade a una lista canciones concretas del móvil (las marcadas en la
   *  hoja «Añadir pistas → Del móvil»). Las que ya están en la
   *  biblioteca se reutilizan —sin duplicar— y las nuevas se guardan como
   *  ficha con su content://, igual que un escaneo, pero solo las
   *  elegidas: nada de importar 3.000 canciones para meter cinco. */
  async addDeviceTracksToPlaylist(selectedIds, playlist) {
    const pl = playlist || this.playlists.find(p => p.id === this._pickPlaylistId);
    if (!pl || !selectedIds || !selectedIds.length) return;
    pl.trackIds = Array.isArray(pl.trackIds) ? pl.trackIds : [];
    const inList = new Set(pl.trackIds);

    // Índice de lo que ya hay, por id de MediaStore y por nombre+tamaño.
    const byDevice = new Map();
    const byKey = new Map();
    for (const t of this.tracks) {
      if (t.deviceId) byDevice.set(String(t.deviceId), t);
      if (t.fileName) byKey.set(this._dupKey(t.fileName, t.fileSize), t);
    }

    const items = this._pickDeviceItems || [];
    const nuevos = [];      // {track, item} que hay que guardar
    let repetidas = 0;
    let added = 0;

    for (const key of selectedIds) {
      const mediaId = String(key).replace(/^dev-/, '');
      const item = items.find(it => String(it.id) === mediaId);
      let track = byDevice.get(mediaId) || null;
      if (!track && item) {
        const ficha = DeviceLibrary.toTrack(item);
        const dup = ficha.fileName ? byKey.get(this._dupKey(ficha.fileName, ficha.fileSize)) : null;
        track = dup || ficha;
        if (!dup) {
          nuevos.push({ track: ficha, item: item });
          byDevice.set(mediaId, ficha);
          if (ficha.fileName) byKey.set(this._dupKey(ficha.fileName, ficha.fileSize), ficha);
        }
      }
      if (!track) { repetidas++; continue; }
      if (inList.has(track.id)) { repetidas++; continue; }
      inList.add(track.id);
      pl.trackIds.push(track.id);
      added++;
    }

    // Carátulas: una por álbum y con tope, como el escaneo completo.
    if (nuevos.length) {
      const albums = new Map();
      for (const { item } of nuevos) {
        if (item.albumId && !albums.has(String(item.albumId))) albums.set(String(item.albumId), item);
      }
      let done = 0;
      for (const [albumId, item] of albums) {
        if (done >= 8) break; // unas pocas: aquí prima la rapidez
        const art = DeviceLibrary.albumArt(albumId, item.id);
        if (art) {
          for (const entry of nuevos) {
            if (String(entry.item.albumId) === albumId) {
              entry.track.cover = art;
              entry.track.coverIsImage = true;
              entry.track.coverThumb = art;
              entry.track.coverThumbLg = art;
            }
          }
        }
        done++;
      }
      const pistas = nuevos.map(n => n.track);
      this.tracks.push(...pistas);
      try {
        if (typeof this.persistTracksBatch === 'function') await this.persistTracksBatch(pistas);
        else for (const t of pistas) await this.persistTrack(t);
      } catch (e) {
        console.warn('[Aurora] no se pudieron guardar las pistas del móvil:', e);
      }
      // A la cola, como cualquier alta (sin robar la canción actual).
      if (!this.queue.length) this.queue = this.tracks.map(t => t.id);
      else {
        for (const t of pistas) if (this.queue.indexOf(t.id) < 0) this.queue.push(t.id);
      }
    }

    if (typeof this._invalidatePlaylistCover === 'function') this._invalidatePlaylistCover(pl);
    try { await this.persistPlaylist(pl); } catch (e) {}

    try { this.renderPlaylists(); } catch (e) {}
    try { this.renderQueue(); } catch (e) {}
    try { if (typeof this.renderHome === 'function') this.renderHome(); } catch (e) {}
    try { if (typeof this.updateChrome === 'function') this.updateChrome(); } catch (e) {}
    if (this._editingPlaylistId === pl.id && typeof this.renderEditPlaylist === 'function') {
      this.renderEditPlaylist();
    }
    // Si esa lista es la que está sonando, la cola se entera sin cortar.
    if (this.playContext && this.playContext.type === 'playlist' && this.playContext.id === pl.id) {
      if (typeof this._syncQueueWithPlaylist === 'function') this._syncQueueWithPlaylist();
      if (typeof this.syncNativeQueue === 'function') this.syncNativeQueue();
    }
    if (!this.isNativeAudio() && !this._deviceEngineWarned) {
      this._deviceEngineWarned = true;
      this.toast(this.t('device_needs_native'));
    }
    let msg = this.t('toast_pick_added').replace('X', String(added));
    if (repetidas > 0) msg += ' · ' + this.t('toast_import_dupes_short').replace('X', String(repetidas));
    this.toast(msg);
    if (typeof this.saveSession === 'function') this.saveSession();
  },

  /* Respuesta del permiso (la llama MainActivity). */
  onDeviceAccess(granted) {
    if (!granted) {
      this._pendingDeviceScan = null;
      this._pendingPickDevice = false;
      this.toast(this.t('device_permission_denied'), 'danger');
      return;
    }
    // Venía de la hoja «Añadir pistas → Del móvil».
    if (this._pendingPickDevice) {
      this._pendingPickDevice = false;
      if (typeof this.loadPickDevice === 'function') this.loadPickDevice();
      return;
    }
    const target = this._pendingDeviceScan || null;
    this._pendingDeviceScan = null;
    this.scanDeviceLibrary(target);
  }
});

/* La app nativa avisa aquí tras el diálogo de permisos. */
window.AuroraDeviceAccess = function (granted) {
  try {
    if (window.App && typeof App.onDeviceAccess === 'function') {
      App.onDeviceAccess(!!granted);
    }
  } catch (e) {}
};
