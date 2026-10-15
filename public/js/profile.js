// Calibration profile <-> URL fragment. Pure functions only (no DOM).
//
// Format: "#p=<version>.<base64url(JSON)>". The JSON uses arrays to stay short:
//   { m: [[n, w, h, x, y, pw, ph, primary], ...], e: [[a, b, dir, gap, shift], ...] }
// Lives in the fragment so it is never sent to the server.

import { round1 } from './layout.js';

export const PROFILE_VERSION = 1;

function toBase64Url(str) {
  const bytes = new TextEncoder().encode(str);
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(s) {
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(b64 + '='.repeat((4 - (b64.length % 4)) % 4));
  return new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)));
}

export function encodeProfile({ monitors, edges }) {
  const data = {
    m: monitors.map((m) => [m.n, m.w, m.h, m.x, m.y, round1(m.pw), round1(m.ph), m.primary ? 1 : 0]),
    e: edges.map((e) => [e.a, e.b, e.dir, round1(e.gap), round1(e.shift)]),
  };
  return `${PROFILE_VERSION}.${toBase64Url(JSON.stringify(data))}`;
}

function num(v, what) {
  if (typeof v !== 'number' || !Number.isFinite(v)) throw new Error(`Bad ${what}`);
  return v;
}

function int(v, what, min = -Infinity) {
  if (!Number.isInteger(v) || v < min) throw new Error(`Bad ${what}`);
  return v;
}

export function decodeProfile(text) {
  const dot = text.indexOf('.');
  if (dot < 1) throw new Error('Not a Seamscape profile');
  const version = Number(text.slice(0, dot));
  if (version !== PROFILE_VERSION) throw new Error(`Unsupported profile version ${text.slice(0, dot)}`);

  let data;
  try {
    data = JSON.parse(fromBase64Url(text.slice(dot + 1)));
  } catch {
    throw new Error('Profile is damaged');
  }
  if (!data || !Array.isArray(data.m) || !Array.isArray(data.e) || data.m.length === 0) {
    throw new Error('Profile is damaged');
  }

  const monitors = data.m.map((r) => {
    if (!Array.isArray(r) || r.length !== 8) throw new Error('Bad monitor');
    return {
      n: int(r[0], 'monitor number', 1),
      w: int(r[1], 'width', 1),
      h: int(r[2], 'height', 1),
      x: int(r[3], 'x'),
      y: int(r[4], 'y'),
      pw: num(r[5], 'physical width'),
      ph: num(r[6], 'physical height'),
      primary: r[7] === 1,
    };
  });
  const ns = new Set(monitors.map((m) => m.n));
  if (ns.size !== monitors.length) throw new Error('Duplicate monitor number');
  if (monitors.some((m) => m.pw <= 0 || m.ph <= 0)) throw new Error('Bad physical size');
  if (!monitors.some((m) => m.primary)) monitors[0].primary = true;

  const edges = data.e.map((r) => {
    if (!Array.isArray(r) || r.length !== 5) throw new Error('Bad gap entry');
    const [a, b, dir] = r;
    if (!ns.has(a) || !ns.has(b) || a === b) throw new Error('Gap refers to unknown monitor');
    if (dir !== 'h' && dir !== 'v') throw new Error('Bad gap direction');
    return { a, b, dir, gap: num(r[3], 'gap'), shift: num(r[4], 'shift') };
  });

  return { monitors, edges };
}

// Read the profile from a location.hash string; null if there is none.
export function profileFromHash(hash) {
  const params = new URLSearchParams(hash.replace(/^#/, ''));
  const p = params.get('p');
  return p ? decodeProfile(p) : null;
}

export function hashForProfile(profile) {
  return `#p=${encodeProfile(profile)}`;
}
