import { timestampDate, type Timestamp } from '@bufbuild/protobuf/wkt';
import {
  AssetType,
  DeviceClass,
  MeterStatus,
  type EnergyTotals as GrpcEnergyTotals,
  type GetEnergySeriesResponse as GrpcGetEnergySeriesResponse,
  type GetEnergySummaryResponse as GrpcGetEnergySummaryResponse,
  type GetHouseResponse as GrpcGetHouseResponse,
  type GetLatestReadingResponse as GrpcGetLatestReadingResponse,
  type House as GrpcHouse,
  type ListHousesResponse as GrpcListHousesResponse,
} from '@p2p-energy-trading-platform/typescript-sdk/gen/gridx/iot/v1/iot_pb';

import { AppError } from '../../errors/app-error.js';
import type {
  EnergySeriesResponse,
  EnergySummaryResponse,
  GetHouseResponse,
  House,
  LatestReadingResponse,
  ListHousesResponse,
} from './schemas.js';

type AssetTypeName = GetHouseResponse['flexibleAssets'][number]['assetType'];

const DEVICE_CLASS_NAMES: Partial<Record<DeviceClass, House['deviceClass']>> = {
  [DeviceClass.CONSUMER]: 'consumer',
  [DeviceClass.RESIDENTIAL_PROSUMER]: 'residential_prosumer',
  [DeviceClass.COMMERCIAL]: 'commercial',
};

const METER_STATUS_NAMES: Partial<Record<MeterStatus, House['meterStatus']>> = {
  [MeterStatus.ONLINE]: 'online',
  [MeterStatus.OFFLINE]: 'offline',
};

const ASSET_TYPE_NAMES: Partial<Record<AssetType, AssetTypeName>> = {
  [AssetType.BESS]: 'bess',
  [AssetType.EV]: 'ev',
};

// iot-ingestion-dispatch always sets these; anything else is an upstream bug.
function required<T>(value: T | undefined): T {
  if (value === undefined) {
    throw new AppError('INTERNAL_ERROR');
  }
  return value;
}

function isoTime(timestamp: Timestamp | undefined): string {
  return timestampDate(required(timestamp)).toISOString();
}

function assetTypeName(assetType: AssetType): AssetTypeName {
  return required(ASSET_TYPE_NAMES[assetType]);
}

function mapTotals(totals: GrpcEnergyTotals | undefined) {
  const t = required(totals);
  return {
    generatedKwh: t.generatedKwh,
    consumedKwh: t.consumedKwh,
    exportedKwh: t.exportedKwh,
    importedKwh: t.importedKwh,
    storageChargedKwh: t.storageChargedKwh,
    storageDischargedKwh: t.storageDischargedKwh,
  };
}

export function mapHouse(house: GrpcHouse): House {
  const grid = required(house.grid);

  return {
    houseId: house.houseId,
    grid: { gridId: grid.gridId, displayName: grid.displayName },
    meterId: house.meterId,
    deviceClass: required(DEVICE_CLASS_NAMES[house.deviceClass]),
    ...(house.ratedSolarKw !== undefined ? { ratedSolarKw: house.ratedSolarKw } : {}),
    meterStatus: required(METER_STATUS_NAMES[house.meterStatus]),
    ...(house.lastHeartbeatAt ? { lastHeartbeatAt: isoTime(house.lastHeartbeatAt) } : {}),
  };
}

export function mapListHousesResponse(result: GrpcListHousesResponse): ListHousesResponse {
  return { houses: result.houses.map(mapHouse) };
}

export function mapGetHouseResponse(result: GrpcGetHouseResponse): GetHouseResponse {
  return {
    house: mapHouse(required(result.house)),
    flexibleAssets: result.flexibleAssets.map((asset) => ({
      assetId: asset.assetId,
      assetType: assetTypeName(asset.assetType),
      capacityKwh: asset.capacityKwh,
      maxChargeKw: asset.maxChargeKw,
      maxDischargeKw: asset.maxDischargeKw,
      ...(asset.v2gCapable !== undefined ? { v2gCapable: asset.v2gCapable } : {}),
    })),
  };
}

export function mapLatestReadingResponse(
  result: GrpcGetLatestReadingResponse,
): LatestReadingResponse {
  const reading = required(result.reading);

  return {
    meterId: reading.meterId,
    measuredAt: isoTime(reading.measuredAt),
    seq: Number(reading.seq),
    solarKw: reading.solarKw,
    consumptionKw: reading.consumptionKw,
    netKw: reading.netKw,
    storageAssets: reading.storageAssets.map((asset) => ({
      assetId: asset.assetId,
      assetType: assetTypeName(asset.assetType),
      socPct: asset.socPct,
      powerKw: asset.powerKw,
      capacityKwh: asset.capacityKwh,
      ...(asset.pluggedIn !== undefined ? { pluggedIn: asset.pluggedIn } : {}),
    })),
  };
}

export function mapEnergySeriesResponse(result: GrpcGetEnergySeriesResponse): EnergySeriesResponse {
  return {
    buckets: result.buckets.map((bucket) => {
      const power = required(bucket.averagePower);
      return {
        startsAt: isoTime(bucket.startsAt),
        energy: mapTotals(bucket.energy),
        averagePower: {
          solarKw: power.solarKw,
          consumptionKw: power.consumptionKw,
          exportKw: power.exportKw,
          importKw: power.importKw,
        },
      };
    }),
  };
}

export function mapEnergySummaryResponse(
  result: GrpcGetEnergySummaryResponse,
): EnergySummaryResponse {
  const flows = required(result.flows);

  return {
    totals: mapTotals(result.totals),
    flows: {
      solarToHomeKwh: flows.solarToHomeKwh,
      solarToStorageKwh: flows.solarToStorageKwh,
      solarToGridKwh: flows.solarToGridKwh,
      gridToHomeKwh: flows.gridToHomeKwh,
      gridToStorageKwh: flows.gridToStorageKwh,
      storageToHomeKwh: flows.storageToHomeKwh,
      storageToGridKwh: flows.storageToGridKwh,
    },
    ...(result.selfConsumptionPct !== undefined
      ? { selfConsumptionPct: result.selfConsumptionPct }
      : {}),
    ...(result.peakDemand
      ? {
          peakDemand: {
            consumptionKw: result.peakDemand.consumptionKw,
            occurredAt: isoTime(result.peakDemand.occurredAt),
          },
        }
      : {}),
  };
}
