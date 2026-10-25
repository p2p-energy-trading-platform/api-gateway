import { randomUUID } from 'node:crypto';

import { create } from '@bufbuild/protobuf';
import { timestampDate, timestampFromDate } from '@bufbuild/protobuf/wkt';
import { Code, ConnectError, type ServiceImpl } from '@connectrpc/connect';
import {
  AssetType,
  DeviceClass,
  HouseSchema,
  type IotService,
  MeterStatus,
} from '@p2p-energy-trading-platform/typescript-sdk/gen/gridx/iot/v1/iot_pb';
import type { FastifyInstance } from 'fastify';
import { afterEach, describe, expect, it } from 'vitest';

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

const USER_ID = 'iot-user-1';
const HOUSE_ID = 'grid01-house0042';
const FROM = '2026-10-23T00:00:00.000Z';
const TO = '2026-10-24T00:00:00.000Z';

const ROUTES = {
  houses: '/api/v1/iot/houses',
  house: `/api/v1/iot/houses/${HOUSE_ID}`,
  latest: `/api/v1/iot/houses/${HOUSE_ID}/latest-reading`,
  series: `/api/v1/iot/houses/${HOUSE_ID}/energy-series?from=${FROM}&to=${TO}&bucket=30m`,
  summary: `/api/v1/iot/houses/${HOUSE_ID}/energy-summary?from=${FROM}&to=${TO}`,
};

const TOTALS = {
  generatedKwh: 28.4,
  consumedKwh: 36,
  exportedKwh: 3.2,
  importedKwh: 9.4,
  storageChargedKwh: 6.4,
  storageDischargedKwh: 7.8,
};

const FLOWS = {
  solarToHomeKwh: 19.2,
  solarToStorageKwh: 6.4,
  solarToGridKwh: 2.8,
  gridToHomeKwh: 9.4,
  gridToStorageKwh: 0,
  storageToHomeKwh: 7.8,
  storageToGridKwh: 0,
};

function house() {
  return create(HouseSchema, {
    houseId: HOUSE_ID,
    grid: { gridId: 'grid01', displayName: 'JLT Zone 4' },
    meterId: 'SM-784',
    deviceClass: DeviceClass.RESIDENTIAL_PROSUMER,
    ratedSolarKw: 6,
    meterStatus: MeterStatus.ONLINE,
    lastHeartbeatAt: timestampFromDate(new Date('2026-10-23T09:00:00.000Z')),
  });
}

const HOUSE_JSON = {
  houseId: HOUSE_ID,
  grid: { gridId: 'grid01', displayName: 'JLT Zone 4' },
  meterId: 'SM-784',
  deviceClass: 'residential_prosumer',
  ratedSolarKw: 6,
  meterStatus: 'online',
  lastHeartbeatAt: '2026-10-23T09:00:00.000Z',
};

interface ReceivedCall {
  method: string;
  userId: string | null;
  request: Record<string, unknown>;
}

type IotImplementation = Partial<ServiceImpl<typeof IotService>>;

/*
 * The /api/v1/iot routes against a fake iot-ingestion-dispatch.
 * Needs Redis, like other tests that register the infrastructure plugins.
 */
describe('IoT routes', () => {
  let app: FastifyInstance | undefined;
  let fake: FakeIotService | undefined;
  let jwks: FakeJwks | undefined;
  let received: ReceivedCall[] = [];

  async function setup(overrides: IotImplementation = {}) {
    received = [];
    jwks = await startFakeJwks();

    const record = (method: string, request: Record<string, unknown>, userId: string | null) =>
      received.push({ method, userId, request });

    fake = await startFakeIotService({
      listHouses: async (req, ctx) => {
        record(
          'listHouses',
          {
            ownerUserId: req.ownerUserId,
            gridId: req.gridId,
            pageSize: req.pageSize,
            pageToken: req.pageToken,
          },
          ctx.requestHeader.get('x-gridx-user-id'),
        );
        return overrides.listHouses ? overrides.listHouses(req, ctx) : { houses: [house()] };
      },
      getHouse: async (req, ctx) => {
        record(
          'getHouse',
          { houseId: req.houseId, ownerUserId: req.ownerUserId },
          ctx.requestHeader.get('x-gridx-user-id'),
        );
        return overrides.getHouse
          ? overrides.getHouse(req, ctx)
          : {
              house: house(),
              flexibleAssets: [
                {
                  assetId: 'b-1',
                  assetType: AssetType.BESS,
                  capacityKwh: 14,
                  maxChargeKw: 5,
                  maxDischargeKw: 5,
                },
              ],
            };
      },
      getLatestReading: async (req, ctx) => {
        record(
          'getLatestReading',
          { houseId: req.houseId, ownerUserId: req.ownerUserId },
          ctx.requestHeader.get('x-gridx-user-id'),
        );
        return {
          reading: {
            meterId: 'SM-784',
            measuredAt: timestampFromDate(new Date('2026-10-23T10:00:05.000Z')),
            seq: 77n,
            solarKw: 3.8,
            consumptionKw: 2.5,
            netKw: 0.1,
            storageAssets: [
              {
                assetId: 'b-1',
                assetType: AssetType.BESS,
                socPct: 94,
                powerKw: 1.2,
                capacityKwh: 14,
              },
            ],
          },
        };
      },
      getEnergySeries: async (req, ctx) => {
        record(
          'getEnergySeries',
          {
            houseId: req.houseId,
            ownerUserId: req.ownerUserId,
            startTime: req.startTime ? timestampDate(req.startTime).toISOString() : undefined,
            endTime: req.endTime ? timestampDate(req.endTime).toISOString() : undefined,
            bucketSeconds: req.bucketWidth?.seconds,
            timeZone: req.timeZone,
          },
          ctx.requestHeader.get('x-gridx-user-id'),
        );
        return {
          buckets: [
            {
              startsAt: timestampFromDate(new Date(FROM)),
              energy: TOTALS,
              averagePower: { solarKw: 1, consumptionKw: 2, exportKw: 0.5, importKw: 1.5 },
            },
          ],
        };
      },
      getEnergySummary: async (req, ctx) => {
        record(
          'getEnergySummary',
          {
            houseId: req.houseId,
            ownerUserId: req.ownerUserId,
            startTime: req.startTime ? timestampDate(req.startTime).toISOString() : undefined,
            endTime: req.endTime ? timestampDate(req.endTime).toISOString() : undefined,
          },
          ctx.requestHeader.get('x-gridx-user-id'),
        );
        return overrides.getEnergySummary
          ? overrides.getEnergySummary(req, ctx)
          : {
              totals: TOTALS,
              flows: FLOWS,
              selfConsumptionPct: 90.14,
              peakDemand: {
                consumptionKw: 3.4,
                occurredAt: timestampFromDate(new Date('2026-10-23T15:00:00.000Z')),
              },
            };
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
        // Fresh rate-limit keys for every test.
        rateLimit: { hashSecret: randomUUID() },
      },
      registerInfrastructure: true,
    });

    return app;
  }

  async function get(instance: FastifyInstance, url: string) {
    if (jwks === undefined) {
      throw new Error('Test JWKS is not initialized');
    }
    const token = await signAccessToken(jwks.key, { subject: USER_ID });

    return instance.inject({ method: 'GET', url, headers: { authorization: `Bearer ${token}` } });
  }

  afterEach(async () => {
    await app?.close();
    await fake?.close();
    await jwks?.close();
    app = undefined;
    fake = undefined;
    jwks = undefined;
  });

  it.each(Object.entries(ROUTES))('%s returns 401 without an access token', async (_name, url) => {
    const instance = await setup();

    const response = await instance.inject({ method: 'GET', url });

    expect(response.statusCode).toBe(401);
    expect(received).toHaveLength(0);
  });

  it('lists the caller’s houses', async () => {
    const instance = await setup();

    const response = await get(instance, ROUTES.houses);

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ houses: [HOUSE_JSON] });
    expect(received).toEqual([
      {
        method: 'listHouses',
        userId: USER_ID,
        request: { ownerUserId: USER_ID, gridId: '', pageSize: 200, pageToken: '' },
      },
    ]);
  });

  it('returns a house with its flexible assets', async () => {
    const instance = await setup();

    const response = await get(instance, ROUTES.house);

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      house: HOUSE_JSON,
      flexibleAssets: [
        { assetId: 'b-1', assetType: 'bess', capacityKwh: 14, maxChargeKw: 5, maxDischargeKw: 5 },
      ],
    });
    expect(received[0]?.request).toEqual({ houseId: HOUSE_ID, ownerUserId: USER_ID });
  });

  it('returns the latest reading', async () => {
    const instance = await setup();

    const response = await get(instance, ROUTES.latest);

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      meterId: 'SM-784',
      measuredAt: '2026-10-23T10:00:05.000Z',
      seq: 77,
      solarKw: 3.8,
      consumptionKw: 2.5,
      netKw: 0.1,
      storageAssets: [
        { assetId: 'b-1', assetType: 'bess', socPct: 94, powerKw: 1.2, capacityKwh: 14 },
      ],
    });
    expect(received[0]?.request).toEqual({ houseId: HOUSE_ID, ownerUserId: USER_ID });
  });

  it('returns an energy series with the requested bucket and time zone', async () => {
    const instance = await setup();

    const response = await get(instance, `${ROUTES.series}&timeZone=Asia/Dubai`);

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      buckets: [
        {
          startsAt: FROM,
          energy: TOTALS,
          averagePower: { solarKw: 1, consumptionKw: 2, exportKw: 0.5, importKw: 1.5 },
        },
      ],
    });
    expect(received[0]?.request).toEqual({
      houseId: HOUSE_ID,
      ownerUserId: USER_ID,
      startTime: FROM,
      endTime: TO,
      bucketSeconds: 1800n,
      timeZone: 'Asia/Dubai',
    });
  });

  it.each([
    ['5m', 300n],
    ['15m', 900n],
    ['1h', 3600n],
    ['1d', 86400n],
  ])('maps bucket %s to %s seconds and defaults the time zone to UTC', async (bucket, seconds) => {
    const instance = await setup();

    const url = `/api/v1/iot/houses/${HOUSE_ID}/energy-series?from=${FROM}&to=${TO}&bucket=${bucket}`;
    const response = await get(instance, url);

    expect(response.statusCode).toBe(200);
    expect(received[0]?.request).toMatchObject({ bucketSeconds: seconds, timeZone: 'UTC' });
  });

  it('returns an energy summary', async () => {
    const instance = await setup();

    const response = await get(instance, ROUTES.summary);

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      totals: TOTALS,
      flows: FLOWS,
      selfConsumptionPct: 90.14,
      peakDemand: { consumptionKw: 3.4, occurredAt: '2026-10-23T15:00:00.000Z' },
    });
    expect(received[0]?.request).toEqual({
      houseId: HOUSE_ID,
      ownerUserId: USER_ID,
      startTime: FROM,
      endTime: TO,
    });
  });

  it('leaves out self-consumption and peak demand when the service has none', async () => {
    const instance = await setup({
      getEnergySummary: async () => ({ totals: TOTALS, flows: FLOWS }),
    });

    const response = await get(instance, ROUTES.summary);
    const body = response.json();

    expect(response.statusCode).toBe(200);
    expect(body.totals).toEqual(TOTALS);
    expect(body).not.toHaveProperty('selfConsumptionPct');
    expect(body).not.toHaveProperty('peakDemand');
  });

  it('returns 404 when the house is not found or not the caller’s', async () => {
    const instance = await setup({
      getHouse: async () => {
        throw new ConnectError('house not found', Code.NotFound);
      },
    });

    const response = await get(instance, ROUTES.house);

    expect(response.statusCode).toBe(404);
    expect(response.json().error.code).toBe('NOT_FOUND');
    expect(received.map((call) => call.method)).toEqual(['getHouse']);
  });

  it.each(Object.entries(ROUTES))(
    '%s rejects a client-supplied ownerUserId',
    async (_name, url) => {
      const instance = await setup();

      const separator = url.includes('?') ? '&' : '?';
      const response = await get(instance, `${url}${separator}ownerUserId=someone-else`);

      expect(response.statusCode).toBe(400);
      expect(response.json().error.code).toBe('VALIDATION_ERROR');
      expect(received).toHaveLength(0);
    },
  );

  it.each([
    ['an unsupported bucket', `energy-series?from=${FROM}&to=${TO}&bucket=2h`],
    ['a missing from', `energy-series?to=${TO}&bucket=1h`],
    ['a missing bucket', `energy-series?from=${FROM}&to=${TO}`],
    ['from equal to to', `energy-series?from=${FROM}&to=${FROM}&bucket=1h`],
    ['from after to', `energy-summary?from=${TO}&to=${FROM}`],
    ['a non-ISO to', `energy-summary?from=${FROM}&to=tomorrow`],
  ])('returns 400 for %s', async (_case, path) => {
    const instance = await setup();

    const response = await get(instance, `/api/v1/iot/houses/${HOUSE_ID}/${path}`);

    expect(response.statusCode).toBe(400);
    expect(response.json().error.code).toBe('VALIDATION_ERROR');
    expect(received).toHaveLength(0);
  });

  it.each([
    ['a slash', 'grid01%2Fhouse'],
    ['a space', 'grid01%20house'],
  ])('returns 400 for a house id with %s', async (_case, houseId) => {
    const instance = await setup();

    const response = await get(instance, `/api/v1/iot/houses/${houseId}`);

    expect(response.statusCode).toBe(400);
    expect(received).toHaveLength(0);
  });

  it('accepts a 100-character house id and refuses a longer one before calling the service', async () => {
    const instance = await setup();

    const longest = await get(instance, `/api/v1/iot/houses/${'h'.repeat(100)}`);
    const tooLong = await get(instance, `/api/v1/iot/houses/${'h'.repeat(101)}`);

    expect(longest.statusCode).toBe(200);
    expect(tooLong.statusCode).toBe(414);
    expect(received.map((call) => call.method)).toEqual(['getHouse']);
  });
});
