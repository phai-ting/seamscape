// Minimal ZIP writer (stored, no compression). PNG and JPEG are already
// compressed, so deflate would add code and time for almost no gain.
// Pure functions only (no DOM).

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

export function crc32(bytes) {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function dosDateTime(d) {
  const time = (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1);
  const date = ((Math.max(1980, d.getFullYear()) - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate();
  return { time, date };
}

// files: [{ name, data: Uint8Array | string }]  ->  Uint8Array
export function createZip(files, now = new Date()) {
  const enc = new TextEncoder();
  const { time, date } = dosDateTime(now);
  const entries = files.map((f) => {
    const data = typeof f.data === 'string' ? enc.encode(f.data) : f.data;
    return { name: enc.encode(f.name), data, crc: crc32(data) };
  });

  const localSize = entries.reduce((s, e) => s + 30 + e.name.length + e.data.length, 0);
  const centralSize = entries.reduce((s, e) => s + 46 + e.name.length, 0);
  const out = new Uint8Array(localSize + centralSize + 22);
  const view = new DataView(out.buffer);
  let p = 0;
  const u16 = (v) => { view.setUint16(p, v, true); p += 2; };
  const u32 = (v) => { view.setUint32(p, v, true); p += 4; };
  const bytes = (b) => { out.set(b, p); p += b.length; };

  const offsets = [];
  for (const e of entries) {
    offsets.push(p);
    u32(0x04034b50);
    u16(20); u16(0x0800); u16(0); // version, flags (UTF-8 names), method: stored
    u16(time); u16(date);
    u32(e.crc); u32(e.data.length); u32(e.data.length);
    u16(e.name.length); u16(0);
    bytes(e.name);
    bytes(e.data);
  }

  const centralStart = p;
  entries.forEach((e, i) => {
    u32(0x02014b50);
    u16(20); u16(20); u16(0x0800); u16(0);
    u16(time); u16(date);
    u32(e.crc); u32(e.data.length); u32(e.data.length);
    u16(e.name.length); u16(0); u16(0); // name, extra, comment lengths
    u16(0); u16(0); u32(0); // disk, internal attrs, external attrs
    u32(offsets[i]);
    bytes(e.name);
  });

  const centralLength = p - centralStart;
  u32(0x06054b50);
  u16(0); u16(0);
  u16(entries.length); u16(entries.length);
  u32(centralLength);
  u32(centralStart);
  u16(0);
  return out;
}
