import { Type, type Static } from 'typebox';

import { isoDateTimeSchema, strictObject } from '../../common/validation.js';

/*
 * Energy and power values are plain JSON numbers: they are sensor telemetry, not the decimal
 * trading amounts that nonNegativeDecimalSchema carries as strings.
 */

export const BUCKET_SECONDS = {
  '5m': 300,
  '15m': 900,
  '30m': 1800,
  '1h': 3600,
  '1d': 86400,
} as const;

// 100 matches Fastify's default maxParamLength; longer path parameters are refused with 414.
export const houseParamsSchema = strictObject({
  houseId: Type.String({ pattern: '^[A-Za-z0-9._:-]{1,100}$' }),
});

export const emptyQuerySchema = strictObject({});

export const energySeriesQuerySchema = strictObject({
  from: isoDateTimeSchema,
  to: isoDateTimeSchema,
  bucket: Type.Union([
    Type.Literal('5m'),
    Type.Literal('15m'),
    Type.Literal('30m'),
    Type.Literal('1h'),
    Type.Literal('1d'),
  ]),
  timeZone: Type.Optional(Type.String({ minLength: 1, maxLength: 64, default: 'UTC' })),
});

export const energySummaryQuerySchema = strictObject({
  from: isoDateTimeSchema,
  to: isoDateTimeSchema,
});

export type HouseParams = Static<typeof houseParamsSchema>;
export type EnergySeriesQuery = Static<typeof energySeriesQuerySchema>;
export type EnergySummaryQuery = Static<typeof energySummaryQuerySchema>;

const gridSchema = strictObject({
  gridId: Type.String(),
  displayName: Type.String(),
});

export const houseSchema = strictObject({
  houseId: Type.String(),
  grid: gridSchema,
  meterId: Type.String(),
  deviceClass: Type.Union([
    Type.Literal('consumer'),
    Type.Literal('residential_prosumer'),
    Type.Literal('commercial'),
  ]),
  ratedSolarKw: Type.Optional(Type.Number()),
  meterStatus: Type.Union([Type.Literal('online'), Type.Literal('offline')]),
  lastHeartbeatAt: Type.Optional(isoDateTimeSchema),
});

const assetTypeSchema = Type.Union([Type.Literal('bess'), Type.Literal('ev')]);

const flexibleAssetSchema = strictObject({
  assetId: Type.String(),
  assetType: assetTypeSchema,
  capacityKwh: Type.Number(),
  maxChargeKw: Type.Number(),
  maxDischargeKw: Type.Number(),
  v2gCapable: Type.Optional(Type.Boolean()),
});

const storageAssetReadingSchema = strictObject({
  assetId: Type.String(),
  assetType: assetTypeSchema,
  socPct: Type.Number(),
  powerKw: Type.Number(),
  capacityKwh: Type.Number(),
  pluggedIn: Type.Optional(Type.Boolean()),
});

const energyTotalsSchema = strictObject({
  generatedKwh: Type.Number(),
  consumedKwh: Type.Number(),
  exportedKwh: Type.Number(),
  importedKwh: Type.Number(),
  storageChargedKwh: Type.Number(),
  storageDischargedKwh: Type.Number(),
});

const energyFlowsSchema = strictObject({
  solarToHomeKwh: Type.Number(),
  solarToStorageKwh: Type.Number(),
  solarToGridKwh: Type.Number(),
  gridToHomeKwh: Type.Number(),
  gridToStorageKwh: Type.Number(),
  storageToHomeKwh: Type.Number(),
  storageToGridKwh: Type.Number(),
});

export const listHousesResponseSchema = strictObject({
  houses: Type.Array(houseSchema),
});

export const getHouseResponseSchema = strictObject({
  house: houseSchema,
  flexibleAssets: Type.Array(flexibleAssetSchema),
});

export const latestReadingResponseSchema = strictObject({
  meterId: Type.String(),
  measuredAt: isoDateTimeSchema,
  seq: Type.Number(),
  solarKw: Type.Number(),
  consumptionKw: Type.Number(),
  netKw: Type.Number(),
  storageAssets: Type.Array(storageAssetReadingSchema),
});

export const energySeriesResponseSchema = strictObject({
  buckets: Type.Array(
    strictObject({
      startsAt: isoDateTimeSchema,
      energy: energyTotalsSchema,
      averagePower: strictObject({
        solarKw: Type.Number(),
        consumptionKw: Type.Number(),
        exportKw: Type.Number(),
        importKw: Type.Number(),
      }),
    }),
  ),
});

export const energySummaryResponseSchema = strictObject({
  totals: energyTotalsSchema,
  flows: energyFlowsSchema,
  selfConsumptionPct: Type.Optional(Type.Number()),
  peakDemand: Type.Optional(
    strictObject({
      consumptionKw: Type.Number(),
      occurredAt: isoDateTimeSchema,
    }),
  ),
});

export type House = Static<typeof houseSchema>;
export type ListHousesResponse = Static<typeof listHousesResponseSchema>;
export type GetHouseResponse = Static<typeof getHouseResponseSchema>;
export type LatestReadingResponse = Static<typeof latestReadingResponseSchema>;
export type EnergySeriesResponse = Static<typeof energySeriesResponseSchema>;
export type EnergySummaryResponse = Static<typeof energySummaryResponseSchema>;
