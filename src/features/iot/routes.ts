import type { TypeBoxTypeProvider } from '@fastify/type-provider-typebox';
import type { FastifyInstance } from 'fastify';

import {
  getEnergySeriesHandler,
  getEnergySummaryHandler,
  getHouseHandler,
  getLatestReadingHandler,
  listHousesHandler,
} from './handler.js';
import {
  emptyQuerySchema,
  energySeriesQuerySchema,
  energySeriesResponseSchema,
  energySummaryQuerySchema,
  energySummaryResponseSchema,
  getHouseResponseSchema,
  houseParamsSchema,
  latestReadingResponseSchema,
  listHousesResponseSchema,
} from './schemas.js';

export async function registerIotRoutes(app: FastifyInstance): Promise<void> {
  const router = app.withTypeProvider<TypeBoxTypeProvider>();

  router.get(
    '/api/v1/iot/houses',
    {
      config: { rateLimit: 'authenticated-read', auth: 'required' },
      schema: {
        querystring: emptyQuerySchema,
        response: { 200: listHousesResponseSchema },
      },
    },
    listHousesHandler,
  );

  router.get(
    '/api/v1/iot/houses/:houseId',
    {
      config: { rateLimit: 'authenticated-read', auth: 'required' },
      schema: {
        params: houseParamsSchema,
        querystring: emptyQuerySchema,
        response: { 200: getHouseResponseSchema },
      },
    },
    getHouseHandler,
  );

  router.get(
    '/api/v1/iot/houses/:houseId/latest-reading',
    {
      config: { rateLimit: 'authenticated-read', auth: 'required' },
      schema: {
        params: houseParamsSchema,
        querystring: emptyQuerySchema,
        response: { 200: latestReadingResponseSchema },
      },
    },
    getLatestReadingHandler,
  );

  router.get(
    '/api/v1/iot/houses/:houseId/energy-series',
    {
      config: { rateLimit: 'expensive-read', auth: 'required' },
      schema: {
        params: houseParamsSchema,
        querystring: energySeriesQuerySchema,
        response: { 200: energySeriesResponseSchema },
      },
    },
    getEnergySeriesHandler,
  );

  router.get(
    '/api/v1/iot/houses/:houseId/energy-summary',
    {
      config: { rateLimit: 'expensive-read', auth: 'required' },
      schema: {
        params: houseParamsSchema,
        querystring: energySummaryQuerySchema,
        response: { 200: energySummaryResponseSchema },
      },
    },
    getEnergySummaryHandler,
  );
}
