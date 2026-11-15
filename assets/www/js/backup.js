/* =====================================================================
 *  js/backup.js — Aurora Music Player
 *  Copia de respaldo: crear, enviar al chat y restaurar.
 *
 *  El respaldo es un ZIP con esta disposición (formato
 *  «aurora-migration-backup», versión 1, compatible con las futuras y
 *  pasadas versiones de Aurora):
 *
 *    backup.json   manifiesto: formato, versión, pistas, listas, ajustes
 *                  y claves aurora_* de localStorage
 *    audio/000001.mp3 …   el audio de cada pista que la app pueda leer
 *
 *  Las pistas que Aurora no guarda dentro (las del móvil vía MediaStore)
 *  viajan solo con su ficha y su content://: el respaldo restaura su
 *  enlace si el archivo sigue donde estaba.
 *
 *  Tres rutas según dónde corre la app:
 *    · Android (window.AuroraAndroid): el ZIP se construye en Java, por
 *      trozos, y se comparte con el selector del sistema (ahí se puede
 *      elegir Delta Chat para mandarlo al chat).
 *    · Delta Chat (window.webxdc): el ZIP se construye en JS (STORED,
 *      sin comprimir: el audio ya está comprimido) y se envía con
 *      webxdc.sendToChat; se restaura con webxdc.importFiles.
 *    · Navegador: el ZIP se descarga; se restaura con el selector clásico.
 *
 *  Restaurar REEMPLAZA la biblioteca actual (listas, ajustes, fichas y
 *  audio). Por seguridad se valida TODO antes de tocar nada: se leen el
 *  manifiesto y cada entrada de audio y se verifica su CRC; solo si el
 *  respaldo está íntegro se borra lo que hay y se escribe lo nuevo.
 * ===================================================================== */

'use strict';

/* =====================================================================
 *  CRC-32 (tabla generada una vez). Necesario para escribir y verificar
 *  ZIP: cada entrada lleva su CRC en cabecera y en el directorio central.
 * ===================================================================== */
const AuroraCrcTable = (function () {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
    }
    t[n] = c >>> 0;
  }
  return t;
})();

/* Registro CRC en marcha: permite encadenar trozos del mismo archivo. */
function auroraCrcRegister(u8, crc) {
  for (let i = 0; i < u8.length; i++) {
    crc = AuroraCrcTable[(crc ^ u8[i]) & 0xFF] ^ (crc >>> 8);
  }
  return crc >>> 0;
}

function auroraCrc32(u8) {
  return (auroraCrcRegister(u8, 0xFFFFFFFF) ^ 0xFFFFFFFF) >>> 0;
}

/* CRC de un Blob leyéndolo por trozos (no se carga entero en memoria). */
async function auroraCrc32Blob(blob, onProgress) {
  const CHUNK = 4 * 1024 * 1024;
  let crc = 0xFFFFFFFF;
  for (let offset = 0; offset < blob.size; offset += CHUNK) {
    const end = Math.min(offset + CHUNK, blob.size);
    const buf = new Uint8Array(await blob.slice(offset, end).arrayBuffer());
    crc = auroraCrcRegister(buf, crc);
    if (onProgress) onProgress(end, blob.size);
    if (offset && offset % (CHUNK * 4) === 0) {
      await new Promise(resolve => setTimeout(resolve, 0));
    }
  }
  return (crc ^ 0xFFFFFFFF) >>> 0;
}

/* UTF-8 con reserva para WebViews antiguos sin TextDecoder. */
function auroraUtf8Decode(u8) {
  if (typeof TextDecoder !== 'undefined') return new TextDecoder('utf-8').decode(u8);
  let out = '';
  let i = 0;
  while (i < u8.length) {
    const b1 = u8[i++];
    if (b1 < 0x80) { out += String.fromCharCode(b1); continue; }
    let code = 0;
    let extra = 0;
    if (b1 >= 0xF0) { code = b1 & 0x07; extra = 3; }
    else if (b1 >= 0xE0) { code = b1 & 0x0F; extra = 2; }
    else if (b1 >= 0xC2) { code = b1 & 0x1F; extra = 1; }
    else { out += '�'; continue; }
    for (let k = 0; k < extra && i < u8.length; k++) code = (code << 6) | (u8[i++] & 0x3F);
    if (code > 0xFFFF) {
      code -= 0x10000;
      out += String.fromCharCode(0xD800 + (code >> 10), 0xDC00 + (code & 0x3FF));
    } else {
      out += String.fromCharCode(code);
    }
  }
  return out;
}

function auroraAsciiBytes(name) {
  // Los nombres los genera la app (aurora-backup.zip, backup.json,
  // audio/NNNNNN.ext): todos ASCII. Se valida por si acaso.
  const out = new Uint8Array(name.length);
  for (let i = 0; i < name.length; i++) {
    const c = name.charCodeAt(i);
    if (c > 0x7F) throw new Error('Nombre de entrada no ASCII: ' + name);
    out[i] = c;
  }
  return out;
}

/* MIME por extensión (para que el <audio> y el motor nativo enseñen el
 * tipo correcto al releer el blob restaurado). */
const AURORA_MIME_BY_EXT = {
  mp3: 'audio/mpeg', m4a: 'audio/mp4', m4b: 'audio/mp4', aac: 'audio/aac',
  flac: 'audio/flac', wav: 'audio/wav', ogg: 'audio/ogg', opus: 'audio/opus',
  webm: 'audio/webm', wma: 'audio/x-ms-wma', amr: 'audio/amr', aiff: 'audio/aiff'
};

function auroraExtOf(name) {
  const m = /\.([a-z0-9]{1,8})$/i.exec(String(name || ''));
  return m ? m[1].toLowerCase() : 'audio';
}

function auroraMimeOf(name) {
  return AURORA_MIME_BY_EXT[auroraExtOf(name)] || 'application/octet-stream';
}

/* Ruta de entrada segura: sin separadores de unidad, «..» ni controles. */
function auroraSafeEntryPath(path) {
  if (!path || path.length === 0 || path.length > 512) return false;
  if (path.charAt(0) === '/' || path.indexOf('\\') >= 0 || path.indexOf(':') >= 0) return false;
  const parts = path.split('/');
  for (let i = 0; i < parts.length; i++) {
    const part = parts[i];
    if (part.length === 0 || part === '.' || part === '..' || !/^[A-Za-z0-9._-]+$/.test(part)) return false;
  }
  return true;
}

/* =====================================================================
 *  DEFLATE (RFC 1951) en JS puro, con reserva para DecompressionStream.
 *  Los respaldos creados por Aurora en Java usan deflate; los WebViews
 *  antiguos no tienen DecompressionStream, así que el inflado propio es
 *  la garantía de que un respaldo se restaura en cualquier versión.
 * ===================================================================== */
const AuroraInflate = (function () {
  const MAXBITS = 15;
  const CODE_LEN_ORDER = [16, 17, 18, 0, 8, 7, 9, 6, 10, 5, 11, 4, 12, 3, 13, 2, 14, 1, 15];
  const LENGTH_BASE = [3, 4, 5, 6, 7, 8, 9, 10, 11, 13, 15, 17, 19, 23, 27, 31,
    35, 43, 51, 59, 67, 83, 99, 115, 131, 163, 195, 227, 258];
  const LENGTH_EXTRA = [0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 2, 2, 2, 2,
    3, 3, 3, 3, 4, 4, 4, 4, 5, 5, 5, 5, 0];
  const DIST_BASE = [1, 2, 3, 4, 5, 7, 9, 13, 17, 25, 33, 49, 65, 97, 129, 193,
    257, 385, 513, 769, 1025, 1537, 2049, 3073, 4097, 6145, 8193, 12289, 16385, 24577];
  const DIST_EXTRA = [0, 0, 0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 6,
    7, 7, 8, 8, 9, 9, 10, 10, 11, 11, 12, 12, 13, 13];

  function buildTable(lengths) {
    const counts = new Uint16Array(MAXBITS + 1);
    let total = 0;
    for (let i = 0; i < lengths.length; i++) {
      const l = lengths[i];
      if (l > MAXBITS) throw new Error('Deflate: código demasiado largo');
      if (l) { counts[l]++; total++; }
    }
    if (total === 0) return { counts, offs: new Uint16Array(MAXBITS + 1), symbols: new Uint16Array(0) };
    // Comprobación de sobre-suscripción e incompletitud (las tablas
    // incompletas solo se toleran cuando no puede haber códigos, que es
    // el «un árbol de ráfaga vacío» que deflate usa para "sin distancias").
    let left = 1;
    for (let len = 1; len <= MAXBITS; len++) {
      left <<= 1;
      left -= counts[len];
      if (left < 0) throw new Error('Deflate: tabla de Huffman sobre-suscrita');
    }
    if (left > 0 && total > 1) throw new Error('Deflate: tabla de Huffman incompleta');
    const offs = new Uint16Array(MAXBITS + 1);
    let off = 0;
    for (let len = 1; len <= MAXBITS; len++) { offs[len] = off; off += counts[len]; }
    const symbols = new Uint16Array(total);
    const cursor = Uint16Array.from(offs);
    for (let i = 0; i < lengths.length; i++) {
      const l = lengths[i];
      if (l) symbols[cursor[l]++] = i;
    }
    return { counts, offs, symbols };
  }

  const FIXED_LIT_LENGTHS = (function () {
    const a = new Uint8Array(288);
    for (let i = 0; i < 144; i++) a[i] = 8;
    for (let i = 144; i < 256; i++) a[i] = 9;
    for (let i = 256; i < 280; i++) a[i] = 7;
    for (let i = 280; i < 288; i++) a[i] = 8;
    return a;
  })();
  const FIXED_DIST_LENGTHS = new Uint8Array(32).fill(5);
  const FIXED_LIT_TABLE = buildTable(FIXED_LIT_LENGTHS);
  const FIXED_DIST_TABLE = buildTable(FIXED_DIST_LENGTHS);

  function inflate(u8) {
    let pos = 0;
    let bitBuf = 0;
    let bitCnt = 0;
    const chunks = [];
    let totalOut = 0;
    // Ventana circular de 32 KB para las referencias hacia atrás.
    const window_ = new Uint8Array(32768);
    let winPos = 0;
    const pending = new Uint8Array(65536);
    let pendingLen = 0;

    function readBits(n) {
      while (bitCnt < n) {
        if (pos >= u8.length) throw new Error('Deflate: datos truncados');
        bitBuf |= u8[pos++] << bitCnt;
        bitCnt += 8;
      }
      const value = bitBuf & ((1 << n) - 1);
      bitBuf >>>= n;
      bitCnt -= n;
      return value;
    }

    function flushPending() {
      if (!pendingLen) return;
      chunks.push(pending.slice(0, pendingLen));
      totalOut += pendingLen;
      pendingLen = 0;
    }
    function emit(b) {
      pending[pendingLen++] = b;
      window_[winPos] = b;
      winPos = (winPos + 1) & 0x7FFF;
      if (pendingLen === pending.length) flushPending();
    }
    function emitCopy(dist, len) {
      let src = (winPos - dist) & 0x7FFF;
      for (let i = 0; i < len; i++) {
        const b = window_[src];
        emit(b);
        src = (src + 1) & 0x7FFF;
      }
    }
    function decode(table) {
      let code = 0;
      let first = 0;
      let index = 0;
      const counts = table.counts;
      const offs = table.offs;
      const symbols = table.symbols;
      for (let len = 1; len <= MAXBITS; len++) {
        code |= readBits(1);
        const count = counts[len];
        if (code - first < count) return symbols[offs[len] + (code - first)];
        index += count;
        first = (first + count) << 1;
        code <<= 1;
      }
      throw new Error('Deflate: código Huffman inválido');
    }

    let finalBlock = false;
    while (!finalBlock) {
      finalBlock = readBits(1) === 1;
      const btype = readBits(2);

      if (btype === 0) {
        // Bloque sin comprimir: alinear a byte y copiar len bytes.
        bitBuf = 0; bitCnt = 0;
        if (pos + 4 > u8.length) throw new Error('Deflate: bloque stored truncado');
        const len = u8[pos] | (u8[pos + 1] << 8);
        const nlen = u8[pos + 2] | (u8[pos + 3] << 8);
        if ((len ^ 0xFFFF) !== nlen) throw new Error('Deflate: bloque stored dañado');
        pos += 4;
        if (pos + len > u8.length) throw new Error('Deflate: bloque stored truncado');
        for (let i = 0; i < len; i++) emit(u8[pos + i]);
        pos += len;
        continue;
      }
      if (btype === 3) throw new Error('Deflate: tipo de bloque reservado');

      let litTable, distTable;
      if (btype === 1) {
        litTable = FIXED_LIT_TABLE;
        distTable = FIXED_DIST_TABLE;
      } else {
        // Árboles dinámicos.
        const hlit = readBits(5) + 257;
        const hdist = readBits(5) + 1;
        const hclen = readBits(4) + 4;
        const clLengths = new Uint8Array(19);
        for (let i = 0; i < hclen; i++) clLengths[CODE_LEN_ORDER[i]] = readBits(3);
        const clTable = buildTable(clLengths);
        const lengths = [];
        while (lengths.length < hlit + hdist) {
          const sym = decode(clTable);
          if (sym < 16) {
            lengths.push(sym);
          } else if (sym === 16) {
            if (lengths.length === 0) throw new Error('Deflate: repetición sin valor previo');
            const rep = readBits(2) + 3;
            const prev = lengths[lengths.length - 1];
            for (let i = 0; i < rep; i++) lengths.push(prev);
          } else if (sym === 17) {
            const rep = readBits(3) + 3;
            for (let i = 0; i < rep; i++) lengths.push(0);
          } else { // sym === 18
            const rep = readBits(7) + 11;
            for (let i = 0; i < rep; i++) lengths.push(0);
          }
          if (lengths.length > hlit + hdist) throw new Error('Deflate: demasiados códigos');
        }
        litTable = buildTable(lengths.slice(0, hlit));
        distTable = buildTable(lengths.slice(hlit));
      }

      for (;;) {
        const sym = decode(litTable);
        if (sym < 256) {
          emit(sym);
          continue;
        }
        if (sym === 256) break;
        if (sym > 285) throw new Error('Deflate: símbolo de longitud inválido');
        const li = sym - 257;
        const length = LENGTH_BASE[li] + readBits(LENGTH_EXTRA[li]);
        const dsym = decode(distTable);
        if (dsym > 29) throw new Error('Deflate: símbolo de distancia inválido');
        const distance = DIST_BASE[dsym] + readBits(DIST_EXTRA[dsym]);
        emitCopy(distance, length);
      }
    }
    flushPending();

    // Concatenar los trozos en un único buffer.
    const out = new Uint8Array(totalOut);
    let offset = 0;
    for (let i = 0; i < chunks.length; i++) {
      out.set(chunks[i], offset);
      offset += chunks[i].length;
    }
    return out;
  }

  return { inflate };
})();

/* Inflado con reserva: DecompressionStream si el motor la tiene
 * (Chrome 80+), inflado propio en cualquier otro caso. */
async function auroraInflateRaw(blob) {
  if (typeof DecompressionStream !== 'undefined') {
    try {
      const stream = blob.stream().pipeThrough(new DecompressionStream('deflate-raw'));
      return new Uint8Array(await new Response(stream).arrayBuffer());
    } catch (e) {
      // Si la vía nativa falla, se intenta la propia antes de rendirse.
    }
  }
  return AuroraInflate.inflate(new Uint8Array(await blob.arrayBuffer()));
}

/* =====================================================================
 *  Lector de ZIP. No confía en las cabeceras locales (los ZIP que
 *  escribe Java llevan «data descriptor»): las compensaciones salen del
 *  directorio central, que siempre está completo.
 * ===================================================================== */
async function auroraReadZip(blob) {
  if (!blob || blob.size < 22) throw new Error('El archivo es demasiado pequeño para ser un ZIP');

  // 1. Localizar el End Of Central Directory en los últimos 66 KB.
  const tailSize = Math.min(blob.size, 22 + 65535 + 16);
  const tail = new Uint8Array(await blob.slice(blob.size - tailSize).arrayBuffer());
  let eocd = -1;
  for (let i = tail.length - 22; i >= 0; i--) {
    if (tail[i] === 0x50 && tail[i + 1] === 0x4B && tail[i + 2] === 0x05 && tail[i + 3] === 0x06) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error('El archivo no es un ZIP (falta el directorio central)');
  const etd = new DataView(tail.buffer, tail.byteOffset + eocd, 22);
  const diskNo = etd.getUint16(4, true);
  const cdDisk = etd.getUint16(6, true);
  const cdEntriesOnDisk = etd.getUint16(8, true);
  const cdEntries = etd.getUint16(10, true);
  const cdSize = etd.getUint32(12, true);
  const cdOffset = etd.getUint32(16, true);
  if (diskNo !== 0 || cdDisk !== 0 || cdEntriesOnDisk !== cdEntries) {
    throw new Error('Los ZIP multivolumen no están soportados');
  }
  if (cdOffset === 0xFFFFFFFF || cdSize === 0xFFFFFFFF || cdEntries === 0xFFFF) {
    throw new Error('Los ZIP de 4 GB o más no están soportados');
  }
  if (cdOffset + cdSize > blob.size) throw new Error('El directorio central está fuera de rango');

  // 2. Leer el directorio central.
  const cd = new Uint8Array(await blob.slice(cdOffset, cdOffset + cdSize).arrayBuffer());
  const dv = new DataView(cd.buffer, cd.byteOffset);
  const entries = [];
  let pos = 0;
  while (pos + 46 <= cd.length) {
    if (dv.getUint32(pos, true) !== 0x02014B50) break;
    const method = dv.getUint16(pos + 10, true);
    const crc = dv.getUint32(pos + 16, true);
    const csize = dv.getUint32(pos + 20, true);
    const usize = dv.getUint32(pos + 24, true);
    const nameLen = dv.getUint16(pos + 28, true);
    const extraLen = dv.getUint16(pos + 30, true);
    const commentLen = dv.getUint16(pos + 32, true);
    const localOffset = dv.getUint32(pos + 42, true);
    if (csize === 0xFFFFFFFF || usize === 0xFFFFFFFF || localOffset === 0xFFFFFFFF) {
      throw new Error('Los ZIP64 no están soportados');
    }
    const name = auroraUtf8Decode(cd.subarray(pos + 46, pos + 46 + nameLen));
    entries.push({ name, method, crc, csize, usize, localOffset });
    pos += 46 + nameLen + extraLen + commentLen;
  }
  const byName = new Map();
  for (const e of entries) {
    if (!byName.has(e.name)) byName.set(e.name, e);
  }
  return { entries, byName };
}

/* Descomprime una entrada y verifica su CRC. */
async function auroraReadEntry(blob, entry) {
  // El directorio central manda; la local header solo dice dónde empieza el dato.
  const lh = new Uint8Array(await blob.slice(entry.localOffset, entry.localOffset + 30).arrayBuffer());
  const lhv = new DataView(lh.buffer, lh.byteOffset, 30);
  if (lhv.getUint32(0, true) !== 0x04034B50) {
    throw new Error('Entrada dañada en el ZIP: ' + entry.name);
  }
  const nameLen = lhv.getUint16(26, true);
  const extraLen = lhv.getUint16(28, true);
  const dataStart = entry.localOffset + 30 + nameLen + extraLen;
  if (dataStart + entry.csize > blob.size) {
    throw new Error('Entrada truncada en el ZIP: ' + entry.name);
  }
  const dataBlob = blob.slice(dataStart, dataStart + entry.csize);
  let bytes;
  if (entry.method === 0) {
    bytes = new Uint8Array(await dataBlob.arrayBuffer());
  } else if (entry.method === 8) {
    bytes = await auroraInflateRaw(dataBlob);
  } else {
    throw new Error('Compresión no soportada (método ' + entry.method + ') en ' + entry.name);
  }
  if (bytes.length !== entry.usize) {
    throw new Error('Entrada dañada en el ZIP: ' + entry.name);
  }
  if (auroraCrc32(bytes) !== entry.crc) {
    throw new Error('La entrada «' + entry.name + '» está dañada (CRC no coincide)');
  }
  return bytes;
}

/* =====================================================================
 *  Escritor de ZIP (entradas STORED, sin comprimir). El audio (mp3,
 *  flac, ogg…) ya viene comprimido: deflate apenas ganaría nada y en
 *  cambio el ZIP resultante se puede crear por trozos perezosos con
 *  Blob.concat, sin cargar la biblioteca en memoria.
 * ===================================================================== */
function auroraDosDateTime(date) {
  const d = date || new Date();
  const time = ((d.getHours() & 0x1F) << 11) | ((d.getMinutes() & 0x3F) << 5) | ((d.getSeconds() >> 1) & 0x1F);
  const day = (((d.getFullYear() - 1980) & 0x7F) << 9) | (((d.getMonth() + 1) & 0x0F) << 5) | (d.getDate() & 0x1F);
  return { time, day };
}

async function auroraBuildZip(entries) {
  // entries: [{ name, blob }]. El CRC exige leer todos los datos una vez.
  const stamp = auroraDosDateTime(new Date());
  let totalSize = 0;
  const metas = [];
  for (const entry of entries) {
    const nameBytes = auroraAsciiBytes(entry.name);
    const crc = await auroraCrc32Blob(entry.blob);
    if (entry.blob.size > 0xFFFFFFFF) throw new Error('Entrada de más de 4 GB: ' + entry.name);
    metas.push({ name: entry.name, nameBytes, crc, size: entry.blob.size, blob: entry.blob });
    totalSize += 30 + nameBytes.length + entry.blob.size;
  }
  if (totalSize > 0xFFFFFFFF) throw new Error('El respaldo supera los 4 GB');

  const parts = [];
  const centralParts = [];
  let centralSize = 0;
  let offset = 0;
  const u16 = (v) => { const b = new Uint8Array(2); new DataView(b.buffer).setUint16(0, v, true); return b; };
  const u32 = (v) => { const b = new Uint8Array(4); new DataView(b.buffer).setUint32(0, v >>> 0, true); return b; };

  for (const meta of metas) {
    // Cabecera local.
    const local = [];
    local.push(u32(0x04034B50));
    local.push(u16(20));            // versión necesaria
    local.push(u16(0));             // banderas
    local.push(u16(0));             // método: STORED
    local.push(u16(stamp.time));
    local.push(u16(stamp.day));
    local.push(u32(meta.crc));
    local.push(u32(meta.size));     // tamaño comprimido
    local.push(u32(meta.size));     // tamaño real
    local.push(u16(meta.nameBytes.length));
    local.push(u16(0));             // extra
    local.push(meta.nameBytes);
    parts.push(new Blob(local));
    parts.push(meta.blob);

    // Directorio central.
    const central = [];
    central.push(u32(0x02014B50));
    central.push(u16(20));          // versión creadora
    central.push(u16(20));          // versión necesaria
    central.push(u16(0));
    central.push(u16(0));           // método: STORED
    central.push(u16(stamp.time));
    central.push(u16(stamp.day));
    central.push(u32(meta.crc));
    central.push(u32(meta.size));
    central.push(u32(meta.size));
    central.push(u16(meta.nameBytes.length));
    central.push(u16(0));           // extra
    central.push(u16(0));           // comentario
    central.push(u16(0));           // disco
    central.push(u16(0));           // atributos internos
    central.push(u32(0));           // atributos externos
    central.push(u32(offset));      // desplazamiento local
    central.push(meta.nameBytes);
    const centralBlob = new Blob(central);
    centralParts.push(centralBlob);
    centralSize += centralBlob.size;

    offset += 30 + meta.nameBytes.length + meta.size;
  }

  parts.push(...centralParts);
  const eocd = new Blob([
    u32(0x06054B50), u16(0), u16(0),
    u16(metas.length), u16(metas.length),
    u32(centralSize), u32(offset),
    u16(0)
  ]);
  parts.push(eocd);
  return new Blob(parts, { type: 'application/zip' });
}

/* =====================================================================
 *  Recolección de datos para el respaldo (común a las tres rutas).
 *  El manifiesto conserva el formato «aurora-migration-backup» v1: las
 *  pistas guardan sus metadatos (sin blobs), `backupAudio` apunta a la
 *  entrada audio/NNNNNN del ZIP, o es null si el audio no viaja
 *  (pistas del móvil vía MediaStore).
 * ===================================================================== */
const AuroraBackupData = {
  async collect() {
    if (!window.AuroraStorage) throw new Error('Almacenamiento no disponible');
    await window.AuroraStorage.open();
    const storedTracks = await window.AuroraStorage.getAllTracks();
    const playlists = await window.AuroraStorage.getAllPlaylists();
    const settings = await window.AuroraStorage.getAllSettings();
    const local = {};
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.indexOf('aurora_') === 0) local[key] = localStorage.getItem(key);
    }

    // Claves que la interfaz usa para el estado vivo y que no deben
    // viajar: blobs, handles y cualquier campo interno con «_». Los
    // marcadores _device y _tagsChecked SÍ viajan: conservan el enlace
    // con el archivo original y evitan re-analizar metadatos al restaurar.
    const KEEP_PRIVATE = { _device: 1, _tagsChecked: 1 };

    const backupTracks = [];
    const audioJobs = [];
    (storedTracks || []).forEach((source, index) => {
      const track = {};
      Object.keys(source || {}).forEach(key => {
        const value = source[key];
        if (key === 'fileBlob' || key === '_file' || key === 'src') return;
        if (key.charAt(0) === '_' && !KEEP_PRIVATE[key]) return;
        if (typeof value === 'function') return;
        if (typeof Blob !== 'undefined' && value instanceof Blob) return;
        track[key] = value;
      });
      const ext = auroraExtOf(source && source.fileName ? source.fileName : '');
      const fileEntry = 'audio/' + String(index + 1).padStart(6, '0') + '.' + ext;
      track.backupAudio = null;
      backupTracks.push(track);
      audioJobs.push({ track, source, fileEntry });
    });

    // Resolver qué pistas llevan audio antes de escribir el manifiesto
    // (así backup.json puede ser la primera entrada del ZIP).
    for (const item of audioJobs) {
      let blob = item.source && item.source.fileBlob;
      if (!(blob instanceof Blob) && item.source && item.source._file instanceof Blob) {
        blob = item.source._file;
      }
      if (!(blob instanceof Blob) && item.source && item.source.id) {
        const latest = await window.AuroraStorage.getTrack(item.source.id);
        if (latest && latest.fileBlob instanceof Blob) blob = latest.fileBlob;
      }
      if (!(blob instanceof Blob) || blob.size <= 0) continue;
      item.blob = blob;
      item.track.backupAudio = item.fileEntry;
    }

    const aboutVersion = document.getElementById('aboutVersion');
    const manifest = {
      format: 'aurora-migration-backup',
      formatVersion: 1,
      createdAt: new Date().toISOString(),
      appVersion: aboutVersion ? String(aboutVersion.textContent || '').trim() : '1.5.0',
      tracks: backupTracks,
      playlists: playlists || [],
      settings: settings || {},
      localStorage: local,
      audioEntries: []
    };
    audioJobs.forEach(item => {
      if (item.blob) {
        manifest.audioEntries.push({
          trackId: item.track.id,
          path: item.fileEntry,
          size: item.blob.size
        });
      }
    });
    return { manifest, audioJobs };
  },

  /* Lee un Blob por dataURL en base64 (ruta Android: el ZIP lo construye
   * Java y los trozos cruzan el puente codificados). */
  readSliceBase64(blob, start, end) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const s = String(reader.result || '');
        const comma = s.indexOf(',');
        resolve(comma >= 0 ? s.slice(comma + 1) : '');
      };
      reader.onerror = () => reject(reader.error || new Error('No se pudo leer una pista'));
      reader.readAsDataURL(blob.slice(start, end));
    });
  }
};

/* =====================================================================
 *  Validación y restauración del respaldo.
 *  planRestore lee TODO el ZIP y verifica CRCs sin tocar el
 *  almacenamiento; applyRestore solo se ejecuta con el plan en la mano.
 * ===================================================================== */
const AuroraBackupRestore = {
  MAX_INDEX_BYTES: 64 * 1024 * 1024,

  async planRestore(blob) {
    if (!blob) throw new Error('No se eligió un archivo');
    const zip = await auroraReadZip(blob);
    const indexEntry = zip.byName.get('backup.json');
    if (!indexEntry) throw new Error('El ZIP no contiene backup.json');
    if (indexEntry.usize > this.MAX_INDEX_BYTES || indexEntry.csize > this.MAX_INDEX_BYTES * 2) {
      throw new Error('El índice del respaldo es demasiado grande');
    }
    const manifestBytes = await auroraReadEntry(blob, indexEntry);
    let manifest;
    try {
      manifest = JSON.parse(auroraUtf8Decode(manifestBytes));
    } catch (e) {
      throw new Error('El índice del respaldo está dañado (JSON ilegible)');
    }
    if (!manifest || manifest.format !== 'aurora-migration-backup') {
      throw new Error('El archivo no es un respaldo de Aurora');
    }
    if (Number(manifest.formatVersion) !== 1) {
      throw new Error('Versión de respaldo no compatible');
    }
    const tracks = Array.isArray(manifest.tracks) ? manifest.tracks : [];
    const playlists = Array.isArray(manifest.playlists) ? manifest.playlists : [];

    // Toda entrada de audio debe existir y pasar el CRC antes de borrar nada.
    let audioCount = 0;
    let missingAudio = 0;
    for (const track of tracks) {
      if (!track || typeof track !== 'object') continue;
      const path = typeof track.backupAudio === 'string' ? track.backupAudio : '';
      if (!path) { missingAudio++; continue; }
      if (!auroraSafeEntryPath(path) || path.indexOf('audio/') !== 0) {
        throw new Error('Ruta de audio inválida en el respaldo');
      }
      const entry = zip.byName.get(path);
      if (!entry) throw new Error('Falta un archivo de audio del respaldo: ' + path);
      await auroraReadEntry(blob, entry); // verifica CRC y tamaño
      audioCount++;
    }

    return {
      manifest,
      byName: zip.byName,
      tracks,
      playlists,
      settings: (manifest.settings && typeof manifest.settings === 'object') ? manifest.settings : {},
      localStorage: (manifest.localStorage && typeof manifest.localStorage === 'object') ? manifest.localStorage : {},
      trackCount: tracks.length,
      playlistCount: playlists.length,
      audioCount,
      missingAudio
    };
  },

  async applyRestore(blob, plan) {
    const S = window.AuroraStorage;
    if (!S) throw new Error('Almacenamiento no disponible');
    await S.open();

    // A partir de aquí se REEMPLAZA: primero se borra, después se escribe.
    await S.clearTracks();
    await S.clearPlaylists();
    if (typeof S.clearSettings === 'function') await S.clearSettings();

    // localStorage: solo el espacio aurora_*, que es el que exporta.
    const staleKeys = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.indexOf('aurora_') === 0) staleKeys.push(key);
    }
    staleKeys.forEach(key => { try { localStorage.removeItem(key); } catch (e) {} });
    Object.keys(plan.localStorage).forEach(key => {
      if (key.indexOf('aurora_') !== 0) return;
      try { localStorage.setItem(key, String(plan.localStorage[key])); } catch (e) {}
    });

    // Ajustes de IndexedDB. Las claves con prefijo «local:» son el espejo
    // que la edición nativa guarda dentro de sus settings: ya están en
    // localStorage arriba; se ignoran aquí.
    for (const key of Object.keys(plan.settings)) {
      if (!key || key.indexOf('local:') === 0) continue;
      await S.setSetting(key, plan.settings[key]);
    }

    let missingAudio = 0;
    let written = 0;
    for (const source of plan.tracks) {
      if (!source || typeof source !== 'object') continue;
      const track = {};
      Object.keys(source).forEach(key => {
        if (key === 'backupAudio' || key === 'fileBlob' || key === '_file' || key === 'src') return;
        track[key] = source[key];
      });
      const path = typeof source.backupAudio === 'string' ? source.backupAudio : '';
      if (path) {
        const entry = plan.byName.get(path);
        const bytes = await auroraReadEntry(blob, entry);
        track.fileBlob = new Blob([bytes], { type: auroraMimeOf(track.fileName || path) });
      } else {
        missingAudio++;
      }
      await S.putTrack(track);
      written++;
    }

    for (const playlist of plan.playlists) {
      if (playlist && typeof playlist === 'object' && playlist.id) {
        await S.putPlaylist(playlist);
      }
    }

    return {
      tracks: written,
      playlists: plan.playlists.length,
      missingAudio
    };
  }
};

window.AuroraBackup = {
  buildZip: auroraBuildZip,
  readZip: auroraReadZip,
  readEntry: auroraReadEntry,
  crc32: auroraCrc32,
  inflateRaw: AuroraInflate.inflate,
  safeEntryPath: auroraSafeEntryPath,
  mimeOf: auroraMimeOf,
  extOf: auroraExtOf,
  collect: AuroraBackupData.collect.bind(AuroraBackupData),
  planRestore: (blob) => AuroraBackupRestore.planRestore(blob),
  applyRestore: (blob, plan) => AuroraBackupRestore.applyRestore(blob, plan)
};

/* =====================================================================
 *  Puerta de entrada desde la app.
 * ===================================================================== */
Object.assign(App, {
  /* Exporta la biblioteca completa como ZIP.
   * Android: el ZIP lo arma Java (por trozos) y se abre el selector del
   * sistema. Delta Chat: el ZIP lo arma JS y se manda con sendToChat.
   * Navegador: el ZIP se descarga. */
  async exportMigrationBackup() {
    const B = window.AuroraAndroid;
    const hasJavaZip = B && ['beginArchive', 'beginArchiveEntry', 'appendArchiveChunk',
      'endArchiveEntry', 'finishArchive', 'abortArchive', 'share']
      .every(name => typeof B[name] === 'function');

    let archiveStarted = false;
    let completed = false;
    this.toast(this.t('toast_backup_start'));
    try {
      const data = await AuroraBackupData.collect();
      const manifest = data.manifest;
      const manifestText = JSON.stringify(manifest);

      if (hasJavaZip) {
        const beginArchiveChunked = async (entryName, blob) => {
          if (!B.beginArchiveEntry(entryName)) throw new Error('No se pudo abrir una entrada del ZIP');
          const size = 192 * 1024;
          for (let offset = 0; offset < blob.size; offset += size) {
            const base64 = await AuroraBackupData.readSliceBase64(blob, offset, Math.min(blob.size, offset + size));
            if (!B.appendArchiveChunk(base64)) {
              throw new Error('No se pudo escribir un bloque del respaldo');
            }
            if (offset && offset % (size * 8) === 0) {
              await new Promise(resolve => setTimeout(resolve, 0));
            }
          }
          if (!B.endArchiveEntry()) throw new Error('No se pudo cerrar una entrada del ZIP');
        };

        if (!B.beginArchive('aurora-backup.zip')) {
          throw new Error('No se pudo crear el archivo de respaldo');
        }
        archiveStarted = true;
        await beginArchiveChunked('backup.json', new Blob([manifestText], {
          type: 'application/json;charset=utf-8'
        }));
        for (const item of data.audioJobs) {
          if (item.blob) await beginArchiveChunked(item.fileEntry, item.blob);
        }
        if (!B.finishArchive()) throw new Error('No se pudo finalizar el respaldo');
        completed = true;
        const shared = B.share('Respaldo de Aurora', 'application/zip');
        if (!shared) throw new Error('No se pudo abrir el selector para guardar el respaldo');
        this.toast(this.t('toast_backup_ready'));
        return true;
      }

      // Sin puente Android (Delta Chat o navegador): el ZIP se arma en JS.
      const entries = [{
        name: 'backup.json',
        blob: new Blob([manifestText], { type: 'application/json;charset=utf-8' })
      }];
      for (const item of data.audioJobs) {
        if (item.blob) entries.push({ name: item.fileEntry, blob: item.blob });
      }
      const zipBlob = await auroraBuildZip(entries);
      const stamp = new Date().toISOString().slice(0, 10).replace(/-/g, '');
      const fileName = 'aurora-backup-' + stamp + '.zip';

      const W = window.webxdc;
      if (W && typeof W.sendToChat === 'function') {
        try {
          await W.sendToChat({
            file: { name: fileName, blob: zipBlob },
            text: this.t('toast_backup_ready')
          });
          this.toast(this.t('toast_backup_chat'));
          return true;
        } catch (err) {
          console.warn('[Aurora] sendToChat no completado:', err);
          this.toast(this.t('toast_backup_error'));
          return false;
        }
      }

      const url = URL.createObjectURL(zipBlob);
      const a = document.createElement('a');
      a.href = url;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      this.toast(this.t('toast_downloaded'));
      return true;
    } catch (error) {
      console.error('[Aurora] exportMigrationBackup:', error);
      this.toast(this.t('toast_backup_error'));
      return false;
    } finally {
      if (archiveStarted && !completed && hasJavaZip) {
        try { B.abortArchive(); } catch (e) {}
      }
    }
  },

  /* Selector de archivo para restaurar: webxdc.importFiles dentro de
   * Delta Chat (así el respaldo puede llegar como adjunto del chat),
   * <input type="file"> en el resto. null = cancelado o sin archivo. */
  _pickBackupFile() {
    const useWebxdc = !!(window.webxdc && typeof window.webxdc.importFiles === 'function'
      && !window.webxdc._isStub);
    if (useWebxdc) {
      return window.webxdc.importFiles({
        extensions: ['.zip'],
        mimeTypes: ['application/zip', 'application/x-zip-compressed'],
        multiple: false
      }).then(files => (files && files.length ? files[0] : null))
        .catch(err => {
          console.warn('[Aurora] importFiles falló:', err);
          this.toast(this.t('toast_backup_restore_error'));
          return null;
        });
    }
    return new Promise((resolve) => {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = '.zip,application/zip,application/x-zip-compressed';
      input.style.display = 'none';
      let settled = false;
      const finish = (file) => {
        if (settled) return;
        settled = true;
        try { input.remove(); } catch (e) {}
        resolve(file || null);
      };
      input.addEventListener('change', () => {
        finish(input.files && input.files[0] ? input.files[0] : null);
      });
      // «cancel» existe en Chrome 113+; en WebViews antiguos no llega y el
      // respaldo de foco de abajo cierra el diálogo vacío sin bloquear.
      input.addEventListener('cancel', () => finish(null));
      window.addEventListener('focus', function onFocus() {
        window.removeEventListener('focus', onFocus);
        setTimeout(() => {
          if (!input.files || input.files.length === 0) finish(null);
        }, 400);
      });
      document.body.appendChild(input);
      input.click();
    });
  },

  /* Restaura un respaldo REEMPLAZANDO la biblioteca actual.
   * Primero se valida todo (manifiesto + integridad de cada entrada);
   * solo entonces se pide confirmación y se borra y escribe. */
  async importMigrationBackup() {
    const file = await this._pickBackupFile();
    if (!file) return false;   // cancelado por el usuario

    let plan;
    try {
      plan = await AuroraBackupRestore.planRestore(file);
    } catch (error) {
      console.error('[Aurora] importMigrationBackup (validación):', error);
      this.toast(this.t('toast_backup_restore_error'));
      return false;
    }

    this.toast(this.t('toast_backup_restore_start'));
    const message = this.t('backup_restore_confirm')
      .replace('X', String(plan.trackCount))
      .replace('Y', String(plan.playlistCount));
    const ok = await this.showConfirm({
      message,
      okLabel: this.t('backup_restore_ok'),
      danger: true
    });
    if (!ok) return false;

    let result;
    try {
      result = await AuroraBackupRestore.applyRestore(file, plan);
    } catch (error) {
      console.error('[Aurora] importMigrationBackup (escritura):', error);
      this.toast(this.t('toast_backup_restore_error'));
      return false;
    }

    const doneText = result.missingAudio > 0
      ? this.t('toast_backup_restore_partial')
      : this.t('toast_backup_restore_done');
    this.toast(doneText
      .replace('X', String(result.tracks))
      .replace('Y', String(result.missingAudio))
      .replace('Z', String(result.playlists)));
    // Estado vivo coherente: se recarga la app desde el almacenamiento restaurado.
    setTimeout(() => { try { location.reload(); } catch (e) {} }, 1600);
    return true;
  }
});
