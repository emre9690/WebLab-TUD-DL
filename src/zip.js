// Minimal ZIP writer (STORE, no compression). Text is small and images are
// already compressed, so this keeps the extension dependency-free.
var WLX = globalThis.WLX || (globalThis.WLX = {});

(() => {
  const CRC_TABLE = (() => {
    const t = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      t[n] = c >>> 0;
    }
    return t;
  })();

  function crc32(bytes) {
    let c = 0xffffffff;
    for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  }

  function dosDateTime(d) {
    const time = (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1);
    const date = ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate();
    return { time, date };
  }

  class ZipWriter {
    constructor() {
      this.entries = [];
      this.names = new Set();
      this.encoder = new TextEncoder();
    }

    // Adds a file; returns the path actually used (deduplicated if needed).
    add(path, data) {
      let name = path;
      for (let i = 2; this.names.has(name); i++) {
        name = path.replace(/(\.[^./]*)?$/, (ext) => ` (${i})${ext || ''}`);
      }
      this.names.add(name);
      const bytes = typeof data === 'string' ? this.encoder.encode(data) : new Uint8Array(data);
      this.entries.push({ name: this.encoder.encode(name), bytes, crc: crc32(bytes) });
      return name;
    }

    toBlob() {
      const { time, date } = dosDateTime(new Date());
      const parts = [];
      const central = [];
      let offset = 0;

      for (const e of this.entries) {
        const local = new DataView(new ArrayBuffer(30));
        local.setUint32(0, 0x04034b50, true);
        local.setUint16(4, 20, true);
        local.setUint16(6, 0x0800, true); // UTF-8 file names
        local.setUint16(8, 0, true); // STORE
        local.setUint16(10, time, true);
        local.setUint16(12, date, true);
        local.setUint32(14, e.crc, true);
        local.setUint32(18, e.bytes.length, true);
        local.setUint32(22, e.bytes.length, true);
        local.setUint16(26, e.name.length, true);
        local.setUint16(28, 0, true);
        parts.push(local.buffer, e.name, e.bytes);

        const cd = new DataView(new ArrayBuffer(46));
        cd.setUint32(0, 0x02014b50, true);
        cd.setUint16(4, 20, true);
        cd.setUint16(6, 20, true);
        cd.setUint16(8, 0x0800, true);
        cd.setUint16(10, 0, true);
        cd.setUint16(12, time, true);
        cd.setUint16(14, date, true);
        cd.setUint32(16, e.crc, true);
        cd.setUint32(20, e.bytes.length, true);
        cd.setUint32(24, e.bytes.length, true);
        cd.setUint16(28, e.name.length, true);
        cd.setUint32(42, offset, true);
        central.push(cd.buffer, e.name);

        offset += 30 + e.name.length + e.bytes.length;
      }

      const cdSize = central.reduce((n, p) => n + p.byteLength, 0);
      const end = new DataView(new ArrayBuffer(22));
      end.setUint32(0, 0x06054b50, true);
      end.setUint16(8, this.entries.length, true);
      end.setUint16(10, this.entries.length, true);
      end.setUint32(12, cdSize, true);
      end.setUint32(16, offset, true);

      return new Blob([...parts, ...central, end.buffer], { type: 'application/zip' });
    }
  }

  WLX.ZipWriter = ZipWriter;
  WLX.crc32 = crc32;
})();
