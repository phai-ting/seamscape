import { test } from 'node:test';
import assert from 'node:assert/strict';
import { KEY_PATTERN, newSessionKey, seal, sessionId, unseal, SESSION_PATTERN } from '../public/js/relay-crypto.js';
import { MAX_MESSAGE, peersMessage, relaySession, route } from '../worker/protocol.js';

test('session keys are random and give a fixed session id', async () => {
  const a = newSessionKey(), b = newSessionKey();
  assert.match(a, KEY_PATTERN);
  assert.notEqual(a, b);
  const id = await sessionId(a);
  assert.match(id, SESSION_PATTERN);
  assert.equal(await sessionId(a), id);
  assert.notEqual(await sessionId(b), id);
  assert.notEqual(id, a, 'the id does not reveal the key');
  await assert.rejects(() => sessionId('short'), /Bad session key/);
});

test('sealed boxes open only with their key and are not reused', async () => {
  const key = newSessionKey();
  const value = { v: 1, s: '2_2560x1440+0+0@597.7p', p: '1.abc' };
  const box = await seal(key, value);
  assert.match(box, /^[A-Za-z0-9_-]+$/);
  assert.ok(!box.includes('2560'), 'the relay cannot read the numbers');
  assert.deepEqual(await unseal(key, box), value);
  assert.notEqual(await seal(key, value), box, 'a fresh IV each time');
  await assert.rejects(() => unseal(newSessionKey(), box));
  const tampered = box.slice(0, -2) + (box.at(-2) === 'A' ? 'B' : 'A') + box.at(-1);
  await assert.rejects(() => unseal(key, tampered));
});

test('relaySession accepts only well-formed relay paths', () => {
  assert.equal(relaySession('/relay/abcdefghijklmnopqrstuv'), 'abcdefghijklmnopqrstuv');
  assert.equal(relaySession('/relay/short'), null);
  assert.equal(relaySession('/relay/abcdefghijklmnopqrstuv/x'), null);
  assert.equal(relaySession('/index.html'), null);
});

test('route passes results to the desktop and receipts to the phone', () => {
  assert.deepEqual(route('phone', JSON.stringify({ type: 'result', box: 'QUJD_-1', extra: 'dropped' })),
    { to: 'desktop', data: '{"type":"result","box":"QUJD_-1"}' });
  assert.deepEqual(route('desktop', '{"type":"received"}'), { to: 'phone', data: '{"type":"received"}' });
  assert.deepEqual(route('desktop', '{"type":"rejected"}'), { to: 'phone', data: '{"type":"rejected"}' });
});

test('route drops everything else', () => {
  assert.equal(route('desktop', JSON.stringify({ type: 'result', box: 'abc' })), null, 'desktops cannot send results');
  assert.equal(route('phone', '{"type":"received"}'), null, 'phones cannot send receipts');
  assert.equal(route('phone', JSON.stringify({ type: 'result', box: '<script>' })), null);
  assert.equal(route('phone', JSON.stringify({ type: 'result', box: 'a'.repeat(MAX_MESSAGE) })), null);
  assert.equal(route('phone', 'not json'), null);
  assert.equal(route('phone', 'null'), null);
  assert.equal(route('phone', null), null);
  assert.equal(route('intruder', '{"type":"received"}'), null);
});

test('peersMessage counts both roles', () => {
  assert.equal(peersMessage({ desktop: 1 }), '{"type":"peers","desktop":1,"phone":0}');
});
