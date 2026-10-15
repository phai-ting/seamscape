// Calibration handoff between desktop and phone, with no server.
// Pure functions only (no DOM).
//
// Desktop -> phone: the QR code opens capture.html with the screen list in the
// fragment: "#s=2_2560x1440+0+0@597.7p_1920x1080-1920+180@531.4"
//   2           format version
//   WxH+X+Y     each monitor in number order: native size and OS position,
//   @597.7      its physical width in mm from step 1 (its diagonal),
//   p           and a trailing "p" on the primary.
// Sizes come from the user's diagonals, not the photo: a monitor angled
// towards the viewer looks bigger in a photo than it is. The photo measures
// only gaps and offsets, at the edge two monitors share.
//
// Phone -> desktop: a profile link (#p=..., see profile.js), or a short typed
// code that carries only the measured gaps and offsets. The desktop rebuilds
// the rest from the screen list it put in the QR code, which also ties the
// code to that calibration through the checksum.

import { defaultEdges, round1 } from './layout.js';
import { MAX_MONITORS } from './fiducials.js';

export const SCREENS_VERSION = 2;

export function encodeScreens({ monitors }) {
  const ms = [...monitors].sort((a, b) => a.n - b.n).map((m) => {
    const sign = (v) => (v < 0 ? String(v) : `+${v}`);
    return `${m.w}x${m.h}${sign(m.x)}${sign(m.y)}@${round1(m.pw)}${m.primary ? 'p' : ''}`;
  });
  return [SCREENS_VERSION, ...ms].join('_');
}

// { monitors: [{ n, w, h, x, y, pw, primary }] }
export function decodeScreens(text) {
  const parts = String(text).split('_');
  if (parts[0] !== String(SCREENS_VERSION)) {
    throw new Error('This QR code is from another version of Seamscape. Reload Seamscape on your computer and show the calibration screens again.');
  }
  const monitors = parts.slice(1).map((p, i) => {
    const m = /^(\d+)x(\d+)([+-]\d+)([+-]\d+)@(\d+(?:\.\d+)?)(p?)$/.exec(p);
    if (!m) throw new Error('The screen list is damaged');
    const [w, h, x, y, pw] = [m[1], m[2], m[3], m[4], m[5]].map(Number);
    if (w < 1 || h < 1 || !(pw > 0)) throw new Error('The screen list is damaged');
    return { n: i + 1, w, h, x, y, pw, primary: m[6] === 'p' };
  });
  if (monitors.length < 1 || monitors.length > MAX_MONITORS) throw new Error('The screen list is damaged');
  if (!monitors.some((m) => m.primary)) monitors[0].primary = true;
  return { monitors };
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

// Assemble a profile from the screen list and the measured gaps.
// edges: [{ gap, shift }] in defaultEdges order.
// Pixels are taken as square, so each monitor's height follows from its width.
export function buildProfile({ monitors: screens }, edges) {
  const monitors = screens.map((s) => ({
    n: s.n, w: s.w, h: s.h, x: s.x, y: s.y, pw: round1(s.pw), ph: round1((s.pw * s.h) / s.w), primary: s.primary,
  }));
  const links = defaultEdges(monitors, 0).map((e, i) => ({
    ...e, gap: halfMm(edges[i].gap), shift: halfMm(edges[i].shift),
  }));
  return { monitors, edges: links };
}

// ---------- short code ----------

// Crockford base32: no I, L, O, U, so the code survives being read aloud or typed.
const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
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
// Sizes are already in the screen list, so only gaps and offsets go in.
export function encodeCode(profile, screensText) {
  decodeScreens(screensText);
  const bits = [];
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
  const edgeCount = info.monitors.length - 1;
  const payloadLen = edgeCount * (GAP_BITS + SHIFT_BITS);
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
  const edges = [];
  for (let i = 0; i < edgeCount; i++) {
    const gap = unzigzag(take(GAP_BITS)) / 2;
    const shift = unzigzag(take(SHIFT_BITS)) / 2;
    edges.push({ gap, shift });
  }
  return buildProfile(info, edges);
}
