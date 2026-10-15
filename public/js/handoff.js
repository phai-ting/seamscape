// Calibration handoff between desktop and phone, with no server.
// Pure functions only (no DOM).
//
// Desktop -> phone: the QR code opens capture.html with the screen list in the
// fragment: "#s=1_597.7_2560x1440+0+0p_1920x1080-1920+180"
//   1           format version
//   597.7       physical width of the primary in mm (the desktop's current value)
//   WxH+X+Y     each monitor in number order: native size and OS position;
//               a trailing "p" marks the primary.
//
// Phone -> desktop: a profile link (#p=..., see profile.js), or a short typed
// code that carries only the measured numbers. The desktop rebuilds the rest
// from the screen list it put in the QR code, which also ties the code to that
// calibration through the checksum.

import { defaultEdges, round1 } from './layout.js';
import { MAX_MONITORS } from './fiducials.js';

export const SCREENS_VERSION = 1;

export function encodeScreens({ monitors, refMm }) {
  const ms = [...monitors].sort((a, b) => a.n - b.n).map((m) => {
    const sign = (v) => (v < 0 ? String(v) : `+${v}`);
    return `${m.w}x${m.h}${sign(m.x)}${sign(m.y)}${m.primary ? 'p' : ''}`;
  });
  return [SCREENS_VERSION, round1(refMm), ...ms].join('_');
}

export function decodeScreens(text) {
  const parts = String(text).split('_');
  if (parts[0] !== String(SCREENS_VERSION)) throw new Error('This QR code is from a different version of Seamscape');
  const refMm = Number(parts[1]);
  if (!(refMm > 0)) throw new Error('The screen list is damaged');
  const monitors = parts.slice(2).map((p, i) => {
    const m = /^(\d+)x(\d+)([+-]\d+)([+-]\d+)(p?)$/.exec(p);
    if (!m) throw new Error('The screen list is damaged');
    const [w, h, x, y] = [m[1], m[2], m[3], m[4]].map(Number);
    if (w < 1 || h < 1) throw new Error('The screen list is damaged');
    return { n: i + 1, w, h, x, y, primary: m[5] === 'p' };
  });
  if (monitors.length < 1 || monitors.length > MAX_MONITORS) throw new Error('The screen list is damaged');
  if (!monitors.some((m) => m.primary)) monitors[0].primary = true;
  return { refMm, monitors };
}

// The screen list from a location.hash like "#s=..."; null if there is none.
export function screensFromHash(hash) {
  const m = /(?:^#|&)s=([^&]+)/.exec(hash);
  return m ? m[1] : null;
}

export function captureUrl(origin, screensText) {
  return `${origin}/capture#s=${screensText}`;
}

// Measurements are kept to half millimetres: finer than a photo can resolve,
// and the step the short code uses, so link and code give the same profile.
export function halfMm(v) {
  return Math.round(v * 2) / 2;
}

// Assemble a profile from the screen list and the measured numbers.
// measured: { pw: { [n]: mm } for each non-primary monitor,
//             edges: [{ gap, shift }] in defaultEdges order }
// Pixels are taken as square, so each monitor's height follows from its width.
export function buildProfile({ refMm, monitors: screens }, measured) {
  const monitors = screens.map((s) => {
    const pw = s.primary ? refMm : measured.pw[s.n];
    return { n: s.n, w: s.w, h: s.h, x: s.x, y: s.y, pw: round1(pw), ph: round1((pw * s.h) / s.w), primary: s.primary };
  });
  const edges = defaultEdges(monitors, 0).map((e, i) => ({
    ...e, gap: halfMm(measured.edges[i].gap), shift: halfMm(measured.edges[i].shift),
  }));
  return { monitors, edges };
}

// ---------- short code ----------

// Crockford base32: no I, L, O, U, so the code survives being read aloud or typed.
const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
const PW_BITS = 12; // 0 .. 2047.5 mm
const GAP_BITS = 11; // -512 .. 511.5 mm
const SHIFT_BITS = 13; // -2048 .. 2047.5 mm
const CHECK_BITS = 15;

function zigzag(v) {
  return v >= 0 ? 2 * v : -2 * v - 1;
}

function unzigzag(z) {
  return z % 2 === 0 ? z / 2 : -(z + 1) / 2;
}

function pushBits(bits, value, count) {
  if (!Number.isInteger(value) || value < 0 || value >= 2 ** count) return false;
  for (let i = count - 1; i >= 0; i--) bits.push((value >> i) & 1);
  return true;
}

function readBits(bits, at, count) {
  let v = 0;
  for (let i = 0; i < count; i++) v = v * 2 + bits[at + i];
  return v;
}

function checksum(screensText, payloadBits) {
  // FNV-1a over the screen list and the payload.
  let h = 0x811c9dc5;
  for (const ch of `${screensText}|${payloadBits.join('')}`) {
    h ^= ch.charCodeAt(0);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h & (2 ** CHECK_BITS - 1);
}

// "7K3M-Q9XA-2B" style code for a profile measured against screensText, or
// null if a value is out of range for the code (the link still works then).
export function encodeCode(profile, screensText) {
  const info = decodeScreens(screensText);
  const bits = [];
  for (const s of info.monitors) {
    if (s.primary) continue;
    const m = profile.monitors.find((mm) => mm.n === s.n);
    if (!m || !pushBits(bits, Math.round(m.pw * 2), PW_BITS)) return null;
  }
  for (const e of profile.edges) {
    if (!pushBits(bits, zigzag(Math.round(e.gap * 2)), GAP_BITS)) return null;
    if (!pushBits(bits, zigzag(Math.round(e.shift * 2)), SHIFT_BITS)) return null;
  }
  pushBits(bits, checksum(screensText, bits), CHECK_BITS);
  while (bits.length % 5) bits.push(0);
  let out = '';
  for (let i = 0; i < bits.length; i += 5) out += ALPHABET[readBits(bits, i, 5)];
  return out.match(/.{1,4}/g).join('-');
}

export function normaliseCode(text) {
  return String(text).toUpperCase()
    .replace(/[IL]/g, '1').replace(/O/g, '0').replace(/U/g, 'V')
    .replace(/[^0-9A-Z]/g, '');
}

// Rebuild the profile from a typed code. Throws a plain-language error when
// the code is mistyped or belongs to another calibration.
export function decodeCode(text, screensText) {
  const info = decodeScreens(screensText);
  const chars = normaliseCode(text);
  const bits = [];
  for (const ch of chars) {
    const v = ALPHABET.indexOf(ch);
    if (v < 0) throw new Error('That code has a character that cannot be in a code');
    pushBits(bits, v, 5);
  }
  const others = info.monitors.filter((s) => !s.primary);
  const edgeCount = info.monitors.length - 1;
  const payloadLen = others.length * PW_BITS + edgeCount * (GAP_BITS + SHIFT_BITS);
  const total = payloadLen + CHECK_BITS;
  if (chars.length !== Math.ceil(total / 5)) {
    throw new Error(`That code is ${chars.length < Math.ceil(total / 5) ? 'too short' : 'too long'}. Check it against your phone.`);
  }
  const payload = bits.slice(0, payloadLen);
  if (readBits(bits, payloadLen, CHECK_BITS) !== checksum(screensText, payload)) {
    throw new Error('That code does not match. Check for a typo, or make sure it comes from this calibration.');
  }
  let at = 0;
  const take = (n) => { const v = readBits(payload, at, n); at += n; return v; };
  const pw = {};
  for (const s of others) pw[s.n] = take(PW_BITS) / 2;
  const edges = [];
  for (let i = 0; i < edgeCount; i++) {
    const gap = unzigzag(take(GAP_BITS)) / 2;
    const shift = unzigzag(take(SHIFT_BITS)) / 2;
    edges.push({ gap, shift });
  }
  if (Object.values(pw).some((v) => v <= 0)) throw new Error('That code does not match');
  return buildProfile(info, { pw, edges });
}
