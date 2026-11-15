/* Tests del módulo js/backup.js (crc, inflate, zip, round-trip, restore) */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const zlib = require('zlib');
const { randomBytes } = require('crypto');
const assert = require('assert');

const SRC = fs.readFileSync(path.join(__dirname, '..', 'assets', 'www', 'js', 'backup.js'), 'utf8');

/* ---------- mocks de navegador ---------- */
function makeLocalStorage() {
  const map = new Map();
  return {
    get length() { return map.size; },
    key(i) { return Array.from(map.keys())[i] ?? null; },
    getItem: k => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => { map.set(k, String(v)); },
    removeItem: k => { map.delete(k); },
    clear: () => map.clear(),
    _map: map,
  };
}

function makeStorage(seed) {
  const tracks = new Map();
  (seed && seed.tracks || []).forEach(t => tracks.set(t.id, t));
  let playlists = (seed && seed.playlists ? seed.playlists.slice() : []);
  let settings = Object.assign({}, seed && seed.settings);
  return {
    db: true,
    async open() {},
    async getAllTracks() { return Array.from(tracks.values()); },
    async getTrack(id) { return tracks.get(id) || null; },
    async putTrack(t) { tracks.set(t.id, t); },
    async clearTracks() { tracks.clear(); },
    async getAllPlaylists() { return playlists.slice(); },
    async putPlaylist(p) {
      const i = playlists.findIndex(x => x.id === p.id);
      if (i >= 0) playlists[i] = p; else playlists.push(p);
    },
    async clearPlaylists() { playlists = []; },
    async getAllSettings() { return Object.assign({}, settings); },
    async setSetting(k, v) { settings[k] = v; },
    async clearSettings() { settings = {}; },
    async getSetting(k) { return settings[k]; },
    _tracks: tracks,
    _playlists: () => playlists,
    _settings: () => settings,
  };
}

function loadApp({ storageSeed, localStorageSeed, stripDecompressionStream } = {}) {
  const localStorage = makeLocalStorage();
  Object.entries(localStorageSeed || {}).forEach(([k, v]) => localStorage.setItem(k, v));
  const storage = makeStorage(storageSeed);
  const sandbox = {
    console,
    setTimeout,
    clearTimeout,
    Promise,
    localStorage,
    navigator: { userAgent: 'node-test', hardwareConcurrency: 4 },
    location: { reload() {} },
    document: {
      getElementById: () => ({ textContent: '1.5.0' }),
      createElement: () => { throw new Error('no DOM en este test'); },
      body: { appendChild() {}, removeChild() {} },
    },
    Blob: globalThis.Blob,
    Response: globalThis.Response,
    DecompressionStream: (typeof stripDecompressionStream !== 'undefined' && stripDecompressionStream) ? undefined : globalThis.DecompressionStream,
    TextDecoder, TextEncoder,
  };
  sandbox.window = sandbox;
  sandbox.window.AuroraStorage = storage;
  sandbox.self = sandbox;
  vm.createContext(sandbox);
  const App = {};
  App.t = (k) => k;
  App.toast = () => {};
  App.showConfirm = async () => true;
  sandbox.App = App;
  vm.runInContext(SRC, sandbox, { filename: 'backup.js' });
  return { sandbox, App, storage, localStorage };
}

const results = [];
function check(name, fn) {
  try {
    const r = fn();
    if (r && typeof r.then === 'function') {
      return r.then(() => { results.push(['ok', name]); }, (err) => { results.push(['FAIL', name + ' :: ' + (err && err.stack || err)]); });
    }
    results.push(['ok', name]);
  } catch (err) {
    results.push(['FAIL', name + ' :: ' + (err && err.stack || err)]);
  }
  return Promise.resolve();
}


(async () => {
  const { sandbox } = loadApp();
  const B = sandbox.window.AuroraBackup;

  /* CRC-32 */
  await check('crc32 vector estándar', () => {
    const buf = new TextEncoder().encode('123456789');
    assert.strictEqual(B.crc32(buf), 0xCBF43926, 'vector CRC');
    assert.strictEqual(B.crc32(new Uint8Array(0)), 0);
  });

  /* Inflate vs zlib */
  const samples = [
    ['vacío', Buffer.alloc(0)],
    ['pequeño', Buffer.from('hola aurora, copia de respaldo')],
    ['repetitivo 256 KB', Buffer.from('abcabcabcabcabc123123123ffff0000'.repeat(16384))],
    ['texto 1 MB', Buffer.from('El rápido zorro marrón salta sobre el perro perezoso. 0123456789\n'.repeat(18000))],
    ['aleatorio 1 MB', randomBytes(1024 * 1024)],
    ['binario con ceros', Buffer.concat([Buffer.alloc(50000, 0), randomBytes(20000), Buffer.alloc(50000, 0)])],
  ];
  for (const [name, raw] of samples) {
    await check('inflate raw: ' + name, async () => {
      const comp = zlib.deflateRawSync(raw, { level: 9 });
      const out = B.inflateRaw(new Uint8Array(comp));
      assert.deepStrictEqual(Buffer.from(out), raw);
    });
    await check('inflate raw nivel 1: ' + name, async () => {
      const comp = zlib.deflateRawSync(raw, { level: 1 });
      const out = B.inflateRaw(new Uint8Array(comp));
      assert.deepStrictEqual(Buffer.from(out), raw);
    });
  }

  /* ZIP propio (STORED) → lectura propia */
  await check('zip STORED round-trip', async () => {
    const files = [
      { name: 'backup.json', blob: new Blob(['{"format":"aurora-migration-backup","formatVersion":1}']) },
      { name: 'audio/000001.mp3', blob: new Blob([randomBytes(3 * 1024 * 1024)]) },
      { name: 'audio/000002.flac', blob: new Blob([randomBytes(1024 * 1024)]) },
    ];
    const zip = await B.buildZip(files);
    const parsed = await B.readZip(zip);
    assert.strictEqual(parsed.entries.length, 3);
    for (const f of files) {
      const entry = parsed.byName.get(f.name);
      assert.ok(entry, 'falta ' + f.name);
      assert.strictEqual(entry.method, 0);
      const bytes = await B.readEntry(zip, entry);
      const orig = new Uint8Array(await f.blob.arrayBuffer());
      assert.deepStrictEqual(Buffer.from(bytes), Buffer.from(orig), 'bytes distintos en ' + f.name);
    }
  });

  /* ZIP con data descriptor (bit 3, estilo Java ZipOutputStream) */
  await check('zip con data descriptor (bit 3) se lee', async () => {
    // Python lo genera con un stream no buscable; aquí construimos a mano
    // la misma disposición para no depender de python en el test.
    const name = 'audio/000007.bin';
    const payload = zlib.deflateRawSync(randomBytes(700 * 1024));
    const crc = B.crc32(new Uint8Array(zlib.inflateRawSync(payload)));
    const nameB = Buffer.from(name, 'ascii');
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0x0008, 6); // bit 3: tamaños en data descriptor
    local.writeUInt16LE(8, 8);      // deflate
    /* time/date */ local.writeUInt16LE(0, 10); local.writeUInt16LE(33, 12);
    local.writeUInt32LE(0, 14);     // crc va en el descriptor
    local.writeUInt32LE(0, 18);     // csize
    local.writeUInt32LE(0, 22);     // usize
    local.writeUInt16LE(nameB.length, 26);
    local.writeUInt16LE(0, 28);
    const descriptor = Buffer.alloc(16);
    descriptor.writeUInt32LE(0x08074b50, 0);
    descriptor.writeUInt32LE(crc, 4);
    descriptor.writeUInt32LE(payload.length, 8);
    descriptor.writeUInt32LE(zlib.inflateRawSync(payload).length, 12);
    const centralOffset = local.length + nameB.length + payload.length + descriptor.length;
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4); central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0x0008, 8);
    central.writeUInt16LE(8, 10);
    central.writeUInt16LE(0, 12); central.writeUInt16LE(33, 14);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(payload.length, 20);
    central.writeUInt32LE(zlib.inflateRawSync(payload).length, 24);
    central.writeUInt16LE(nameB.length, 28);
    central.writeUInt16LE(0, 30); central.writeUInt16LE(0, 32);
    central.writeUInt16LE(0, 34); central.writeUInt16LE(0, 36);
    central.writeUInt32LE(0, 38); central.writeUInt32LE(0, 42);
    const cdSize = central.length + nameB.length;
    const eocd = Buffer.alloc(22);
    eocd.writeUInt32LE(0x06054b50, 0);
    eocd.writeUInt16LE(0, 4); eocd.writeUInt16LE(0, 6);
    eocd.writeUInt16LE(1, 8); eocd.writeUInt16LE(1, 10);
    eocd.writeUInt32LE(cdSize, 12); eocd.writeUInt32LE(centralOffset, 16);
    eocd.writeUInt16LE(0, 20);
    const zipBuf = Buffer.concat([local, nameB, payload, descriptor, central, nameB, eocd]);
    const blob = new Blob([zipBuf]);
    const parsed = await B.readZip(blob);
    const entry = parsed.byName.get(name);
    assert.ok(entry, 'entrada ausente');
    const bytes = await B.readEntry(blob, entry);
    assert.deepStrictEqual(Buffer.from(bytes), zlib.inflateRawSync(payload));
  });

  /* ZIP deflate normal (sin descriptor), como escribe Python zipfile */
  await check('zip deflate estándar se lee', async () => {
    const payload = zlib.deflateRawSync(Buffer.from('backup de prueba con contenido repetitivo repetido repetido'));
    const name = 'backup.json';
    const nameB = Buffer.from(name, 'ascii');
    const crc = B.crc32(new Uint8Array(Buffer.from('backup de prueba con contenido repetitivo repetido repetido')));
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4); local.writeUInt16LE(0, 6); local.writeUInt16LE(8, 8);
    local.writeUInt16LE(0, 10); local.writeUInt16LE(33, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(payload.length, 18);
    local.writeUInt32LE(Buffer.from('backup de prueba con contenido repetitivo repetido repetido').length, 22);
    local.writeUInt16LE(nameB.length, 26); local.writeUInt16LE(0, 28);
    const centralOffset = local.length + nameB.length + payload.length;
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4); central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0, 8); central.writeUInt16LE(8, 10);
    central.writeUInt16LE(0, 12); central.writeUInt16LE(33, 14);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(payload.length, 20);
    central.writeUInt32LE(Buffer.from('backup de prueba con contenido repetitivo repetido repetido').length, 24);
    central.writeUInt16LE(nameB.length, 28);
    central.writeUInt16LE(0, 30); central.writeUInt16LE(0, 32);
    central.writeUInt16LE(0, 34); central.writeUInt16LE(0, 36);
    central.writeUInt32LE(0, 38); central.writeUInt32LE(centralOffset - 0, 42);
    // centralOffset es absoluto desde el inicio del zip:
    central.writeUInt32LE(0, 42); // reescrito abajo con valor correcto
    central.writeUInt32LE(local.length + nameB.length + payload.length - (local.length + nameB.length + payload.length), 42);
    // desplazamiento local = 0 (es el primer entry)
    central.writeUInt32LE(0, 42);
    const eocd = Buffer.alloc(22);
    eocd.writeUInt32LE(0x06054b50, 0);
    eocd.writeUInt16LE(0, 4); eocd.writeUInt16LE(0, 6);
    eocd.writeUInt16LE(1, 8); eocd.writeUInt16LE(1, 10);
    eocd.writeUInt32LE(central.length + nameB.length, 12);
    eocd.writeUInt32LE(local.length + nameB.length + payload.length, 16);
    eocd.writeUInt16LE(0, 20);
    const zipBuf = Buffer.concat([local, nameB, payload, central, nameB, eocd]);
    const blob = new Blob([zipBuf]);
    const parsed = await B.readZip(blob);
    const entry = parsed.byName.get(name);
    const bytes = await B.readEntry(blob, entry);
    assert.strictEqual(Buffer.from(bytes).toString('utf8'), 'backup de prueba con contenido repetitivo repetido repetido');
  });

  /* Corrupción: CRC que no cuadra debe fallar ANTES de tocar nada */
  await check('CRC corrupto se detecta', async () => {
    const files = [{ name: 'audio/000001.mp3', blob: new Blob([randomBytes(64 * 1024)]) }];
    const zip = await B.buildZip(files);
    const buf = Buffer.from(await zip.arrayBuffer());
    // Corromper un byte del payload (offset 30 + nombre).
    buf[31 + 'audio/000001.mp3'.length + 100] ^= 0xFF;
    const parsed = await B.readZip(new Blob([buf]));
    const entry = parsed.byName.get('audio/000001.mp3');
    await assert.rejects(() => B.readEntry(new Blob([buf]), entry));
  });

  /* Round-trip completo de restauración (replace) */
  await check('export → restore round-trip (replace)', async () => {
    const trackBlob = new Blob([randomBytes(512 * 1024)], { type: 'audio/mpeg' });
    const seed = {
      tracks: [
        { id: 't1', title: 'Canción uno', artist: 'Artista', album: 'Álbum', duration: 201, fileName: 'uno.mp3', fileBlob: trackBlob, addedAt: 111, _tagsChecked: true },
        { id: 'dev-99', title: 'Del móvil', artist: 'App', duration: 90, fileName: 'dev.flac', deviceUri: 'content://media/external/audio/media/99', deviceId: 99, _device: true, addedAt: 112 },
      ],
      playlists: [{ id: 'pl1', name: 'Mi lista', trackIds: ['t1', 'dev-99'] }],
      settings: { favorites: ['t1'], 'local:theme': 'dark', volume: 0.4, rated: { t1: 5 } },
    };
    const first = loadApp({
      storageSeed: seed,
      localStorageSeed: { aurora_volume: '0.8', otra_clave: 'no-tocar' },
    });
    // Export manual: collect + buildZip (la parte Android usa Java; aquí se prueba el JS)
    const data = await first.sandbox.window.AuroraBackup.collect();
    const manifest = data.manifest;
    assert.strictEqual(manifest.tracks.length, 2);
    const t1 = manifest.tracks.find(t => t.id === 't1');
    const dev = manifest.tracks.find(t => t.id === 'dev-99');
    assert.ok(t1.backupAudio, 't1 debe llevar audio');
    assert.strictEqual(dev.backupAudio, null, 'la pista del móvil no debe llevar audio');
    assert.strictEqual(t1._device, undefined);
    assert.strictEqual(dev._device, true, 'el marcador _device debe viajar');
    assert.strictEqual(t1.fileBlob, undefined);
    assert.strictEqual(t1.src, undefined);

    const entries = [{ name: 'backup.json', blob: new Blob([JSON.stringify(manifest)]) }];
    for (const item of data.audioJobs) if (item.blob) entries.push({ name: item.fileEntry, blob: item.blob });
    const zipBlob = await first.sandbox.window.AuroraBackup.buildZip(entries);

    // Restaurar en "otra versión" (stores vacíos)
    const second = loadApp({
      storageSeed: { tracks: [{ id: 'viejo', title: 'Viejo', fileName: 'viejo.mp3' }], playlists: [{ id: 'viejoPl', name: 'Vieja' }], settings: { 'local:borrar': 1, quedan: 'no' } },
      localStorageSeed: { aurora_viejo: '1', no_aurora: 'se queda' },
    });
    const plan = await second.sandbox.window.AuroraBackup.planRestore(zipBlob);
    assert.strictEqual(plan.trackCount, 2);
    assert.strictEqual(plan.playlistCount, 1);
    assert.strictEqual(plan.missingAudio, 1, 'la pista del móvil viaja sin audio');
    const result = await second.sandbox.window.AuroraBackup.applyRestore(zipBlob, plan);
    assert.strictEqual(result.tracks, 2);
    const tracks = await second.storage.getAllTracks();
    const ids = tracks.map(t => t.id).sort();
    assert.strictEqual(JSON.stringify(ids), JSON.stringify(['dev-99', 't1']));
    const restoredT1 = tracks.find(t => t.id === 't1');
    assert.ok(restoredT1.fileBlob instanceof Blob, 't1 debe recuperar su blob de audio');
    const originalBytes = new Uint8Array(await trackBlob.arrayBuffer());
    const restoredBytes = new Uint8Array(await restoredT1.fileBlob.arrayBuffer());
    assert.deepStrictEqual(Buffer.from(restoredBytes), Buffer.from(originalBytes), 'el audio restaurado debe ser idéntico');
    assert.strictEqual(restoredT1.src, undefined, 'no debe quedar src de sesión');
    const restoredDev = tracks.find(t => t.id === 'dev-99');
    assert.strictEqual(restoredDev.fileBlob, undefined);
    assert.strictEqual(restoredDev.deviceUri, 'content://media/external/audio/media/99');
    const pls = await second.storage.getAllPlaylists();
    assert.strictEqual(pls.length, 1);
    assert.strictEqual(JSON.stringify(pls[0].trackIds), JSON.stringify(['t1', 'dev-99']));
    const settings = await second.storage.getAllSettings();
    assert.strictEqual(JSON.stringify(settings.favorites), JSON.stringify(['t1']));
    assert.strictEqual(JSON.stringify(settings.rated), JSON.stringify({ t1: 5 }));
    assert.strictEqual(settings['local:theme'], undefined, 'las claves «local:» nativas no deben entrar en los ajustes web');
    assert.strictEqual(settings.quedan, undefined, 'los ajustes viejos se borran (replace)');
    assert.strictEqual(second.localStorage.getItem('aurora_volume'), '0.8');
    assert.strictEqual(second.localStorage.getItem('aurora_viejo'), null, 'las claves aurora_* viejas se borran');
    assert.strictEqual(second.localStorage.getItem('no_aurora'), 'se queda');
  });

  /* Respaldo que no lo es */
  await check('un ZIP sin backup.json se rechaza', async () => {
    const zipBlob = await B.buildZip([{ name: 'otra/cosa.txt', blob: new Blob(['x']) }]);
    await assert.rejects(() => sandbox.window.AuroraBackup.planRestore(zipBlob));
  });


  /* Vía inflate puro (sin DecompressionStream): muestras y deflate artesanal */
  const Bpure = loadApp({ stripDecompressionStream: true }).sandbox.window.AuroraBackup;
  const text = Buffer.from('El rápido zorro marrón salta sobre el perro perezoso. 0123456789\n'.repeat(18000));
  await check('inflate puro: texto 1 MB', async () => {
    const comp = zlib.deflateRawSync(text, { level: 6 });
    assert.deepStrictEqual(Buffer.from(Bpure.inflateRaw(new Uint8Array(comp))), text);
  });
  await check('nivel 5: aleatorio', async () => {
    const raw = randomBytes(512 * 1024);
    const comp = zlib.deflateRawSync(raw, { level: 5 });
    assert.deepStrictEqual(Buffer.from(Bpure.inflateRaw(new Uint8Array(comp))), raw);
  });
  /* construir el mismo zip deflate sin descriptor pero leído por inflate puro */
  await check('zip deflate se lee con inflate puro', async () => {
    const raw = Buffer.concat([randomBytes(200 * 1024), Buffer.from('aurora\n'.repeat(10000))]);
    const name = 'datos.bin';
    const nameB = Buffer.from(name, 'ascii');
    const payload = zlib.deflateRawSync(raw);
    const crcB = Bpure.crc32(new Uint8Array(raw));
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4); local.writeUInt16LE(0, 6); local.writeUInt16LE(8, 8);
    local.writeUInt16LE(0, 10); local.writeUInt16LE(33, 12);
    local.writeUInt32LE(crcB, 14); local.writeUInt32LE(payload.length, 18); local.writeUInt32LE(raw.length, 22);
    local.writeUInt16LE(nameB.length, 26); local.writeUInt16LE(0, 28);
    const centralOffset = local.length + nameB.length + payload.length;
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4); central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0, 8); central.writeUInt16LE(8, 10);
    central.writeUInt16LE(0, 12); central.writeUInt16LE(33, 14);
    central.writeUInt32LE(crcB, 16);
    central.writeUInt32LE(payload.length, 20); central.writeUInt32LE(raw.length, 24);
    central.writeUInt16LE(nameB.length, 28);
    central.writeUInt16LE(0, 30); central.writeUInt16LE(0, 32);
    central.writeUInt16LE(0, 34); central.writeUInt16LE(0, 36);
    central.writeUInt32LE(0, 38); central.writeUInt32LE(0, 42);
    const eocd = Buffer.alloc(22);
    eocd.writeUInt32LE(0x06054b50, 0);
    eocd.writeUInt16LE(0, 4); eocd.writeUInt16LE(0, 6);
    eocd.writeUInt16LE(1, 8); eocd.writeUInt16LE(1, 10);
    eocd.writeUInt32LE(central.length + nameB.length, 12);
    eocd.writeUInt32LE(centralOffset, 16);
    eocd.writeUInt16LE(0, 20);
    const zipBlob = new Blob([Buffer.concat([local, nameB, payload, central, nameB, eocd])]);
    const parsed = await Bpure.readZip(zipBlob);
    const entry = parsed.byName.get(name);
    const bytes = await Bpure.readEntry(zipBlob, entry);
    assert.deepStrictEqual(Buffer.from(bytes), raw);
  });

  /* Interoperabilidad: ZIP generado por una herramienta real (Python zipfile) */
  await check('zip real de Python zipfile se importa', async () => {
    const { execFileSync } = require('child_process');
    const os = require('os'), path2 = require('path'), fs = require('fs');
    const tmp = path2.join(os.tmpdir(), 'aurora-test-real-backup.zip');
    const py = `
import json, zipfile, sys
manifest = {
  "format": "aurora-migration-backup", "formatVersion": 1,
  "createdAt": "2026-11-15T20:00:00.000Z", "appVersion": "1.5.0",
  "tracks": [
    {"id": "t1", "title": "Canción €ñ", "artist": "Artista", "duration": 123,
     "fileName": "cancion.mp3", "backupAudio": "audio/000001.mp3", "_tagsChecked": True},
    {"id": "dev-1", "title": "Móvil", "artist": "App", "duration": 44,
     "fileName": "mov.flac", "deviceUri": "content://media/external/audio/media/1",
     "deviceId": 1, "_device": True, "backupAudio": None}
  ],
  "playlists": [{"id": "pl1", "name": "Favoritos", "trackIds": ["t1", "dev-1"]}],
  "settings": {"volume": 0.7, "equalizer": "rock"},
  "localStorage": {"aurora_theme": "amoled"},
  "audioEntries": [{"trackId": "t1", "path": "audio/000001.mp3", "size": 200000}]
}
audio = bytes(range(256)) * 782   # 200192 bytes de audio pseudo-variado
with zipfile.ZipFile(sys.argv[1], "w", zipfile.ZIP_DEFLATED, compresslevel=9) as z:
    z.writestr("backup.json", json.dumps(manifest, ensure_ascii=False))
    z.writestr("audio/000001.mp3", audio)
`;
    try { execFileSync('python3', ['-c', py, tmp], { stdio: 'pipe' }); }
    catch (e) { console.log('  (skip: python3 no disponible para la prueba de interoperabilidad)'); return; }
    const buf = fs.readFileSync(tmp);
    fs.unlinkSync(tmp);
    const { sandbox: pySandbox } = loadApp();
    const B2 = pySandbox.window.AuroraBackup;
    const plan = await B2.planRestore(new Blob([buf]));
    assert.strictEqual(plan.trackCount, 2);
    assert.strictEqual(plan.playlistCount, 1);
    assert.strictEqual(plan.audioCount, 1);
    assert.strictEqual(plan.tracks.find(t => t.id === 't1').title, 'Canción €ñ');
    assert.strictEqual(plan.tracks.find(t => t.id === 'dev-1').deviceUri, 'content://media/external/audio/media/1');
    assert.strictEqual(plan.localStorage.aurora_theme, 'amoled');
  });

  /* Resumen */
  const failures = results.filter(r => r[0] === 'FAIL');
  for (const [status, name] of results) {
    if (status === 'FAIL') console.log('FALLO  ' + name);
    else console.log('ok     ' + name);
  }
  console.log('\n' + (results.length - failures.length) + '/' + results.length + ' tests superados');
  process.exit(failures.length ? 1 : 0);
})().catch(err => {
  console.error('Error fatal en tests:', err);
  process.exit(1);
});
