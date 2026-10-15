// Browser side of the live link: one WebSocket to /relay/<session>, kept
// open with pings and reopened after a drop. What travels is described in
// worker/protocol.js; measurements are sealed first (relay-crypto.js).

const PING_MS = 25000;
const MAX_RETRIES = 6;

export function relayUrl(origin, id, role) {
  return `${origin.replace(/^http/, 'ws')}/relay/${id}?role=${role}`;
}

// handlers: { onMessage(msg), onState(state) } with state one of
// 'connecting' | 'open' | 'closed' | 'unavailable' (gave up retrying).
// Returns { send(msg) -> boolean, close() }.
export function connectRelay(id, role, { onMessage = () => {}, onState = () => {} } = {}) {
  let ws = null;
  let stopped = false;
  let retries = 0;
  let retryTimer = 0;
  let pingTimer = 0;

  const retry = () => {
    if (stopped) return;
    retries += 1;
    if (retries > MAX_RETRIES) {
      onState('unavailable');
      return;
    }
    retryTimer = setTimeout(open, Math.min(30000, 500 * 2 ** retries));
  };

  function open() {
    onState('connecting');
    try {
      ws = new WebSocket(relayUrl(location.origin, id, role));
    } catch {
      retry();
      return;
    }
    ws.onopen = () => {
      retries = 0;
      onState('open');
      pingTimer = setInterval(() => { if (ws.readyState === WebSocket.OPEN) ws.send('ping'); }, PING_MS);
    };
    ws.onmessage = (e) => {
      if (e.data === 'pong') return;
      let msg;
      try { msg = JSON.parse(e.data); } catch { return; }
      onMessage(msg);
    };
    ws.onclose = () => {
      clearInterval(pingTimer);
      if (stopped) return;
      onState('closed');
      retry();
    };
  }

  open();
  return {
    send(msg) {
      if (ws?.readyState !== WebSocket.OPEN) return false;
      ws.send(JSON.stringify(msg));
      return true;
    },
    close() {
      stopped = true;
      clearTimeout(retryTimer);
      clearInterval(pingTimer);
      ws?.close();
    },
  };
}
