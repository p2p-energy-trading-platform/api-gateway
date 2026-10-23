import { timestampFromDate } from '@bufbuild/protobuf/wkt';
import type { FastifyRequest } from 'fastify';

import { AppError } from '../../errors/app-error.js';
import { grpcDeadlinesMs } from '../../transport/grpc/deadlines.js';
import {
  mapEnergySeriesResponse,
  mapEnergySummaryResponse,
  mapGetHouseResponse,
  mapLatestReadingResponse,
  mapListHousesResponse,
} from './mapper.js';
import {
  BUCKET_SECONDS,
  type EnergySeriesQuery,
  type EnergySeriesResponse,
  type EnergySummaryQuery,
  type EnergySummaryResponse,
  type GetHouseResponse,
  type HouseParams,
  type LatestReadingResponse,
  type ListHousesResponse,
} from './schemas.js';

// The gateway lists all of a user's houses in one call; users own a handful at most.
const LIST_HOUSES_PAGE_SIZE = 200;

// Every IoT request is scoped to the caller. The owner always comes from the access token,
// never from the client, so a user can only read their own houses.
function ownerUserId(request: FastifyRequest): string {
  if (request.principal === null) {
    throw new AppError('UNAUTHENTICATED');
  }
  return request.principal.userId;
}

function timeRange(query: { from: string; to: string }) {
  const start = new Date(query.from);
  const end = new Date(query.to);

  if (end.getTime() <= start.getTime()) {
    throw new AppError('VALIDATION_ERROR', '"to" must be after "from".');
  }

  return { startTime: timestampFromDate(start), endTime: timestampFromDate(end) };
}

export async function listHousesHandler(request: FastifyRequest): Promise<ListHousesResponse> {
  const result = await request.server.grpcClients.iot.listHouses(
    { ownerUserId: ownerUserId(request), pageSize: LIST_HOUSES_PAGE_SIZE },
    grpcDeadlinesMs.iotListHouses,
  );

  return mapListHousesResponse(result);
}

export async function getHouseHandler(
  request: FastifyRequest<{ Params: HouseParams }>,
): Promise<GetHouseResponse> {
  const result = await request.server.grpcClients.iot.getHouse(
    { houseId: request.params.houseId, ownerUserId: ownerUserId(request) },
    grpcDeadlinesMs.iotGetHouse,
  );

  return mapGetHouseResponse(result);
}

export async function getLatestReadingHandler(
  request: FastifyRequest<{ Params: HouseParams }>,
): Promise<LatestReadingResponse> {
  const result = await request.server.grpcClients.iot.getLatestReading(
    { houseId: request.params.houseId, ownerUserId: ownerUserId(request) },
    grpcDeadlinesMs.iotGetLatestReading,
  );

  return mapLatestReadingResponse(result);
}

export async function getEnergySeriesHandler(
  request: FastifyRequest<{ Params: HouseParams; Querystring: EnergySeriesQuery }>,
): Promise<EnergySeriesResponse> {
  const { query } = request;
  const result = await request.server.grpcClients.iot.getEnergySeries(
    {
      houseId: request.params.houseId,
      ownerUserId: ownerUserId(request),
      ...timeRange(query),
      bucketWidth: { seconds: BigInt(BUCKET_SECONDS[query.bucket]) },
      timeZone: query.timeZone ?? 'UTC',
    },
    grpcDeadlinesMs.iotGetEnergySeries,
  );

  return mapEnergySeriesResponse(result);
}

export async function getEnergySummaryHandler(
  request: FastifyRequest<{ Params: HouseParams; Querystring: EnergySummaryQuery }>,
): Promise<EnergySummaryResponse> {
  const result = await request.server.grpcClients.iot.getEnergySummary(
    {
      houseId: request.params.houseId,
      ownerUserId: ownerUserId(request),
      ...timeRange(request.query),
    },
    grpcDeadlinesMs.iotGetEnergySummary,
  );

  return mapEnergySummaryResponse(result);
}
