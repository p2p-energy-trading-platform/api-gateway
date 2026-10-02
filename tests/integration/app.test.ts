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

    expect(response.headers['x-request-id']).toBe('test-request-id-123');
  });

  it('generates a new request ID when none is sent', async () => {
    app = await buildApp({
      config: testConfig,
      registerInfrastructure: false,
    });

    const response = await app.inject({
      method: 'GET',
      url: '/health/live',
    });

    expect(response.headers['x-request-id']).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('replaces an incoming request ID that contains unsafe characters', async () => {
    app = await buildApp({
      config: testConfig,
      registerInfrastructure: false,
    });

    const response = await app.inject({
      method: 'GET',
      url: '/health/live',
      headers: {
        'x-request-id': '<script>alert(1)</script>',
      },
    });

    expect(response.headers['x-request-id']).toMatch(/^[0-9a-f-]{36}$/);
  });
});
