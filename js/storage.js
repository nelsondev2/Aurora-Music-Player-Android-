/* =====================================================================
 *  storage.js — Persistencia en IndexedDB
 *  Reproductor de música profesional · mobile-first
 *
 *  Guarda:
 *    - store "tracks": metadatos + objectURL del blob de audio
 *    - store "playlists": listas del usuario
 *    - store "settings": favoritos, volumen, etc.
 *
 *  Los blobs de audio se almacenan como File/Blob para crear
 *  objectURLs que el <audio> pueda reproducir sin red.
 * ===================================================================== */

/* eslint-disable no-unused-vars */
(function () {
  'use strict';

  const DB_NAME = 'aurora-db';
  const DB_VERSION = 1;
  const STORE_TRACKS = 'tracks';
  const STORE_PLAYLISTS = 'playlists';
  const STORE_SETTINGS = 'settings';

  const Storage = {
    db: null,

    /* ---------- Abrir / inicializar la BD ---------- */
    open() {
      if (this.db) return Promise.resolve(this.db);
      // Una única promesa de apertura: dos llamadas concurrentes antes de
      // que onsuccess dispare abrirían dos conexiones y la segunda quedaría
      // huérfana (fuga y bloqueo en futuras migraciones de versión).
      if (this._openPromise) return this._openPromise;
      this._openPromise = new Promise((resolve, reject) => {
        let req;
        try {
          req = indexedDB.open(DB_NAME, DB_VERSION);
        } catch (e) {
          // IndexedDB deshabilitado (modo privado antiguo, política del
          // navegador): la promesa debe rechazar, no colgarse.
          this._openPromise = null;
          reject(e);
          return;
        }
        req.onerror = () => { this._openPromise = null; reject(req.error); };
        // Otra pestaña tiene la versión anterior abierta: el navegador
        // espera. No se rechaza (perderíamos datos al reintentar), pero
        // se deja rastro para diagnosticar.
        req.onblocked = () => {
          console.warn('AuroraStorage: apertura bloqueada por otra pestaña');
        };
        req.onsuccess = () => {
          const db = req.result;
          this.db = db;
          this._openPromise = null;
          // Si el navegador cierra la conexión (p. ej. al limpiar datos),
          // no se debe seguir usando un db muerto: se fuerza reapertura.
          db.onclose = () => { if (this.db === db) this.db = null; };
          // Otra pestaña quiere migrar: cerrar aquí evita dejarla bloqueada.
          db.onversionchange = () => {
            try { db.close(); } catch (e) {}
            if (this.db === db) this.db = null;
          };
          resolve(db);
        };
        req.onupgradeneeded = (e) => {
          const db = e.target.result;
          if (!db.objectStoreNames.contains(STORE_TRACKS)) {
            db.createObjectStore(STORE_TRACKS, { keyPath: 'id' });
          }
          if (!db.objectStoreNames.contains(STORE_PLAYLISTS)) {
            db.createObjectStore(STORE_PLAYLISTS, { keyPath: 'id' });
          }
          if (!db.objectStoreNames.contains(STORE_SETTINGS)) {
            db.createObjectStore(STORE_SETTINGS);
          }
        };
      });
      return this._openPromise;
    },

    /* ---------- Operaciones genéricas ---------- */
    _tx(store, mode) {
      const db = this.db;
      // Antes se asumía que db existía: si la conexión se cerraba (otra
      // pestaña, el navegador o un test), .transaction lanzaba un
      // TypeError críptico. Mejor fallar con un mensaje accionable.
      if (!db) throw new Error('AuroraStorage: la base de datos no está abierta');
      if (!db.objectStoreNames.contains(store)) {
        throw new Error('AuroraStorage: almacén desconocido «' + store + '»');
      }
      return db.transaction(store, mode).objectStore(store);
    },
    _req(reqFn) {
      return new Promise((resolve, reject) => {
        reqFn.onsuccess = () => resolve(reqFn.result);
        reqFn.onerror = () => reject(reqFn.error);
      });
    },
    /* Ejecuta una operación reintentando UNA vez si la conexión murió
     * entre el await open() y la transacción (InvalidStateError). */
    async _run(store, mode, fn) {
      for (let attempt = 0; attempt < 2; attempt++) {
        await this.open();
        try {
          return await this._req(fn(this._tx(store, mode)));
        } catch (err) {
          const stale = err && (err.name === 'InvalidStateError' ||
            /not open|closed/i.test(String(err.message || '')));
          if (attempt === 0 && stale) {
            this.db = null;
            continue;
          }
          throw err;
        }
      }
      throw new Error('AuroraStorage: operación imposible: ' + store);
    },

    /* ---------- Tracks ---------- */
    async putTrack(track) {
      return this._run(STORE_TRACKS, 'readwrite', (os) => os.put(track));
    },
    async getTrack(id) {
      return this._run(STORE_TRACKS, 'readonly', (os) => os.get(id));
    },
    async getAllTracks() {
      return this._run(STORE_TRACKS, 'readonly', (os) => os.getAll());
    },
    async deleteTrack(id) {
      return this._run(STORE_TRACKS, 'readwrite', (os) => os.delete(id));
    },
    async clearTracks() {
      return this._run(STORE_TRACKS, 'readwrite', (os) => os.clear());
    },

    /* ---------- Playlists ---------- */
    async putPlaylist(pl) {
      return this._run(STORE_PLAYLISTS, 'readwrite', (os) => os.put(pl));
    },
    async getAllPlaylists() {
      return this._run(STORE_PLAYLISTS, 'readonly', (os) => os.getAll());
    },
    async deletePlaylist(id) {
      return this._run(STORE_PLAYLISTS, 'readwrite', (os) => os.delete(id));
    },
    async clearPlaylists() {
      return this._run(STORE_PLAYLISTS, 'readwrite', (os) => os.clear());
    },

    /* ---------- Settings (clave/valor) ---------- */
    async getSetting(key) {
      return this._run(STORE_SETTINGS, 'readonly', (os) => os.get(key));
    },
    async setSetting(key, value) {
      return this._run(STORE_SETTINGS, 'readwrite', (os) => os.put(value, key));
    }
  };

  window.AuroraStorage = Storage;
})();
