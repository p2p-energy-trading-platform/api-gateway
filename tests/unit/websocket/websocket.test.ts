import { afterEach, describe, expect, it, vi } from 'vitest';

import { CloseCode } from '../../../src/policies/websocket.js';
import {
  resolveTopicKey,
  topicNameForKey,
  userTopicKey,
} from '../../../src/websocket/authorization.js';
import { ClientConnection, type ConnectionSocket } from '../../../src/websocket/connection.js';
import { checkHeartbeats, startHeartbeat } from '../../../src/websocket/heartbeat.js';
import { parseClientMessage } from '../../../src/websocket/protocol.js';
import { SubscriptionManager } from '../../../src/websocket/subscriptions.js';

class FakeSocket implements ConnectionSocket {
  readyState = 1;
  bufferedAmount = 0;
  sent: unknown[] = [];
  closed: { code: number | undefined; reason: string | undefined } | undefined;
  pings = 0;
  terminated = false;

  send(data: string): void {
    this.sent.push(JSON.parse(data));
  }

  close(code?: number, reason?: string): void {
    this.closed = { code, reason };
    this.readyState = 3;
  }

  ping(): void {
    this.pings += 1;
  }

  terminate(): void {
    this.terminated = true;
  }
}

function makeConnection(userId = 'user-a', maxBufferedBytes = 1024) {
  const socket = new FakeSocket();
  const connection = new ClientConnection(`conn-${userId}`, { userId, role: undefined }, socket, {
    maxBufferedBytes,
  });

  return { socket, connection };
}

describe('parseClientMessage', () => {
  it('accepts a valid subscribe message', () => {
    expect(parseClientMessage('{"type":"subscribe","id":"m1","topic":"user.self"}')).toEqual({
      ok: true,
      message: { type: 'subscribe', id: 'm1', topic: 'user.self' },
    });
  });

  it.each([
    ['not JSON', 'hello?', undefined, 'Messages must be JSON.'],
    ['an unknown type', '{"type":"delete-all","id":"m2"}', 'm2', 'Unknown message type.'],
    ['a missing type', '{"id":"m3"}', 'm3', 'Unknown message type.'],
    ['a missing topic', '{"type":"subscribe","id":"m4"}', 'm4', 'Invalid message.'],
    [
      'an unknown field',
      '{"type":"subscribe","id":"m5","topic":"x","admin":true}',
      'm5',
      'Invalid message.',
    ],
    ['a JSON array', '[1,2,3]', undefined, 'Unknown message type.'],
  ])('rejects %s', (_name, raw, id, message) => {
    expect(parseClientMessage(raw)).toEqual({ ok: false, id, message });
  });

  it('does not echo an oversized message id', () => {
    const raw = JSON.stringify({ type: 'nope', id: 'x'.repeat(65) });

    expect(parseClientMessage(raw)).toMatchObject({ ok: false, id: undefined });
  });
});

describe('topic authorization', () => {
  const user = { userId: 'user-a', role: undefined };

  it('maps user.self to the verified user only', () => {
    expect(resolveTopicKey('user.self', user)).toBe('user:user-a');
  });

  it('allows the shared market topic', () => {
    expect(resolveTopicKey('market.summary', user)).toBe('market.summary');
  });

  it.each(['user.user-b', 'user:user-b', 'orders.all', '', 'USER.SELF'])(
    'refuses "%s"',
    (topic) => {
      expect(resolveTopicKey(topic, user)).toBeNull();
    },
  );

  it('shows clients the topic name they subscribed with', () => {
    expect(topicNameForKey(userTopicKey('user-a'))).toBe('user.self');
    expect(topicNameForKey('market.summary')).toBe('market.summary');
  });
});

describe('SubscriptionManager', () => {
  it('delivers user events only to that user', () => {
    const manager = new SubscriptionManager({ maxSubscriptionsPerConnection: 20 });
    const a = makeConnection('user-a');
    const b = makeConnection('user-b');

    manager.subscribe(a.connection, 'user.self', '1');
    manager.subscribe(b.connection, 'user.self', '1');

    expect(manager.publish(userTopicKey('user-a'), 'order.filled', { orderId: '42' })).toBe(1);
    expect(a.socket.sent).toEqual([
      expect.objectContaining({ type: 'event', topic: 'user.self', event: 'order.filled' }),
    ]);
    expect(b.socket.sent).toEqual([]);
  });

  it('enforces the subscription limit, counting each topic once', () => {
    const manager = new SubscriptionManager({ maxSubscriptionsPerConnection: 1 });
    const { connection } = makeConnection();

    expect(manager.subscribe(connection, 'user.self', '1')).toMatchObject({ type: 'subscribed' });
    expect(manager.subscribe(connection, 'user.self', '2')).toMatchObject({ type: 'subscribed' });
    expect(manager.subscribe(connection, 'market.summary', '3')).toMatchObject({
      type: 'error',
      code: 'TOO_MANY_SUBSCRIPTIONS',
    });
  });

  it('stops delivery after unsubscribe and after removeAll, and reports changes', () => {
    const changes: number[] = [];
    const manager = new SubscriptionManager({ maxSubscriptionsPerConnection: 20 }, (delta) =>
      changes.push(delta),
    );
    const { connection } = makeConnection();

    manager.subscribe(connection, 'market.summary', '1');
    manager.subscribe(connection, 'user.self', '2');
    manager.unsubscribe(connection, 'market.summary', '3');
    manager.removeAll(connection);

    expect(manager.publish('market.summary', 'price', {})).toBe(0);
    expect(manager.publish(userTopicKey('user-a'), 'x', {})).toBe(0);
    expect(changes).toEqual([1, 1, -1, -1]);
  });
});

describe('ClientConnection', () => {
  it('disconnects a slow client instead of queueing more data', () => {
    const { socket, connection } = makeConnection('user-a', 100);
    socket.bufferedAmount = 101;

    expect(connection.send({ type: 'event' })).toBe(false);
    expect(socket.sent).toEqual([]);
    expect(socket.closed).toEqual({ code: CloseCode.POLICY_VIOLATION, reason: 'Slow consumer' });
  });

  it('does not send on a closed socket', () => {
    const { socket, connection } = makeConnection();
    socket.readyState = 3;

    expect(connection.send({ type: 'event' })).toBe(false);
  });
});

describe('heartbeat', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('pings live connections and terminates the ones that did not answer', () => {
    const alive = makeConnection('user-a');
    const dead = makeConnection('user-b');

    // Round 1: both pinged.
    checkHeartbeats([alive.connection, dead.connection]);
    expect(alive.socket.pings).toBe(1);
    expect(dead.socket.pings).toBe(1);

    // Only the first answers (the pong handler sets isAlive).
    alive.connection.isAlive = true;

    // Round 2: the silent one is terminated.
    expect(checkHeartbeats([alive.connection, dead.connection])).toBe(1);
    expect(dead.socket.terminated).toBe(true);
    expect(alive.socket.terminated).toBe(false);
  });

  it('runs on an interval until stopped', () => {
    vi.useFakeTimers();
    const { socket, connection } = makeConnection();
    const stop = startHeartbeat(() => [connection], 30_000);

    vi.advanceTimersByTime(30_000);
    expect(socket.pings).toBe(1);

    vi.advanceTimersByTime(30_000);
    expect(socket.terminated).toBe(true);

    stop();
    vi.advanceTimersByTime(60_000);
    expect(socket.pings).toBe(1);
  });
});
