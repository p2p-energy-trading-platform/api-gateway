import { create } from '@bufbuild/protobuf';
import { timestampFromDate } from '@bufbuild/protobuf/wkt';
import { Code, ConnectError } from '@connectrpc/connect';
import {
  AssetType,
  MeterStatus,
  StreamHouseLiveResponseSchema,
  type StreamHouseLiveResponse,
} from '@p2p-energy-trading-platform/typescript-sdk/gen/gridx/iot/v1/iot_pb';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { AppError } from '../../../src/errors/app-error.js';
import { IotLiveFeed, type LiveIotClient } from '../../../src/features/iot/live.js';

const HOUSE = 'grid01-house0042';
const TOPIC = `iot.house.${HOUSE}`;
const MEASURED_AT = new Date('2026-11-20T09:30:05.000Z');
const user = { userId: 'user-a', role: undefined };

// An upstream stream the test feeds and ends by hand.
class FakeStream implements AsyncIterable<StreamHouseLiveResponse> {
  private readonly queue: (StreamHouseLiveResponse | Error | 'end')[] = [];
  private wake: (() => void) | undefined;

  constructor(readonly signal: AbortSignal) {
    signal.addEventListener('abort', () => this.wake?.());
  }

  push(item: StreamHouseLiveResponse | Error | 'end') {
    this.queue.push(item);
    this.wake?.();
  }

  async *[Symbol.asyncIterator]() {
    for (;;) {
      if (this.signal.aborted) {
        throw new ConnectError('aborted', Code.Canceled);
      }
      const item = this.queue.shift();
      if (item === undefined) {
        await new Promise<void>((resolve) => (this.wake = resolve));
        continue;
      }
      if (item === 'end') {
        return;
      }
      if (item instanceof Error) {
        throw item;
      }
      yield item;
    }
  }
}

class FakeClient implements LiveIotClient {
  readonly streams: FakeStream[] = [];
  readonly opened: { houseId: string; ownerUserId: string; timeoutMs: number }[] = [];
  houseError: unknown;
  readonly houseCalls: { houseId: string; ownerUserId: string }[] = [];

  async getHouse(params: { houseId: string; ownerUserId: string }) {
    this.houseCalls.push(params);
    if (this.houseError !== undefined) {
      throw this.houseError;
    }
    return {};
  }

  streamHouseLive(
    params: { houseId: string; ownerUserId: string },
    options: { signal: AbortSignal; timeoutMs: number },
  ) {
    this.opened.push({ ...params, timeoutMs: options.timeoutMs });
    const stream = new FakeStream(options.signal);
    this.streams.push(stream);
    return stream;
  }

  latest(): FakeStream {
    const stream = this.streams.at(-1);
    if (stream === undefined) {
      throw new Error('no upstream opened');
    }
    return stream;
  }
}

function readingMessage(seq: number) {
  return create(StreamHouseLiveResponseSchema, {
    event: {
      case: 'reading',
      value: {
        meterId: 'SM-784',
        measuredAt: timestampFromDate(MEASURED_AT),
        seq: BigInt(seq),
        solarKw: 1.42,
        consumptionKw: 0.86,
        netKw: 0.31,
        storageAssets: [
          {
            assetId: 'bat-1',
            assetType: AssetType.BESS,
            socPct: 63,
            powerKw: 0.25,
            capacityKwh: 5.16,
          },
        ],
      },
    },
  });
}

function statusMessage(online: boolean) {
  return create(StreamHouseLiveResponseSchema, {
    event: {
      case: 'status',
      value: online
        ? { meterStatus: MeterStatus.ONLINE, lastHeartbeatAt: timestampFromDate(MEASURED_AT) }
        : { meterStatus: MeterStatus.OFFLINE },
    },
  });
}

async function waitFor(condition: () => boolean, timeoutMs = 2000) {
  const start = Date.now();
  while (!condition()) {
    if (Date.now() - start > timeoutMs) {
      throw new Error('Timed out waiting for condition');
    }
    await new Promise((resolve) => setTimeout(resolve, 2));
  }
}

const quietLog = { warn: () => {}, info: () => {}, error: () => {}, debug: () => {} };

function setup(options: Partial<ConstructorParameters<typeof IotLiveFeed>[0]['options']> = {}) {
  const client = new FakeClient();
  const published: { key: string; event: string; payload: unknown }[] = [];
  const feed = new IotLiveFeed({
    client,
    publish: (key, event, payload) => {
      published.push({ key, event, payload });
      return 1;
    },
    log: quietLog,
    options: {
      streamTimeoutMs: 1_800_000,
      idleGraceMs: 30,
      minBackoffMs: 5,
      maxBackoffMs: 20,
      ...options,
    },
  });
  feeds.push(feed);
  return { client, published, feed };
}

const feeds: IotLiveFeed[] = [];

afterEach(() => {
  for (const feed of feeds.splice(0)) {
    feed.close();
  }
});

describe('IotLiveFeed topics', () => {
  it('handles iot.house topics only', () => {
    const { feed } = setup();

    expect(feed.matches(TOPIC)).toBe(true);
    expect(feed.matches('iot.house.')).toBe(true);
    expect(feed.matches('user.self')).toBe(false);
    expect(feed.matches('iot.grid.grid01')).toBe(false);
  });

  it('allows the owner, checking with the signed-in user, and uses the topic as the key', async () => {
    const { feed, client } = setup();

    await expect(feed.authorize(TOPIC, user)).resolves.toBe(TOPIC);
    expect(client.houseCalls).toEqual([{ houseId: HOUSE, ownerUserId: 'user-a' }]);
  });

  it.each([
    ['an unknown or someone else’s house', new AppError('NOT_FOUND')],
    ['a house ID the service rejects', new AppError('VALIDATION_ERROR')],
  ])('refuses %s', async (_name, error) => {
    const { feed, client } = setup();
    client.houseError = error;

    await expect(feed.authorize(TOPIC, user)).resolves.toBeNull();
  });

  it.each(['iot.house.', 'iot.house.bad/id', `iot.house.${'h'.repeat(101)}`])(
    'refuses the malformed topic "%s" without asking the IoT service',
    async (topic) => {
      const { feed, client } = setup();

      await expect(feed.authorize(topic, user)).resolves.toBeNull();
      expect(client.houseCalls).toEqual([]);
    },
  );

  it('fails the check when the IoT service cannot answer', async () => {
    const { feed, client } = setup();
    client.houseError = new AppError('UPSTREAM_UNAVAILABLE');

    await expect(feed.authorize(TOPIC, user)).rejects.toThrow();
  });
});

describe('IotLiveFeed upstream', () => {
  it('opens one shared stream per house and forwards readings and status', async () => {
    const { feed, client, published } = setup();

    feed.onActive(TOPIC);
    await waitFor(() => client.streams.length === 1);
    expect(client.opened).toEqual([{ houseId: HOUSE, ownerUserId: '', timeoutMs: 1_800_000 }]);

    client.latest().push(statusMessage(true));
    client.latest().push(readingMessage(4182));
    await waitFor(() => published.length === 2);

    expect(published[0]).toEqual({
      key: TOPIC,
      event: 'status',
      payload: { meterStatus: 'online', lastHeartbeatAt: MEASURED_AT.toISOString() },
    });
    // The same shape as GET /api/v1/iot/houses/{id}/latest-reading.
    expect(published[1]).toEqual({
      key: TOPIC,
      event: 'reading',
      payload: {
        meterId: 'SM-784',
        measuredAt: MEASURED_AT.toISOString(),
        seq: 4182,
        solarKw: 1.42,
        consumptionKw: 0.86,
        netKw: 0.31,
        storageAssets: [
          { assetId: 'bat-1', assetType: 'bess', socPct: 63, powerKw: 0.25, capacityKwh: 5.16 },
        ],
      },
    });

    client.latest().push(statusMessage(false));
    await waitFor(() => published.length === 3);
    expect(published[2]).toEqual({
      key: TOPIC,
      event: 'status',
      payload: { meterStatus: 'offline' },
    });
  });

  it('closes the stream after the idle grace period', async () => {
    const { feed, client } = setup();
    feed.onActive(TOPIC);
    await waitFor(() => client.streams.length === 1);

    feed.onIdle(TOPIC);
    expect(client.latest().signal.aborted).toBe(false);

    await waitFor(() => client.latest().signal.aborted);
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(client.streams).toHaveLength(1);
  });

  it('keeps the stream when a subscriber returns within the grace period', async () => {
    const { feed, client } = setup({ idleGraceMs: 50 });
    feed.onActive(TOPIC);
    await waitFor(() => client.streams.length === 1);

    feed.onIdle(TOPIC);
    feed.onActive(TOPIC);
    await new Promise((resolve) => setTimeout(resolve, 80));

    expect(client.latest().signal.aborted).toBe(false);
    expect(client.streams).toHaveLength(1);
  });

  it('reopens at once when the stream reaches its maximum age', async () => {
    const { feed, client, published } = setup({
      minBackoffMs: 10_000,
      maxBackoffMs: 10_000,
    });
    feed.onActive(TOPIC);
    await waitFor(() => client.streams.length === 1);

    // A live stream always starts with the status snapshot.
    client.latest().push(statusMessage(true));
    client.latest().push(new ConnectError('max age', Code.DeadlineExceeded));
    await waitFor(() => client.streams.length === 2);
    client.latest().push(statusMessage(true));
    client.latest().push('end');
    await waitFor(() => client.streams.length === 3);

    expect(published.filter((p) => p.event === 'stream-state')).toEqual([]);
  });

  it.each([
    ['a deadline', () => new ConnectError('database slow', Code.DeadlineExceeded)],
    ['a normal end', () => 'end' as const],
  ])('backs off when a stream ends with %s before sending anything', async (_name, ending) => {
    const { feed, client } = setup({ minBackoffMs: 200, maxBackoffMs: 200 });
    feed.onActive(TOPIC);
    await waitFor(() => client.streams.length === 1);

    client.latest().push(ending());
    await new Promise((resolve) => setTimeout(resolve, 100));

    // Reopening at once here would loop as fast as the IoT service can fail.
    expect(client.streams).toHaveLength(1);
    await waitFor(() => client.streams.length === 2, 1000);
  });

  it('reports an interruption, retries with backoff, and reports live again', async () => {
    const { feed, client, published } = setup();
    feed.onActive(TOPIC);
    await waitFor(() => client.streams.length === 1);
    client.latest().push(readingMessage(1));
    await waitFor(() => published.length === 1);

    client.latest().push(new ConnectError('ingestion restarting', Code.Unavailable));
    await waitFor(() => client.streams.length === 2);
    client.latest().push(new ConnectError('still down', Code.Unavailable));
    await waitFor(() => client.streams.length === 3);
    client.latest().push(statusMessage(true));
    await waitFor(() => published.some((p) => p.event === 'status'));

    expect(published.map((p) => p.event)).toEqual([
      'reading',
      'stream-state',
      'stream-state',
      'status',
    ]);
    expect(published[1]?.payload).toEqual({ state: 'interrupted' });
    expect(published[2]?.payload).toEqual({ state: 'live' });
  });

  it('starts the backoff again after a stream worked', async () => {
    const { feed, client, published } = setup();
    const attempts: number[] = [];
    const original = feed.backoffMs.bind(feed);
    vi.spyOn(feed, 'backoffMs').mockImplementation((attempt) => {
      attempts.push(attempt);
      return original(attempt);
    });
    feed.onActive(TOPIC);
    await waitFor(() => client.streams.length === 1);

    client.latest().push(new ConnectError('down', Code.Unavailable));
    await waitFor(() => client.streams.length === 2);
    client.latest().push(new ConnectError('down', Code.Unavailable));
    await waitFor(() => client.streams.length === 3);
    client.latest().push(readingMessage(1));
    await waitFor(() => published.some((p) => p.event === 'reading'));
    client.latest().push(new ConnectError('down again', Code.Unavailable));
    await waitFor(() => client.streams.length === 4);

    expect(attempts).toEqual([0, 1, 0]);
  });

  it('backs off between failed attempts up to the maximum', () => {
    const { feed } = setup({ minBackoffMs: 1000, maxBackoffMs: 30_000, random: () => 0.5 });

    expect(feed.backoffMs(0)).toBe(1000);
    expect(feed.backoffMs(1)).toBe(2000);
    expect(feed.backoffMs(4)).toBe(16_000);
    expect(feed.backoffMs(10)).toBe(30_000);
  });

  it('skips a message it cannot map and keeps the stream', async () => {
    const { feed, client, published } = setup();
    feed.onActive(TOPIC);
    await waitFor(() => client.streams.length === 1);

    const unknownAsset = readingMessage(1);
    if (unknownAsset.event.case === 'reading') {
      unknownAsset.event.value.storageAssets[0]!.assetType = AssetType.UNSPECIFIED;
    }
    client.latest().push(create(StreamHouseLiveResponseSchema, {}));
    client.latest().push(unknownAsset);
    client.latest().push(readingMessage(2));
    await waitFor(() => published.length === 1);

    expect(published[0]).toMatchObject({ event: 'reading', payload: { seq: 2 } });
    expect(client.streams).toHaveLength(1);
  });

  it('closes every stream on close', async () => {
    const { feed, client } = setup();
    feed.onActive(TOPIC);
    feed.onActive('iot.house.other');
    await waitFor(() => client.streams.length === 2);

    feed.close();

    await waitFor(() => client.streams.every((s) => s.signal.aborted));
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(client.streams).toHaveLength(2);
  });
});
