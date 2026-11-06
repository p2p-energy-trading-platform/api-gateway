import { create } from '@bufbuild/protobuf';
import { timestampFromDate } from '@bufbuild/protobuf/wkt';
import {
  AssetType,
  DeviceClass,
  GetEnergySeriesResponseSchema,
  GetEnergySummaryResponseSchema,
  GetHouseResponseSchema,
  GetLatestReadingResponseSchema,
  HouseSchema,
  ListHousesResponseSchema,
  MeterStatus,
} from '@p2p-energy-trading-platform/typescript-sdk/gen/gridx/iot/v1/iot_pb';
import { describe, expect, it } from 'vitest';

import { AppError } from '../../../src/errors/app-error.js';
import {
  mapEnergySeriesResponse,
  mapEnergySummaryResponse,
  mapGetHouseResponse,
  mapHouse,
  mapLatestReadingResponse,
  mapListHousesResponse,
} from '../../../src/features/iot/mapper.js';

const BEAT = new Date('2026-10-23T09:00:00.000Z');

function house(overrides: Record<string, unknown> = {}) {
  return create(HouseSchema, {
    houseId: 'h1',
    grid: { gridId: 'grid01', displayName: 'JLT Zone 4' },
    meterId: 'SM-1',
    deviceClass: DeviceClass.RESIDENTIAL_PROSUMER,
    ratedSolarKw: 6,
    meterStatus: MeterStatus.ONLINE,
    lastHeartbeatAt: timestampFromDate(BEAT),
    ...overrides,
  });
}

function expectInternalError(fn: () => unknown) {
  try {
    fn();
  } catch (err) {
    expect(err).toBeInstanceOf(AppError);
    expect((err as AppError).code).toBe('INTERNAL_ERROR');
    return;
  }
  throw new Error('expected an INTERNAL_ERROR AppError');
}

describe('mapHouse', () => {
  it('maps every field', () => {
    expect(mapHouse(house())).toEqual({
      houseId: 'h1',
      grid: { gridId: 'grid01', displayName: 'JLT Zone 4' },
      meterId: 'SM-1',
      deviceClass: 'residential_prosumer',
      ratedSolarKw: 6,
      meterStatus: 'online',
      lastHeartbeatAt: '2026-10-23T09:00:00.000Z',
    });
  });

  it.each([
    [DeviceClass.CONSUMER, 'consumer'],
    [DeviceClass.RESIDENTIAL_PROSUMER, 'residential_prosumer'],
    [DeviceClass.COMMERCIAL, 'commercial'],
  ])('maps device class %s to %s', (deviceClass, name) => {
    expect(mapHouse(house({ deviceClass })).deviceClass).toBe(name);
  });

  it('maps an offline meter and leaves out unset optional fields', () => {
    const mapped = mapHouse(
      house({
        meterStatus: MeterStatus.OFFLINE,
        ratedSolarKw: undefined,
        lastHeartbeatAt: undefined,
      }),
    );

    expect(mapped.meterStatus).toBe('offline');
    expect(mapped).not.toHaveProperty('ratedSolarKw');
    expect(mapped).not.toHaveProperty('lastHeartbeatAt');
  });

  it('keeps a rated solar size of zero', () => {
    expect(mapHouse(house({ ratedSolarKw: 0 })).ratedSolarKw).toBe(0);
  });

  it.each([
    ['unspecified device class', { deviceClass: DeviceClass.UNSPECIFIED }],
    ['unspecified meter status', { meterStatus: MeterStatus.UNSPECIFIED }],
    ['missing grid', { grid: undefined }],
  ])('rejects an upstream house with %s', (_case, overrides) => {
    expectInternalError(() => mapHouse(house(overrides)));
  });
});

describe('mapListHousesResponse', () => {
  it('wraps the houses', () => {
    const res = create(ListHousesResponseSchema, { houses: [house(), house({ houseId: 'h2' })] });

    expect(mapListHousesResponse(res).houses.map((h) => h.houseId)).toEqual(['h1', 'h2']);
  });
});

describe('mapGetHouseResponse', () => {
  it('maps flexible assets and keeps v2gCapable only when present', () => {
    const res = create(GetHouseResponseSchema, {
      house: house(),
      flexibleAssets: [
        {
          assetId: 'b-1',
          assetType: AssetType.BESS,
          capacityKwh: 14,
          maxChargeKw: 5,
          maxDischargeKw: 4,
        },
        {
          assetId: 'ev-1',
          assetType: AssetType.EV,
          capacityKwh: 75,
          maxChargeKw: 11,
          maxDischargeKw: 11,
          v2gCapable: true,
        },
      ],
    });

    expect(mapGetHouseResponse(res).flexibleAssets).toEqual([
      { assetId: 'b-1', assetType: 'bess', capacityKwh: 14, maxChargeKw: 5, maxDischargeKw: 4 },
      {
        assetId: 'ev-1',
        assetType: 'ev',
        capacityKwh: 75,
        maxChargeKw: 11,
        maxDischargeKw: 11,
        v2gCapable: true,
      },
    ]);
  });

  it('rejects a response without a house', () => {
    expectInternalError(() => mapGetHouseResponse(create(GetHouseResponseSchema, {})));
  });

  it('rejects an asset with an unspecified type', () => {
    const res = create(GetHouseResponseSchema, {
      house: house(),
      flexibleAssets: [{ assetId: 'x', assetType: AssetType.UNSPECIFIED, capacityKwh: 1 }],
    });

    expectInternalError(() => mapGetHouseResponse(res));
  });
});

describe('mapLatestReadingResponse', () => {
  it('maps the reading', () => {
    const res = create(GetLatestReadingResponseSchema, {
      reading: {
        meterId: 'SM-1',
        measuredAt: timestampFromDate(new Date('2026-10-23T10:00:05.123Z')),
        seq: 123n,
        solarKw: 3.8,
        consumptionKw: 2.5,
        netKw: 0.1,
        storageAssets: [
          { assetId: 'b-1', assetType: AssetType.BESS, socPct: 94, powerKw: 1.2, capacityKwh: 14 },
          {
            assetId: 'ev-1',
            assetType: AssetType.EV,
            socPct: 67,
            powerKw: -2,
            capacityKwh: 75,
            pluggedIn: false,
          },
        ],
      },
    });

    expect(mapLatestReadingResponse(res)).toEqual({
      meterId: 'SM-1',
      measuredAt: '2026-10-23T10:00:05.123Z',
      seq: 123,
      solarKw: 3.8,
      consumptionKw: 2.5,
      netKw: 0.1,
      storageAssets: [
        { assetId: 'b-1', assetType: 'bess', socPct: 94, powerKw: 1.2, capacityKwh: 14 },
        {
          assetId: 'ev-1',
          assetType: 'ev',
          socPct: 67,
          powerKw: -2,
          capacityKwh: 75,
          pluggedIn: false,
        },
      ],
    });
  });

  it.each([
    ['no reading', {}],
    ['a reading without an event time', { reading: { meterId: 'SM-1' } }],
  ])('rejects a response with %s', (_case, init) => {
    expectInternalError(() =>
      mapLatestReadingResponse(create(GetLatestReadingResponseSchema, init)),
    );
  });
});

const TOTALS = {
  generatedKwh: 1,
  consumedKwh: 2,
  exportedKwh: 3,
  importedKwh: 4,
  storageChargedKwh: 5,
  storageDischargedKwh: 6,
};

describe('mapEnergySeriesResponse', () => {
  it('maps buckets', () => {
    const res = create(GetEnergySeriesResponseSchema, {
      buckets: [
        {
          startsAt: timestampFromDate(new Date('2026-10-22T20:00:00.000Z')),
          energy: TOTALS,
          averagePower: { solarKw: 7, consumptionKw: 8, exportKw: 9, importKw: 10 },
        },
      ],
    });

    expect(mapEnergySeriesResponse(res)).toEqual({
      buckets: [
        {
          startsAt: '2026-10-22T20:00:00.000Z',
          energy: TOTALS,
          averagePower: { solarKw: 7, consumptionKw: 8, exportKw: 9, importKw: 10 },
        },
      ],
    });
  });

  it('rejects a bucket without a start time', () => {
    const res = create(GetEnergySeriesResponseSchema, { buckets: [{ energy: TOTALS }] });

    expectInternalError(() => mapEnergySeriesResponse(res));
  });
});

describe('mapEnergySummaryResponse', () => {
  const flows = {
    solarToHomeKwh: 1,
    solarToStorageKwh: 2,
    solarToGridKwh: 3,
    gridToHomeKwh: 4,
    gridToStorageKwh: 5,
    storageToHomeKwh: 6,
    storageToGridKwh: 7,
  };

  it('maps totals, flows, self-consumption and peak demand', () => {
    const res = create(GetEnergySummaryResponseSchema, {
      totals: TOTALS,
      flows,
      selfConsumptionPct: 81.7,
      peakDemand: {
        consumptionKw: 3.4,
        occurredAt: timestampFromDate(new Date('2026-10-23T15:00:00.000Z')),
      },
    });

    expect(mapEnergySummaryResponse(res)).toEqual({
      totals: TOTALS,
      flows,
      selfConsumptionPct: 81.7,
      peakDemand: { consumptionKw: 3.4, occurredAt: '2026-10-23T15:00:00.000Z' },
    });
  });

  it('leaves out self-consumption and peak demand when unset', () => {
    const mapped = mapEnergySummaryResponse(
      create(GetEnergySummaryResponseSchema, { totals: TOTALS, flows }),
    );

    expect(mapped).not.toHaveProperty('selfConsumptionPct');
    expect(mapped).not.toHaveProperty('peakDemand');
  });

  it('keeps a self-consumption of zero', () => {
    const mapped = mapEnergySummaryResponse(
      create(GetEnergySummaryResponseSchema, { totals: TOTALS, flows, selfConsumptionPct: 0 }),
    );

    expect(mapped.selfConsumptionPct).toBe(0);
  });

  it('rejects a summary without totals', () => {
    expectInternalError(() =>
      mapEnergySummaryResponse(create(GetEnergySummaryResponseSchema, { flows })),
    );
  });
});
