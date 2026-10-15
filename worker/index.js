// Seamscape Worker: static assets, plus the live link between the phone and
// the desktop (Phase 3). Only /relay/<session> reaches this script (see
// run_worker_first in wrangler.jsonc); every other path is a static asset.
//
// Each session is one Durable Object holding the open WebSockets. It uses
// the hibernation API, so an idle session costs nothing, and it stores
// nothing: messages are passed on and forgotten.

import { DurableObject } from 'cloudflare:workers';
import { MAX_SOCKETS, peersMessage, relaySession, ROLES, route } from './protocol.js';

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const session = relaySession(url.pathname);
    if (!session) return env.ASSETS.fetch(request);
    if (request.headers.get('Upgrade') !== 'websocket') {
      return new Response('Expected a WebSocket', { status: 426 });
    }
    // Only Seamscape's own pages may open the link.
    if (request.headers.get('Origin') !== url.origin) {
      return new Response('Forbidden', { status: 403 });
    }
    if (!ROLES.includes(url.searchParams.get('role'))) {
      return new Response('Unknown role', { status: 400 });
    }
    const stub = env.RELAY.get(env.RELAY.idFromName(session));
    return stub.fetch(request);
  },
};

export class Relay extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    // Keep-alive pings are answered without waking the object.
    ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair('ping', 'pong'));
  }

  // Sockets still open, leaving out one that is closing right now (it is
  // still listed while its close handler runs).
  sockets(role, leaving = null) {
    return this.ctx.getWebSockets(role).filter((ws) => ws !== leaving);
  }

  announce(leaving = null) {
    const msg = peersMessage(Object.fromEntries(ROLES.map((r) => [r, this.sockets(r, leaving).length])));
    for (const ws of this.sockets(undefined, leaving)) {
      try { ws.send(msg); } catch { /* closing */ }
    }
  }

  async fetch(request) {
    const role = new URL(request.url).searchParams.get('role');
    if (this.ctx.getWebSockets(role).length >= MAX_SOCKETS[role]) {
      return new Response('Too many connections', { status: 429 });
    }
    const [client, server] = Object.values(new WebSocketPair());
    this.ctx.acceptWebSocket(server, [role]);
    this.announce();
    return new Response(null, { status: 101, webSocket: client });
  }

  async webSocketMessage(ws, message) {
    const [role] = this.ctx.getTags(ws);
    const out = route(role, typeof message === 'string' ? message : null);
    if (!out) return;
    for (const peer of this.ctx.getWebSockets(out.to)) {
      try { peer.send(out.data); } catch { /* closing */ }
    }
  }

  async webSocketClose(ws, code) {
    try { ws.close(code === 1005 ? 1000 : code, 'bye'); } catch { /* already closed */ }
    this.announce(ws);
  }

  async webSocketError(ws) {
    this.announce(ws);
  }
}
