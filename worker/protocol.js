// The live link's message rules. Pure functions only, shared by the Worker
// and the tests.
//
// A session has desktop sockets and phone sockets. The relay passes on:
//   phone   -> desktop  { type: 'result', box }        a sealed measurement
//   desktop -> phone    { type: 'received' | 'rejected' }
// and tells everyone who is there: { type: 'peers', desktop, phone }.
// Boxes are sealed end to end (public/js/relay-crypto.js); the relay cannot
// open them and keeps nothing. Anything else is dropped.

export const ROLES = ['desktop', 'phone'];
export const MAX_SOCKETS = { desktop: 2, phone: 4 };
export const MAX_MESSAGE = 8192;

const SESSION = /^\/relay\/([A-Za-z0-9_-]{22})$/;
const BOX = /^[A-Za-z0-9_-]+$/;

// The session id from a request path, or null if it is not a relay path.
export function relaySession(pathname) {
  const m = SESSION.exec(pathname);
  return m ? m[1] : null;
}

// Where a message from a socket with this role goes: { to, data } or null.
export function route(role, raw) {
  if (typeof raw !== 'string' || raw.length > MAX_MESSAGE) return null;
  let msg;
  try {
    msg = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!msg || typeof msg !== 'object') return null;
  if (role === 'phone' && msg.type === 'result' && typeof msg.box === 'string' && BOX.test(msg.box)) {
    return { to: 'desktop', data: JSON.stringify({ type: 'result', box: msg.box }) };
  }
  if (role === 'desktop' && (msg.type === 'received' || msg.type === 'rejected')) {
    return { to: 'phone', data: JSON.stringify({ type: msg.type }) };
  }
  return null;
}

export function peersMessage(counts) {
  return JSON.stringify({ type: 'peers', desktop: counts.desktop || 0, phone: counts.phone || 0 });
}
