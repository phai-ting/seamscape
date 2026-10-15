// End-to-end encryption for the live link between phone and desktop.
// Pure functions on Web Crypto (browsers and Node), no DOM.
//
// The desktop makes a random 128-bit key and puts it in the QR code's
// fragment (#...&k=...), which browsers never send to a server. Both sides
// derive the relay session id from the key with SHA-256, so the relay sees
// the id but cannot work back to the key, and it forwards only sealed boxes
// it cannot open: AES-GCM with a fresh 96-bit IV each time.

const KEY_BYTES = 16;
const IV_BYTES = 12;
export const KEY_PATTERN = /^[A-Za-z0-9_-]{22}$/;
export const SESSION_PATTERN = /^[A-Za-z0-9_-]{22}$/;

function toBase64Url(bytes) {
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(text) {
  const b64 = text.replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(b64 + '='.repeat((4 - (b64.length % 4)) % 4));
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}

export function newSessionKey() {
  return toBase64Url(crypto.getRandomValues(new Uint8Array(KEY_BYTES)));
}

function keyBytes(key) {
  if (!KEY_PATTERN.test(key)) throw new Error('Bad session key');
  return fromBase64Url(key);
}

// The relay session id: the first 16 bytes of SHA-256 over the key.
export async function sessionId(key) {
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', keyBytes(key)));
  return toBase64Url(digest.slice(0, 16));
}

function aesKey(key, usage) {
  return crypto.subtle.importKey('raw', keyBytes(key), 'AES-GCM', false, [usage]);
}

// Seal any JSON value. Returns base64url(iv || ciphertext).
export async function seal(key, value) {
  const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES));
  const data = new TextEncoder().encode(JSON.stringify(value));
  const box = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await aesKey(key, 'encrypt'), data));
  const out = new Uint8Array(IV_BYTES + box.length);
  out.set(iv);
  out.set(box, IV_BYTES);
  return toBase64Url(out);
}

// Open a sealed box. Throws if it was made with another key or altered.
export async function unseal(key, text) {
  const bytes = fromBase64Url(text);
  if (bytes.length <= IV_BYTES) throw new Error('Damaged message');
  const plain = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: bytes.slice(0, IV_BYTES) },
    await aesKey(key, 'decrypt'),
    bytes.slice(IV_BYTES),
  );
  return JSON.parse(new TextDecoder().decode(plain));
}
