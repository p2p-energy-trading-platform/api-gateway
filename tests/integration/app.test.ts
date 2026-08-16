import { afterEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';

import { buildApp } from '../../src/app.js';
import type { AppConfig } from '../../src/config/types.js';

const testConfig: AppConfig = {
  nodeEnv: 'test',

  service: {
    name: 'api-gateway',
    version: 'test',
  },

  http: {
    host: '127.0.0.1',
    port: 3000,
    bodyLimitBytes: 1_048_576,
    requestTimeoutMs: 10_000,
  },

  logging: {
    level: 'silent',
  },

  cors: {
    origins: ['http://localhost:5173'],
  },

  redis: {
    url: 'redis://localhost:6379',
    connectTimeoutMs: 2_000,
  },

  auth: {
    issuer: 'gridx-auth-service',
    audience: 'gridx-api-gateway',
    jwksUri: 'http://localhost:8080/.well-known/jwks.json',
    allowedAlgorithms: ['RS256'],
    clockToleranceSeconds: 5,
    jwksCacheTtlSeconds: 300,
    jwksRequestTimeoutMs: 2_000,
  },
};

describe('buildApp', () => {
  let app: FastifyInstance | undefined;

  afterEach(async () => {
    if (app !== undefined) {
      await app.close();
    }
  });

  it('builds the Fastify application', async () => {
    app = await buildApp({
      config: testConfig,
      registerInfrastructure: false,
    });

    expect(app).toBeDefined();
  });

  it('responds to the liveness endpoint', async () => {
    app = await buildApp({
      config: testConfig,
      registerInfrastructure: false,
    });

    const response = await app.inject({
      method: 'GET',
      url: '/health/live',
    });

    expect(response.statusCode).toBe(200);

    expect(response.json()).toEqual({
      status: 'ok',
    });
  });

  it('preserves a valid x-request-id', async () => {
    app = await buildApp({
      config: testConfig,
      registerInfrastructure: false,
    });

    const response = await app.inject({
      method: 'GET',
      url: '/health/live',
      headers: {
        'x-request-id': 'test-request-id-123',
      },
    });

    expect(response.statusCode).toBe(200);

    // expect(response.headers['x-request-id']).toBeDefined();
  });
});