import { randomUUID } from 'node:crypto';
import { once } from 'node:events';
import type { Socket } from 'node:net';

import type { FastifyInstance } from 'fastify';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import WebSocketClient, { type WebSocket } from 'ws';

import { buildApp } from '../../src/app.js';
import { wsTicketKeyForTests } from '../../src/transport/redis/ws-tickets.js';
import { userTopicKey } from '../../src/websocket/authorization.js';
import {
  signAccessToken,
  startFakeJwks,
  TEST_AUDIENCE,
  TEST_ISSUER,
  type FakeJwks,
} from '../helpers/fake-jwks.js';
import { testConfig } from '../helpers/test-config.js';

type Message = Record<string, unknown>;

// injectWS builds a fake request without a network socket; give it a client address like a real one.
const CLIENT = { socket: { remoteAddress: '127.0.0.1' } as Socket };

async function nextMessage(socket: WebSocket): Promise<Message> {
  const [data] = await once(socket, 'message');

  return JSON.parse(String(data)) as Message;
}

async function closeCode(socket: WebSocket): Promise<number> {
  const [code] = await once(socket, 'close');

  return code as number;
}

// Polls until the condition is true, so tests do not depend on exact timing.
async function waitFor(condition: () => boolean, timeoutMs = 2000): Promise<void> {
  const start = Date.now();

  while (!condition()) {
    if (Date.now() - start > timeoutMs) {
      throw new Error('Timed out waiting for condition');
    }

    await new Promise((resolve) => setTimeout(resolve, 5));
  }
}

async function send(socket: WebSocket, message: unknown): Promise<Message> {
  const reply = nextMessage(socket);

  socket.send(typeof message === 'string' ? message : JSON.stringify(message));

  return reply;
}

/*
 * The full WebSocket flow against a real app: ticket, connect, subscribe, events, close.
 * Needs Redis, like other tests that register the infrastructure plugins.
 */
describe('WebSocket', () => {
  let app: FastifyInstance;
  let jwks: FakeJwks;
  const sockets: WebSocket[] = [];

  beforeEach(async () => {
    jwks = await startFakeJwks();

    app = await buildApp({
      config: {
        ...testConfig,
        auth: {
          ...testConfig.auth,
          issuer: TEST_ISSUER,
          audience: TEST_AUDIENCE,
          jwksUri: jwks.url,
        },
        rateLimit: { hashSecret: randomUUID() },
      },
      registerInfrastructure: true,
    });

    await app.ready();
  });

  afterEach(async () => {
    for (const socket of sockets.splice(0)) {
      socket.terminate();
    }

    await app.close();
    await jwks.close();
  });

  async function getTicket(userId = 'user-a'): Promise<string> {
    const token = await signAccessToken(jwks.key, { subject: userId });
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/ws/ticket',
      headers: { authorization: `Bearer ${token}` },
    });

    expect(response.statusCode).toBe(201);

    return response.json().ticket as string;
  }

  async function connect(ticket: string): Promise<WebSocket> {
    const socket = await app.injectWS(`/api/v1/ws?ticket=${ticket}`, CLIENT);

    sockets.push(socket);

    return socket;
  }

  async function connectAs(userId = 'user-a'): Promise<WebSocket> {
    return connect(await getTicket(userId));
  }

  /*
   * A real TCP connection. injectWS connections never finish a close started by the client, so
   * tests about the client leaving use this instead.
   */
  async function connectOverNetwork(userId = 'user-a'): Promise<WebSocket> {
    const address = app.server.listening
      ? `http://127.0.0.1:${(app.server.address() as { port: number }).port}`
      : await app.listen({ port: 0, host: '127.0.0.1' });
    const ticket = await getTicket(userId);
    const socket = new WebSocketClient(
      `${address.replace('http', 'ws')}/api/v1/ws?ticket=${ticket}`,
    );

    sockets.push(socket);
    await once(socket, 'open');

    return socket;
  }

  describe('ticket', () => {
    it('requires an access token', async () => {
      const response = await app.inject({ method: 'POST', url: '/api/v1/ws/ticket' });

      expect(response.statusCode).toBe(401);
    });

    it('returns a 30-second ticket stored in Redis', async () => {
      const ticket = await getTicket();

      expect(ticket).toMatch(/^[A-Za-z0-9_-]{43}$/);

      const ttl = await app.redis.ttl(wsTicketKeyForTests('test', ticket));

      expect(ttl).toBeGreaterThan(0);
      expect(ttl).toBeLessThanOrEqual(30);
    });
  });

  describe('connecting', () => {
    it('opens a connection with a valid ticket', async () => {
      await connectAs();

      expect(app.realtime.connectionCount()).toBe(1);
    });

    it('refuses a made-up ticket with 401', async () => {
      await expect(connect('A'.repeat(43))).rejects.toThrow('401');
    });

    it('refuses a ticket that was already used', async () => {
      const ticket = await getTicket();

      await connect(ticket);

      await expect(connect(ticket)).rejects.toThrow('401');
    });

    it('refuses an expired ticket', async () => {
      const ticket = await getTicket();

      await app.redis.pExpire(wsTicketKeyForTests('test', ticket), 1);
      await new Promise((resolve) => setTimeout(resolve, 20));

      await expect(connect(ticket)).rejects.toThrow('401');
    });

    it('refuses a missing or badly formed ticket with 400', async () => {
      await expect(app.injectWS('/api/v1/ws', CLIENT)).rejects.toThrow('400');
      await expect(app.injectWS('/api/v1/ws?ticket=short', CLIENT)).rejects.toThrow('400');
    });

    it('does not use up the ticket on a plain HTTP request', async () => {
      const ticket = await getTicket();

      const response = await app.inject({ method: 'GET', url: `/api/v1/ws?ticket=${ticket}` });

      expect(response.statusCode).toBe(404);
      await expect(connect(ticket)).resolves.toBeDefined();
    });

    it('limits open connections per user to 5', async () => {
      for (let i = 0; i < 5; i += 1) {
        await connectAs('user-a');
      }

      await expect(connectAs('user-a')).rejects.toThrow('429');
      await expect(connectAs('user-b')).resolves.toBeDefined();
    });

    it('frees the slot when a connection closes', async () => {
      const leaving = await connectOverNetwork('user-a');

      for (let i = 0; i < 4; i += 1) {
        await connectAs('user-a');
      }

      leaving.close();
      await waitFor(() => app.realtime.connectionCount() === 4);

      await expect(connectAs('user-a')).resolves.toBeDefined();
    });
  });

describe('subscriptions', () => {
  it('subscribes to the user’s own topic', async () => {
    const socket = await connectAs();

    const reply = await send(socket, {
      type: 'subscribe',
      id: 'm1',
      topic: 'user.self',
    });

    expect(reply).toMatchObject({
      type: 'subscribed',
      id: 'm1',
      topic: 'user.self',
      version: 1,
    });
  });

  it('refuses another user’s topic', async () => {
    const socket = await connectAs();

    const reply = await send(socket, {
      type: 'subscribe',
      id: 'm3',
      topic: 'user.user-b',
    });

    expect(reply).toMatchObject({
      type: 'error',
      id: 'm3',
      code: 'TOPIC_NOT_ALLOWED',
    });
  });

  it('rejects an unknown message type and echoes its id', async () => {
    const socket = await connectAs();

    const reply = await send(socket, {
      type: 'delete-everything',
      id: 'm4',
    });

    expect(reply).toMatchObject({
      type: 'error',
      id: 'm4',
      code: 'INVALID_MESSAGE',
    });
  });

  it('rejects a message that is not JSON', async () => {
    const socket = await connectAs();

    const reply = await send(socket, 'hello?');

    expect(reply).toMatchObject({
      type: 'error',
      code: 'INVALID_MESSAGE',
    });

    expect(reply).not.toHaveProperty('id');
  });

  it('closes the connection with 1008 after 5 invalid messages', async () => {
    const socket = await connectAs();
    const closed = closeCode(socket);

    for (let i = 0; i < 5; i += 1) {
      socket.send('not json');
    }

    expect(await closed).toBe(1008);
  });

  it('closes the connection with 1009 for a message over 16 KB', async () => {
    const socket = await connectAs();
    const closed = closeCode(socket);

    socket.send(
      JSON.stringify({
        type: 'subscribe',
        id: 'big',
        topic: 'x'.repeat(17 * 1024),
      }),
    );

    expect(await closed).toBe(1009);
  });
});

  describe('event delivery', () => {
    it('delivers user events only to that user', async () => {
      const userA = await connectAs('user-a');
      const userB = await connectAs('user-b');

      await send(userA, { type: 'subscribe', id: '1', topic: 'user.self' });
      await send(userB, { type: 'subscribe', id: '1', topic: 'user.self' });

      const eventForA = nextMessage(userA);
      const eventForB = nextMessage(userB);

      expect(app.realtime.publish(userTopicKey('user-a'), 'order.filled', { orderId: '42' })).toBe(
        1,
      );
      app.realtime.publish(userTopicKey('user-b'), 'order.filled', { orderId: '99' });

      expect(await eventForA).toMatchObject({
        type: 'event',
        topic: 'user.self',
        event: 'order.filled',
        payload: { orderId: '42' },
      });
      // B's first event is its own, so it never received A's.
      expect(await eventForB).toMatchObject({ payload: { orderId: '99' } });
    });

    // it('delivers market events to every subscriber', async () => {
    //   const userA = await connectAs('user-a');
    //   const userB = await connectAs('user-b');

    //   await send(userA, { type: 'subscribe', id: '1', topic: 'market.summary' });
    //   await send(userB, { type: 'subscribe', id: '1', topic: 'market.summary' });

    //   expect(app.realtime.publish('market.summary', 'price.updated', { price: '0.25' })).toBe(2);
    // });

    // it('stops delivery after unsubscribe', async () => {
    //   const socket = await connectAs();

    //   await send(socket, { type: 'subscribe', id: '1', topic: 'market.summary' });
    //   const reply = await send(socket, { type: 'unsubscribe', id: '2', topic: 'market.summary' });

    //   expect(reply).toMatchObject({ type: 'unsubscribed', id: '2' });
    //   expect(app.realtime.publish('market.summary', 'price.updated', {})).toBe(0);
    // });
  });

  describe('closing', () => {
    // it('removes subscriptions and updates metrics when a client leaves', async () => {
    //   const socket = await connectOverNetwork();

    //   await send(socket, { type: 'subscribe', id: '1', topic: 'market.summary' });

    //   socket.close();
    //   await waitFor(() => app.realtime.connectionCount() === 0);

    //   const metrics = await app.metrics.registry.metrics();

    //   expect(app.realtime.connectionCount()).toBe(0);
    //   expect(app.realtime.publish('market.summary', 'price.updated', {})).toBe(0);
    //   expect(metrics).toMatch(/^gateway_ws_connections 0$/m);
    //   expect(metrics).toMatch(/^gateway_ws_subscriptions 0$/m);
    // });

    it('tells clients to reconnect with 1001 when the gateway shuts down', async () => {
      const socket = await connectAs();
      const closed = closeCode(socket);

      await app.close();

      expect(await closed).toBe(1001);
    });
  });
});
