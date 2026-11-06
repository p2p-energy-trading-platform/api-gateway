import { afterEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';

import { buildApp } from '../../src/app.js';
import type { AppConfig } from '../../src/config/types.js';
import { testConfig } from '../helpers/test-config.js';

const ALLOWED_ORIGIN = 'http://localhost:5173';
const UNKNOWN_ORIGIN = 'https://evil.example.com';

describe('CORS and security headers', () => {
  let app: FastifyInstance | undefined;

  async function build(config: AppConfig = testConfig): Promise<FastifyInstance> {
    app = await buildApp({ config, registerInfrastructure: false });

    return app;
  }

  afterEach(async () => {
    await app?.close();
    app = undefined;
  });

  describe('CORS', () => {
    it('allows a configured origin and exposes X-Request-Id', async () => {
      const response = await (await build()).inject({
        method: 'GET',
        url: '/health/live',
        headers: { origin: ALLOWED_ORIGIN },
      });

      expect(response.headers['access-control-allow-origin']).toBe(ALLOWED_ORIGIN);
      expect(response.headers['access-control-expose-headers']).toBe('X-Request-Id, Retry-After');
    });

    it('does not allow an unknown origin', async () => {
      const response = await (await build()).inject({
        method: 'GET',
        url: '/health/live',
        headers: { origin: UNKNOWN_ORIGIN },
      });

      expect(response.headers['access-control-allow-origin']).toBeUndefined();
    });

    it('answers a preflight request with allowed methods, headers, and max age', async () => {
      const response = await (await build()).inject({
        method: 'OPTIONS',
        url: '/health/live',
        headers: {
          origin: ALLOWED_ORIGIN,
          'access-control-request-method': 'POST',
          'access-control-request-headers': 'authorization,content-type',
        },
      });

      expect(response.statusCode).toBe(204);
      expect(response.headers['access-control-allow-origin']).toBe(ALLOWED_ORIGIN);
      expect(response.headers['access-control-allow-methods']).toContain('POST');
      expect(response.headers['access-control-allow-headers']).toBe(
        'Authorization, Content-Type, X-Request-Id, Idempotency-Key',
      );
      expect(response.headers['access-control-max-age']).toBe('600');
    });

    it('allows credentials for configured origins', async () => {
      const response = await (await build()).inject({
        method: 'GET',
        url: '/health/live',
        headers: { origin: ALLOWED_ORIGIN },
      });

      expect(response.headers['access-control-allow-credentials']).toBe('true');
    });
  });

  describe('security headers', () => {
    it('sets API-focused security headers on every response', async () => {
      const response = await (await build()).inject({ method: 'GET', url: '/health/live' });

      expect(response.headers['content-security-policy']).toBe(
        "default-src 'none';frame-ancestors 'none'",
      );
      expect(response.headers['x-content-type-options']).toBe('nosniff');
      expect(response.headers['x-frame-options']).toBe('SAMEORIGIN');
      expect(response.headers['referrer-policy']).toBe('no-referrer');
      expect(response.headers['cache-control']).toBe('no-store');
    });

    it('also sets security headers on error responses', async () => {
      const response = await (await build()).inject({ method: 'GET', url: '/does-not-exist' });

      expect(response.statusCode).toBe(404);
      expect(response.headers['content-security-policy']).toBeDefined();
      expect(response.headers['cache-control']).toBe('no-store');
      expect(response.headers['x-request-id']).toBeDefined();
    });

    it('does not send HSTS outside production', async () => {
      const response = await (await build()).inject({ method: 'GET', url: '/health/live' });

      expect(response.headers['strict-transport-security']).toBeUndefined();
    });

    it('sends HSTS in production', async () => {
      const productionConfig: AppConfig = {
        ...testConfig,
        nodeEnv: 'production',
        cors: { origins: ['https://app.gridx.io'] },
      };

      const response = await (await build(productionConfig)).inject({
        method: 'GET',
        url: '/health/live',
      });

      expect(response.headers['strict-transport-security']).toBe(
        'max-age=31536000; includeSubDomains',
      );
    });

    it('keeps a Cache-Control header set by the route', async () => {
      const instance = await build();

      instance.get('/test/cacheable', async (_request, reply) => {
        reply.header('cache-control', 'public, max-age=60');

        return { ok: true };
      });

      const response = await instance.inject({ method: 'GET', url: '/test/cacheable' });

      expect(response.headers['cache-control']).toBe('public, max-age=60');
    });
  });
});
