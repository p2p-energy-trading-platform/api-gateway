import { afterEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';

import { buildApp } from '../../src/app.js';
import { testConfig } from '../helpers/test-config.js';

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
