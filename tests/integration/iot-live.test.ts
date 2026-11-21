import { randomUUID } from 'node:crypto';
import { once } from 'node:events';
import type { Socket } from 'node:net';

import { create } from '@bufbuild/protobuf';
import { timestampFromDate } from '@bufbuild/protobuf/wkt';
import { Code, ConnectError } from '@connectrpc/connect';
import {
  DeviceClass,
  HouseSchema,
  MeterStatus,
  StreamHouseLiveResponseSchema,
  type StreamHouseLiveResponse,
} from '@p2p-energy-trading-platform/typescript-sdk/gen/gridx/iot/v1/iot_pb';
import type { FastifyInstance } from 'fastify';
import { afterEach, describe, expect, it } from 'vitest';
import type { WebSocket } from 'ws';

import { buildApp } from '../../src/app.js';
import { startFakeIotService, type FakeIotService } from '../helpers/fake-iot-service.js';
import {
  signAccessToken,
  startFakeJwks,
  TEST_AUDIENCE,
  TEST_ISSUER,
  type FakeJwks,
} from '../helpers/fake-jwks.js';
import { testConfig } from '../helpers/test-config.js';

type Message = Record<string, unknown>;

const OWNER = 'owner-1';
const HOUSE_ID = 'grid01-house0042';
const TOPIC = `iot.house.${HOUSE_ID}`;
const MEASURED_AT = new Date('2026-11-20T09:30:05.000Z');
const CLIENT = { socket: { remoteAddress: '127.0.0.1' } as Socket };

// One upstream stream opened by the gateway, fed by the test.
interface Upstream {
  ownerUserId: string;
  push: (item: StreamHouseLiveResponse | ConnectError) => void;
  ended: Promise<void>;
}

function reading(seq: number) {
  return create(StreamHouseLiveResponseSchema, {
    event: {
      case: 'reading',
      value: {
        meterId: 'SM-784',
        measuredAt: timestampFromDate(MEASURED_AT),
        seq: BigInt(seq),
        solarKw: 1.4,
        consumptionKw: 0.9,
        netKw: 0.5,
      },
    },
  });
}

async function waitFor(condition: () => boolean, timeoutMs = 3000): Promise<void> {
  const start = Date.now();
  while (!condition()) {
    if (Date.now() - start > timeoutMs) {
      throw new Error('Timed out waiting for condition');
    }
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
}

/*
 * The iot.house.<houseId> WebSocket topic against a fake iot-ingestion-dispatch.
 * Needs Redis, like other tests that register the infrastructure plugins.
 */
describe('IoT live topic', () => {
  let app: FastifyInstance | undefined;
  let fake: FakeIotService | undefined;
  let jwks: FakeJwks | undefined;
  let upstreams: Upstream[] = [];
  let iotDown = false;
  const sockets: WebSocket[] = [];

  async function setup() {
    upstreams = [];
    iotDown = false;
    jwks = await startFakeJwks();
    fake = await startFakeIotService({
      getHouse: async (req) => {
        if (iotDown) {
          throw new ConnectError('down', Code.Unavailable);
        }
        if (req.houseId !== HOUSE_ID || req.ownerUserId !== OWNER) {
          throw new ConnectError('house not found', Code.NotFound);
        }
        return {
          house: create(HouseSchema, {
            houseId: HOUSE_ID,
            grid: { gridId: 'grid01', displayName: 'Grid 01' },
            deviceClass: DeviceClass.CONSUMER,
            meterStatus: MeterStatus.ONLINE,
          }),
          flexibleAssets: [],
        };
      },
      streamHouseLive: async function* (req, ctx) {
        const queue: (StreamHouseLiveResponse | ConnectError)[] = [];
        let wake: (() => void) | undefined;
        let markEnded!: () => void;
        const upstream: Upstream = {
          ownerUserId: req.ownerUserId,
          push: (item) => {
            queue.push(item);
            wake?.();
          },
          ended: new Promise<void>((resolve) => (markEnded = resolve)),
        };
        upstreams.push(upstream);
        ctx.signal.addEventListener('abort', () => wake?.());
        try {
          while (!ctx.signal.aborted) {
            const item = queue.shift();
            if (item === undefined) {
              await new Promise<void>((resolve) => (wake = resolve));
              continue;
            }
            if (item instanceof ConnectError) {
              throw item;
            }
            yield item;
          }
        } finally {
          markEnded();
        }
      },
    });

    app = await buildApp({
      config: {
        ...testConfig,
        auth: {
          ...testConfig.auth,
          issuer: TEST_ISSUER,
          audience: TEST_AUDIENCE,
          jwksUri: jwks.url,
        },
        grpc: { ...testConfig.grpc, iotServiceUrl: fake.url },
        rateLimit: { hashSecret: randomUUID() },
        iotLive: { streamTimeoutMs: 1_800_000, idleGraceMs: 100 },
      },
      registerInfrastructure: true,
    });
    await app.ready();
    return app;
  }

  afterEach(async () => {
    for (const socket of sockets.splice(0)) {
      socket.terminate();
    }
    await app?.close();
    await fake?.close();
    await jwks?.close();
    app = undefined;
    fake = undefined;
    jwks = undefined;
  });

  async function connectAs(userId: string): Promise<{ socket: WebSocket; messages: Message[] }> {
    const instance = app!;
    const token = await signAccessToken(jwks!.key, { subject: userId });
    const ticket = await instance.inject({
      method: 'POST',
      url: '/api/v1/ws/ticket',
      headers: { authorization: `Bearer ${token}` },
    });
    const socket = await instance.injectWS(`/api/v1/ws?ticket=${ticket.json().ticket}`, CLIENT);
    const messages: Message[] = [];

    sockets.push(socket);
    socket.on('message', (data) => messages.push(JSON.parse(String(data)) as Message));

    return { socket, messages };
  }

  async function subscribe(client: { socket: WebSocket; messages: Message[] }, id = 's1') {
    const before = client.messages.length;
    client.socket.send(JSON.stringify({ type: 'subscribe', id, topic: TOPIC }));
    await waitFor(() => client.messages.length > before);
    return client.messages[before];
  }

  function events(client: { messages: Message[] }) {
    return client.messages.filter((m) => m.type === 'event');
  }

  it('lets the owner subscribe and forwards the shared upstream’s events', async () => {
    await setup();
    const owner = await connectAs(OWNER);

    expect(await subscribe(owner)).toMatchObject({ type: 'subscribed', id: 's1', topic: TOPIC });
    await waitFor(() => upstreams.length === 1);
    expect(upstreams[0]?.ownerUserId).toBe('');

    upstreams[0]?.push(reading(4182));
    await waitFor(() => events(owner).length === 1);

    expect(events(owner)[0]).toMatchObject({
      type: 'event',
      topic: TOPIC,
      event: 'reading',
      payload: {
        meterId: 'SM-784',
        measuredAt: MEASURED_AT.toISOString(),
        seq: 4182,
        solarKw: 1.4,
        consumptionKw: 0.9,
        netKw: 0.5,
        storageAssets: [],
      },
    });
  });

  it('refuses a user who does not own the house, without opening a stream', async () => {
    await setup();
    const stranger = await connectAs('someone-else');

    expect(await subscribe(stranger)).toMatchObject({
      type: 'error',
      id: 's1',
      code: 'TOPIC_NOT_ALLOWED',
    });
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(upstreams).toHaveLength(0);
  });

  it('answers TOPIC_UNAVAILABLE when the IoT service cannot check ownership', async () => {
    await setup();
    iotDown = true;
    const owner = await connectAs(OWNER);

    expect(await subscribe(owner)).toMatchObject({ type: 'error', code: 'TOPIC_UNAVAILABLE' });
  });

  it('shares one upstream between the sockets watching a house', async () => {
    await setup();
    const tab1 = await connectAs(OWNER);
    const tab2 = await connectAs(OWNER);
    await subscribe(tab1);
    await subscribe(tab2);
    await waitFor(() => upstreams.length === 1);

    upstreams[0]?.push(reading(1));
    await waitFor(() => events(tab1).length === 1 && events(tab2).length === 1);

    expect(upstreams).toHaveLength(1);
  });

  it('tells clients when the upstream is interrupted and when it is live again', async () => {
    await setup();
    const owner = await connectAs(OWNER);
    await subscribe(owner);
    await waitFor(() => upstreams.length === 1);

    upstreams[0]?.push(new ConnectError('ingestion restarting', Code.Unavailable));
    await waitFor(() => events(owner).length === 1);
    expect(events(owner)[0]).toMatchObject({
      event: 'stream-state',
      payload: { state: 'interrupted' },
    });

    // The first retry comes after about a second.
    await waitFor(() => upstreams.length === 2, 5000);
    upstreams[1]?.push(reading(2));
    await waitFor(() => events(owner).length === 3);
    expect(events(owner).slice(1)).toMatchObject([
      { event: 'stream-state', payload: { state: 'live' } },
      { event: 'reading', payload: { seq: 2 } },
    ]);
  });

  it('closes the upstream after the last subscriber leaves and the grace period passes', async () => {
    await setup();
    const owner = await connectAs(OWNER);
    await subscribe(owner);
    await waitFor(() => upstreams.length === 1);

    owner.socket.send(JSON.stringify({ type: 'unsubscribe', id: 'u1', topic: TOPIC }));

    await upstreams[0]?.ended;
    expect(upstreams).toHaveLength(1);
  });

  it('closes upstreams when the gateway shuts down', async () => {
    await setup();
    const owner = await connectAs(OWNER);
    await subscribe(owner);
    await waitFor(() => upstreams.length === 1);
    const closed = once(owner.socket, 'close');

    await app?.close();
    app = undefined;

    await closed;
    await upstreams[0]?.ended;
  });
});
