import { afterEach, describe, expect, it, vi } from 'vitest';

import { CloseCode } from '../../../src/policies/websocket.js';
import type { TopicProvider } from '../../../src/websocket/topics.js';
import {
  resolveTopicKey,
  topicNameForKey,
  userTopicKey,
} from '../../../src/websocket/authorization.js';
import {
  ClientConnection,
  connectionLifetimeMs,
  type ConnectionSocket,
} from '../../../src/websocket/connection.js';
import {
  checkHeartbeats,
  startHeartbeat,
} from '../../../src/websocket/heartbeat.js';
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

  const connection = new ClientConnection(
    `conn-${userId}`,
    { userId, role: undefined },
    socket,
    { maxBufferedBytes },
  );

  return { socket, connection };
}

describe('parseClientMessage', () => {
  it('accepts a valid subscribe message', () => {
    expect(
      parseClientMessage(
        '{"type":"subscribe","id":"m1","topic":"user.self"}',
      ),
    ).toEqual({
      ok: true,
      message: {
        type: 'subscribe',
        id: 'm1',
        topic: 'user.self',
      },
    });
  });

  it.each([
    ['not JSON', 'hello?', undefined, 'Messages must be JSON.'],
    [
      'an unknown type',
      '{"type":"delete-all","id":"m2"}',
      'm2',
      'Unknown message type.',
    ],
    ['a missing type', '{"id":"m3"}', 'm3', 'Unknown message type.'],
    [
      'a missing topic',
      '{"type":"subscribe","id":"m4"}',
      'm4',
      'Invalid message.',
    ],
    [
      'an unknown field',
      '{"type":"subscribe","id":"m5","topic":"x","admin":true}',
      'm5',
      'Invalid message.',
    ],
    ['a JSON array', '[1,2,3]', undefined, 'Unknown message type.'],
  ])('rejects %s', (_name, raw, id, message) => {
    expect(parseClientMessage(raw)).toEqual({
      ok: false,
      id,
      message,
    });
  });

  it('accepts topics up to 120 characters', () => {
    const topic = `iot.house.${'h'.repeat(110)}`;

    expect(
      parseClientMessage(JSON.stringify({ type: 'subscribe', id: 'm6', topic })),
    ).toMatchObject({ ok: true });
    expect(
      parseClientMessage(JSON.stringify({ type: 'subscribe', id: 'm7', topic: `${topic}x` })),
    ).toMatchObject({ ok: false, message: 'Invalid message.' });
  });

  it('does not echo an oversized message id', () => {
    const raw = JSON.stringify({
      type: 'nope',
      id: 'x'.repeat(65),
    });

    expect(parseClientMessage(raw)).toMatchObject({
      ok: false,
      id: undefined,
    });
  });
});

describe('topic authorization', () => {
  const user = {
    userId: 'user-a',
    role: undefined,
  };

  it('maps user.self to the verified user only', () => {
    expect(resolveTopicKey('user.self', user)).toBe('user:user-a');
  });

  it.each([
    'user.user-b',
    'user:user-b',
    'orders.all',
    '',
    'USER.SELF',
  ])('refuses "%s"', (topic) => {
    expect(resolveTopicKey(topic, user)).toBeNull();
  });

  it('maps the internal user key back to the public topic name', () => {
    expect(topicNameForKey(userTopicKey('user-a'))).toBe('user.self');
  });
});

describe('SubscriptionManager', () => {
  it('delivers user events only to that user', async () => {
    const manager = new SubscriptionManager({
      maxSubscriptionsPerConnection: 20,
    });

    const a = makeConnection('user-a');
    const b = makeConnection('user-b');

    await manager.subscribe(a.connection, 'user.self', '1');
    await manager.subscribe(b.connection, 'user.self', '1');

    expect(
      manager.publish(
        userTopicKey('user-a'),
        'order.filled',
        { orderId: '42' },
      ),
    ).toBe(1);

    expect(a.socket.sent).toEqual([
      expect.objectContaining({
        type: 'event',
        topic: 'user.self',
        event: 'order.filled',
      }),
    ]);

    expect(b.socket.sent).toEqual([]);
  });

  it('enforces the subscription limit, counting each topic once', async () => {
    const manager = new SubscriptionManager({
      maxSubscriptionsPerConnection: 1,
    });

    const { connection } = makeConnection();

    expect(
      await manager.subscribe(connection, 'user.self', '1'),
    ).toMatchObject({
      type: 'subscribed',
    });

    expect(
      await manager.subscribe(connection, 'user.self', '2'),
    ).toMatchObject({
      type: 'subscribed',
    });

    expect(
      await manager.subscribe(connection, 'user.self', '3'),
    ).toMatchObject({
      type: 'subscribed',
    });
  });

  it('stops delivery after unsubscribe and removeAll', async () => {
    const changes: number[] = [];

    const manager = new SubscriptionManager(
      { maxSubscriptionsPerConnection: 20 },
      (delta) => changes.push(delta),
    );

    const { connection } = makeConnection();

    await manager.subscribe(connection, 'user.self', '1');

    manager.unsubscribe(connection, 'user.self', '2');

    expect(
      manager.publish(
        userTopicKey('user-a'),
        'order.filled',
        {},
      ),
    ).toBe(0);

    await manager.subscribe(connection, 'user.self', '3');
    manager.removeAll(connection);

    expect(
      manager.publish(
        userTopicKey('user-a'),
        'order.filled',
        {},
      ),
    ).toBe(0);

    expect(changes).toEqual([1, -1, 1, -1]);
  });
});

describe('ClientConnection', () => {
  it('disconnects a slow client instead of queueing more data', () => {
    const { socket, connection } = makeConnection('user-a', 100);

    socket.bufferedAmount = 101;

    expect(connection.send({ type: 'event' })).toBe(false);

    expect(socket.sent).toEqual([]);

    expect(socket.closed).toEqual({
      code: CloseCode.POLICY_VIOLATION,
      reason: 'Slow consumer',
    });
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

    // Round 1: both connections are pinged.
    checkHeartbeats([alive.connection, dead.connection]);

    expect(alive.socket.pings).toBe(1);
    expect(dead.socket.pings).toBe(1);

    // Only the first connection answers.
    alive.connection.isAlive = true;

    // Round 2: the silent connection is terminated.
    expect(
      checkHeartbeats([alive.connection, dead.connection]),
    ).toBe(1);

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

// Resolves when the test calls the matching resolve/reject, so pending checks can be observed.
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });

  return { promise, resolve, reject };
}

const HOUSE_TOPIC = 'iot.house.h1';

// A provider for "iot.house.*" topics that lets user-a watch any house.
function houseProvider(overrides: Partial<TopicProvider> = {}) {
  const calls: string[] = [];
  const provider: TopicProvider = {
    matches: (topic) => topic.startsWith('iot.house.'),
    authorize: async (topic, user) => (user.userId === 'user-a' ? topic : null),
    onActive: (key) => calls.push(`active:${key}`),
    onIdle: (key) => calls.push(`idle:${key}`),
    ...overrides,
  };

  return { provider, calls };
}

function managerWith(provider: TopicProvider, onHookError?: (error: unknown) => void) {
  const manager = new SubscriptionManager(
    { maxSubscriptionsPerConnection: 20 },
    () => {},
    onHookError,
  );

  manager.registerTopicProvider(provider);

  return manager;
}

describe('topic providers', () => {
  it('subscribes when the provider allows the topic, and delivers its events', async () => {
    const manager = managerWith(houseProvider().provider);
    const { socket, connection } = makeConnection('user-a');

    expect(await manager.subscribe(connection, HOUSE_TOPIC, '1')).toMatchObject({
      type: 'subscribed',
      id: '1',
      topic: HOUSE_TOPIC,
    });
    expect(manager.publish(HOUSE_TOPIC, 'reading', { seq: 1 })).toBe(1);
    expect(socket.sent).toEqual([
      expect.objectContaining({ type: 'event', topic: HOUSE_TOPIC, event: 'reading' }),
    ]);
  });

  it('refuses the topic when the provider does not allow it', async () => {
    const manager = managerWith(houseProvider().provider);
    const { connection } = makeConnection('user-b');

    expect(await manager.subscribe(connection, HOUSE_TOPIC, '1')).toMatchObject({
      type: 'error',
      id: '1',
      code: 'TOPIC_NOT_ALLOWED',
    });
    expect(manager.publish(HOUSE_TOPIC, 'reading', {})).toBe(0);
  });

  it('answers TOPIC_UNAVAILABLE when the check cannot run', async () => {
    const manager = managerWith(
      houseProvider({
        authorize: async () => {
          throw new Error('IoT service unavailable');
        },
      }).provider,
    );
    const { connection } = makeConnection('user-a');

    expect(await manager.subscribe(connection, HOUSE_TOPIC, '1')).toMatchObject({
      type: 'error',
      id: '1',
      code: 'TOPIC_UNAVAILABLE',
    });
  });

  it('refuses topics no provider handles', async () => {
    const manager = managerWith(houseProvider().provider);
    const { connection } = makeConnection('user-a');

    expect(await manager.subscribe(connection, 'market.summary', '1')).toMatchObject({
      code: 'TOPIC_NOT_ALLOWED',
    });
  });

  it('does not ask the provider again for a topic already subscribed', async () => {
    let checks = 0;
    const manager = managerWith(
      houseProvider({
        authorize: async (topic) => {
          checks += 1;
          return topic;
        },
      }).provider,
    );
    const { connection } = makeConnection('user-a');

    await manager.subscribe(connection, HOUSE_TOPIC, '1');
    expect(await manager.subscribe(connection, HOUSE_TOPIC, '2')).toMatchObject({
      type: 'subscribed',
      id: '2',
    });
    expect(checks).toBe(1);
  });

  it('enforces the subscription limit before asking the provider', async () => {
    let checks = 0;
    const manager = new SubscriptionManager({ maxSubscriptionsPerConnection: 1 });
    manager.registerTopicProvider(
      houseProvider({
        authorize: async (topic) => {
          checks += 1;
          return topic;
        },
      }).provider,
    );
    const { connection } = makeConnection('user-a');

    await manager.subscribe(connection, 'iot.house.h1', '1');
    expect(await manager.subscribe(connection, 'iot.house.h2', '2')).toMatchObject({
      code: 'TOO_MANY_SUBSCRIPTIONS',
    });
    expect(checks).toBe(1);
  });

  it('drops the result when the connection closed during the check', async () => {
    const pending = deferred<string | null>();
    const { provider, calls } = houseProvider({ authorize: () => pending.promise });
    const manager = managerWith(provider);
    const { socket, connection } = makeConnection('user-a');

    const reply = manager.subscribe(connection, HOUSE_TOPIC, '1');
    socket.close();
    manager.removeAll(connection);
    pending.resolve(HOUSE_TOPIC);

    expect(await reply).toBeNull();
    expect(connection.topics.size).toBe(0);
    expect(manager.publish(HOUSE_TOPIC, 'reading', {})).toBe(0);
    expect(calls).toEqual([]);
  });

  it('calls onActive for the first local subscriber and onIdle when the last one leaves', async () => {
    const { provider, calls } = houseProvider();
    const manager = managerWith(provider);
    const first = makeConnection('user-a');
    const second = makeConnection('user-a');

    await manager.subscribe(first.connection, HOUSE_TOPIC, '1');
    await manager.subscribe(second.connection, HOUSE_TOPIC, '1');
    expect(calls).toEqual([`active:${HOUSE_TOPIC}`]);

    manager.unsubscribe(first.connection, HOUSE_TOPIC, '2');
    expect(calls).toEqual([`active:${HOUSE_TOPIC}`]);

    manager.removeAll(second.connection);
    expect(calls).toEqual([`active:${HOUSE_TOPIC}`, `idle:${HOUSE_TOPIC}`]);

    await manager.subscribe(first.connection, HOUSE_TOPIC, '3');
    expect(calls).toEqual([
      `active:${HOUSE_TOPIC}`,
      `idle:${HOUSE_TOPIC}`,
      `active:${HOUSE_TOPIC}`,
    ]);
  });

  it('reports a failing hook instead of breaking the subscription', async () => {
    const errors: unknown[] = [];
    const manager = managerWith(
      houseProvider({
        onActive: () => {
          throw new Error('upstream failed');
        },
        onIdle: () => {
          throw new Error('close failed');
        },
      }).provider,
      (error) => errors.push(error),
    );
    const { connection } = makeConnection('user-a');

    expect(await manager.subscribe(connection, HOUSE_TOPIC, '1')).toMatchObject({
      type: 'subscribed',
    });
    expect(manager.publish(HOUSE_TOPIC, 'reading', {})).toBe(1);
    manager.removeAll(connection);

    expect(errors).toHaveLength(2);
    expect(manager.publish(HOUSE_TOPIC, 'reading', {})).toBe(0);
  });

  it('keeps user.self on the built-in path even with providers registered', async () => {
    const manager = managerWith(
      houseProvider({ matches: () => true, authorize: async () => null }).provider,
    );
    const { connection } = makeConnection('user-a');

    expect(await manager.subscribe(connection, 'user.self', '1')).toMatchObject({
      type: 'subscribed',
    });
  });
});

describe('ClientConnection.enqueue', () => {
  it('runs tasks one at a time in the order they arrived', async () => {
    const { connection } = makeConnection();
    const order: string[] = [];
    const slow = deferred<void>();

    const first = connection.enqueue(async () => {
      await slow.promise;
      order.push('first');
    });
    const second = connection.enqueue(async () => {
      order.push('second');
    });

    await Promise.resolve();
    expect(order).toEqual([]);

    slow.resolve();
    await Promise.all([first, second]);
    expect(order).toEqual(['first', 'second']);
  });

  it('keeps going after a task fails', async () => {
    const { connection } = makeConnection();

    await expect(
      connection.enqueue(async () => {
        throw new Error('boom');
      }),
    ).rejects.toThrow('boom');
    await expect(connection.enqueue(async () => 'ok')).resolves.toBe('ok');
  });
});

describe('maximum connection age', () => {
  it('spreads lifetimes within 10% either side of the maximum age', () => {
    expect(connectionLifetimeMs(900_000, () => 0)).toBe(810_000);
    expect(connectionLifetimeMs(900_000, () => 0.5)).toBe(900_000);
    expect(connectionLifetimeMs(900_000, () => 1)).toBe(990_000);
  });
});
