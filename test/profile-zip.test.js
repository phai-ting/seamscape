import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  encodeProfile, decodeProfile, profileFromHash, hashForProfile,
} from '../public/js/profile.js';
import { crc32, createZip } from '../public/js/zip.js';
import { zipManifest, detectOS } from '../public/js/howto.js';

const profile = {
  monitors: [
    { n: 1, w: 1080, h: 1920, x: -1080, y: -420, pw: 299.9, ph: 533.2, primary: false },
    { n: 2, w: 3840, h: 2160, x: 0, y: 0, pw: 596.7, ph: 335.6, primary: true },
  ],
  edges: [{ a: 1, b: 2, dir: 'h', gap: 21.5, shift: 115.9 }],
};

test('profile round-trips through the URL fragment', () => {
  const hash = hashForProfile(profile);
  assert.match(hash, /^#p=1\.[A-Za-z0-9_-]+$/);
  assert.deepEqual(profileFromHash(hash), profile);
});

test('profileFromHash returns null without a profile', () => {
  assert.equal(profileFromHash(''), null);
  assert.equal(profileFromHash('#other=1'), null);
});

test('decodeProfile rejects bad input', () => {
  assert.throws(() => decodeProfile('2.abc'), /version/);
  assert.throws(() => decodeProfile('1.@@@'), /damaged/);
  const bad = { ...profile, edges: [{ a: 1, b: 9, dir: 'h', gap: 1, shift: 0 }] };
  assert.throws(() => decodeProfile(encodeProfile(bad)), /unknown monitor/);
});

test('crc32 matches known values', () => {
  assert.equal(crc32(new TextEncoder().encode('hello')), 0x3610a686);
  assert.equal(crc32(new Uint8Array()), 0);
});

// Read a stored ZIP back using only the central directory.
function readZip(buf) {
  const v = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  const eocd = buf.length - 22;
  assert.equal(v.getUint32(eocd, true), 0x06054b50);
  const count = v.getUint16(eocd + 10, true);
  const cdSize = v.getUint32(eocd + 12, true);
  let p = v.getUint32(eocd + 16, true);
  assert.equal(p + cdSize, eocd);
  const dec = new TextDecoder();
  const files = {};
  for (let i = 0; i < count; i++) {
    assert.equal(v.getUint32(p, true), 0x02014b50);
    const crc = v.getUint32(p + 16, true);
    const size = v.getUint32(p + 24, true);
    const nameLen = v.getUint16(p + 28, true);
    const off = v.getUint32(p + 42, true);
    const name = dec.decode(buf.subarray(p + 46, p + 46 + nameLen));
    assert.equal(v.getUint32(off, true), 0x04034b50);
    const dataStart = off + 30 + v.getUint16(off + 26, true);
    const data = buf.subarray(dataStart, dataStart + size);
    assert.equal(crc32(data), crc);
    files[name] = dec.decode(data);
    p += 46 + nameLen;
  }
  return files;
}

test('createZip writes a readable archive', () => {
  const zip = createZip([
    { name: 'windows/HOW-TO-APPLY.txt', data: 'hi' },
    { name: 'macos/a.png', data: new Uint8Array([1, 2, 3]) },
  ]);
  const files = readZip(zip);
  assert.deepEqual(Object.keys(files), ['windows/HOW-TO-APPLY.txt', 'macos/a.png']);
  assert.equal(files['windows/HOW-TO-APPLY.txt'], 'hi');
});

test('zipManifest picks files per OS', () => {
  const plan = {
    span: { w: 4920, h: 2160 },
    perMonitor: [
      { n: 1, name: 'left', w: 1080, h: 1920 },
      { n: 2, name: 'right', w: 3840, h: 2160 },
    ],
  };
  assert.deepEqual(zipManifest(['windows'], plan, 'png').map((f) => f.path), [
    'windows/seamscape-span.png', 'windows/HOW-TO-APPLY.txt',
  ]);
  assert.deepEqual(zipManifest(['macos', 'linux'], plan, 'jpg').map((f) => f.path), [
    'macos/seamscape-1-left.jpg', 'macos/seamscape-2-right.jpg', 'macos/HOW-TO-APPLY.txt',
    'linux/seamscape-span.jpg', 'linux/seamscape-1-left.jpg', 'linux/seamscape-2-right.jpg',
    'linux/HOW-TO-APPLY.txt',
  ]);
  const mac = zipManifest(['macos'], plan, 'png').find((f) => f.kind === 'text').text;
  assert.match(mac, /seamscape-2-right\.png {2}-> {2}monitor 2/);
});

test('detectOS', () => {
  assert.equal(detectOS('MacIntel'), 'macos');
  assert.equal(detectOS('Win32'), 'windows');
  assert.equal(detectOS('Linux x86_64'), 'linux');
  assert.equal(detectOS('macOS'), 'macos');
});
