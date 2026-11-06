import cors from '@fastify/cors';
import type { FastifyInstance } from 'fastify';

import type { AppConfig } from '../config/types.js';

// How long browsers may cache a preflight (OPTIONS) result before asking again.
const PREFLIGHT_MAX_AGE_SECONDS = 600;

export async function registerCors(app: FastifyInstance, config: AppConfig): Promise<void> {
  if (config.cors.origins.includes('*')) {
    throw new Error('CORS_ORIGINS must not contain a wildcard (*).');
  }

  await app.register(cors, {
    origin: config.cors.origins,

    credentials: true,

    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],

    allowedHeaders: ['Authorization', 'Content-Type', 'X-Request-Id', 'Idempotency-Key'],

    exposedHeaders: ['X-Request-Id', 'Retry-After'],

    maxAge: PREFLIGHT_MAX_AGE_SECONDS,
  });
}
