import { randomUUID } from 'node:crypto';

import { afterEach, describe, expect, it } from 'vitest';
import type { FastifyInstance, InjectOptions } from 'fastify';

import { buildApp } from '../../src/app.js';
import type { AppConfig } from '../../src/config/types.js';
import { hashIdentity, rateLimitKey } from '../../src/transport/redis/keys.js';
import { testConfig } from '../helpers/test-config.js';

// Sends the same request several times, one after another.
async function send(app: FastifyInstance, times: number, options: InjectOptions) {
  const responses = [];

  for (let i = 0; i < times; i += 1) {
    responses.push(await app.inject(options));
  }

  return responses;
}

/*
 * These tests need a real Redis at testConfig.redis.url (CI provides one as a service).
 * Each app gets a random hash secret, so every test uses fresh Redis keys.
 */
describe('rate limiting', () => {
  const apps: FastifyInstance[] = [];

  async function build(overrides: Partial<AppConfig> = {}, hashSecret = randomUUID()) {
    const config: AppConfig = { ...testConfig, ...overrides, rateLimit: { hashSecret } };
    const app = await buildApp({ config, registerInfrastructure: true });

    app.get('/test/public', async () => ({ ok: true }));
    app.post('/test/login', { config: { rateLimit: 'auth-login' } }, async () => ({ ok: true }));

    apps.push(app);

    return app;
  }

  const login: InjectOptions = { method: 'POST', url: '/test/login' };

  afterEach(async () => {
    await Promise.all(apps.splice(0).map((app) => app.close()));
  });

  it('adds rate-limit headers and counts down the remaining quota', async () => {
    const app = await build();

    const [first, second] = await send(app, 2, { method: 'GET', url: '/test/public' });

    expect(first?.statusCode).toBe(200);
    expect(first?.headers['ratelimit-limit']).toBe('100');
    expect(first?.headers['ratelimit-remaining']).toBe('99');
    expect(second?.headers['ratelimit-remaining']).toBe('98');
    expect(Number(first?.headers['ratelimit-reset'])).toBeGreaterThan(0);
  });

  it('returns 429 with Retry-After and the standard error once the limit is reached', async () => {
    const app = await build();

    const responses = await send(app, 11, login);
    const allowed = responses.slice(0, 10);
    const rejected = responses[10];

    expect(allowed.every((response) => response.statusCode === 200)).toBe(true);
    expect(rejected?.statusCode).toBe(429);
    expect(rejected?.json()).toEqual({
      error: expect.objectContaining({ code: 'RATE_LIMITED', requestId: expect.any(String) }),
    });
    expect(Number(rejected?.headers['retry-after'])).toBeGreaterThanOrEqual(1);
    expect(rejected?.headers['ratelimit-remaining']).toBe('0');
  });

  it('keeps separate quotas per policy', async () => {
    const app = await build();

    await send(app, 11, login);

    const publicResponse = await app.inject({ method: 'GET', url: '/test/public' });

    expect(publicResponse.statusCode).toBe(200);
  });

  it('keeps separate quotas per client IP', async () => {
    const app = await build();

    await send(app, 11, { ...login, remoteAddress: '10.0.0.1' });

    const otherClient = await app.inject({ ...login, remoteAddress: '10.0.0.2' });

    expect(otherClient.statusCode).toBe(200);
  });

  it('groups IPv6 clients by their /64 block', async () => {
    const app = await build();

    for (let i = 1; i <= 10; i += 1) {
      await app.inject({ ...login, remoteAddress: `2001:db8:1:2::${i.toString(16)}` });
    }

    const sameBlock = await app.inject({ ...login, remoteAddress: '2001:db8:1:2:ffff::1' });
    const otherBlock = await app.inject({ ...login, remoteAddress: '2001:db8:1:3::1' });

    expect(sameBlock.statusCode).toBe(429);
    expect(otherBlock.statusCode).toBe(200);
  });

  it('ignores a spoofed X-Forwarded-For when no proxy is trusted', async () => {
    const app = await build();

    for (let i = 1; i <= 10; i += 1) {
      await app.inject({ ...login, headers: { 'x-forwarded-for': `198.51.100.${i}` } });
    }

    const response = await app.inject({
      ...login,
      headers: { 'x-forwarded-for': '198.51.100.99' },
    });

    expect(response.statusCode).toBe(429);
  });

  it('uses X-Forwarded-For when the proxy address is trusted', async () => {
    // inject() connects from 127.0.0.1, which acts as the proxy here.
    const app = await build({ http: { ...testConfig.http, trustProxy: ['127.0.0.1'] } });

    await send(app, 11, { ...login, headers: { 'x-forwarded-for': '203.0.113.5' } });

    const otherClient = await app.inject({
      ...login,
      headers: { 'x-forwarded-for': '203.0.113.6' },
    });

    expect(otherClient.statusCode).toBe(200);
  });

  it('does not rate limit health checks', async () => {
    const app = await build();

    const response = await app.inject({ method: 'GET', url: '/health/live' });

    expect(response.statusCode).toBe(200);
    expect(response.headers['ratelimit-limit']).toBeUndefined();
  });

  it('rate limits unknown routes with the default policy', async () => {
    const app = await build();

    const response = await app.inject({ method: 'GET', url: '/does-not-exist' });

    expect(response.statusCode).toBe(404);
    expect(response.headers['ratelimit-limit']).toBe('100');
  });

  it('enforces one shared limit across gateway replicas under concurrent load', async () => {
    const hashSecret = randomUUID();
    const replicaA = await build({}, hashSecret);
    const replicaB = await build({}, hashSecret);

    const responses = await Promise.all(
      Array.from({ length: 25 }, (_, i) => (i % 2 === 0 ? replicaA : replicaB).inject(login)),
    );

    const allowed = responses.filter((response) => response.statusCode === 200);
    const rejected = responses.filter((response) => response.statusCode === 429);

    expect(allowed).toHaveLength(10);
    expect(rejected).toHaveLength(15);
  });

  it('stores keys with a TTL no longer than the window', async () => {
    const hashSecret = randomUUID();
    const app = await build({}, hashSecret);

    await app.inject(login);

    const key = rateLimitKey('test', 'auth-login', hashIdentity(hashSecret, '127.0.0.1'));
    const ttl = await app.redis.pttl(key);

    expect(ttl).toBeGreaterThan(0);
    expect(ttl).toBeLessThanOrEqual(60_000);
  });

  it('counts allowed and denied decisions per policy in metrics', async () => {
    const app = await build();

    await send(app, 11, login);

    const text = await app.metrics.registry.metrics();

    expect(text).toContain(
      'gateway_rate_limit_decisions_total{policy="auth-login",result="allowed"} 10',
    );
    expect(text).toContain(
      'gateway_rate_limit_decisions_total{policy="auth-login",result="denied"} 1',
    );
    expect(text).toContain('gateway_rate_limit_duration_seconds_count{policy="auth-login"} 11');
  });

  it('returns 503 and becomes unready when Redis is unavailable', async () => {
    const app = await build();

    app.redis.disconnect();

    const response = await app.inject({ method: 'GET', url: '/test/public' });
    const readiness = await app.inject({ method: 'GET', url: '/health/ready' });

    const text = await app.metrics.registry.metrics();

    expect(response.statusCode).toBe(503);
    expect(response.json().error.code).toBe('UPSTREAM_UNAVAILABLE');
    expect(readiness.statusCode).toBe(503);
     expect(text).toContain('gateway_rate_limit_errors_total{policy="public-read"} 1');
  });
});
