import { randomUUID } from 'node:crypto';

import { Code, ConnectError } from '@connectrpc/connect';
import type { FastifyInstance } from 'fastify';
import { afterEach, describe, expect, it } from 'vitest';

import { buildApp } from '../../src/app.js';
import { hashAccessToken, sessionKey } from '../../src/features/auth/session-store.js';
import { startFakeAuthService, type FakeAuthService } from '../helpers/fake-auth-service.js';
import { testConfig } from '../helpers/test-config.js';

const URL = '/api/v1/auth/login';
const VALID_BODY = { email: 'user@example.com', password: 'password' };
const ACCESS_TOKEN = 'access-token-for-test';

describe('POST /api/v1/auth/login', () => {
  let app: FastifyInstance | undefined;
  let fake: FakeAuthService | undefined;

  async function setup(login: () => unknown = () => ({
    userId: 'user-1',
    email: VALID_BODY.email,
    accessToken: ACCESS_TOKEN,
    refreshToken: 'refresh-token-must-not-be-used',
    expiresIn: 60n,
  })) {
    fake = await startFakeAuthService({
      login: async () => login() as never,
    });
    app = await buildApp({
      config: {
        ...testConfig,
        grpc: { ...testConfig.grpc, authServiceUrl: fake.url },
        rateLimit: { hashSecret: randomUUID() },
      },
      registerInfrastructure: true,
    });
    return app;
  }

  afterEach(async () => {
    await app?.close();
    await fake?.close();
    app = undefined;
    fake = undefined;
  });

  it('stores a hash, sets the access cookie, and returns no token', async () => {
    const instance = await setup();

    const response = await instance.inject({
      method: 'POST',
      url: URL,
      payload: VALID_BODY,
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ userId: 'user-1', email: VALID_BODY.email });
    expect(response.body).not.toContain(ACCESS_TOKEN);
    expect(response.body).not.toContain('refresh-token');
    const setCookie = response.headers['set-cookie'];
    expect(setCookie).toContain('gridx_access=');
    expect(setCookie).toContain('HttpOnly');
    expect(setCookie).toContain('Path=/');
    expect(setCookie).toContain('SameSite=Lax');
    expect(setCookie).toContain('Max-Age=60');
    expect(setCookie).not.toContain('gridx_refresh');
    expect(await instance.redis.get(sessionKey('user-1'))).toBe(hashAccessToken(ACCESS_TOKEN));
    expect(await instance.redis.ttl(sessionKey('user-1'))).toBeGreaterThan(0);
  });

  it('replaces the previous session for the same user', async () => {
    let accessToken = 'first-access-token';
    const instance = await setup(() => ({
      userId: 'user-2',
      email: VALID_BODY.email,
      accessToken,
      refreshToken: 'ignored',
      expiresIn: 60n,
    }));

    await instance.inject({ method: 'POST', url: URL, payload: VALID_BODY });
    accessToken = 'second-access-token';
    await instance.inject({ method: 'POST', url: URL, payload: VALID_BODY });

    expect(await instance.redis.get(sessionKey('user-2'))).toBe(hashAccessToken(accessToken));
  });

  it('passes through invalid credentials without setting a cookie', async () => {
    const instance = await setup(() => {
      throw new ConnectError('Invalid credentials', Code.Unauthenticated);
    });

    const response = await instance.inject({
      method: 'POST',
      url: URL,
      payload: VALID_BODY,
    });

    expect(response.statusCode).toBe(401);
    expect(response.headers['set-cookie']).toBeUndefined();
  });

  it.each([
    ['missing password', { email: VALID_BODY.email }],
    ['unknown field', { ...VALID_BODY, role: 'admin' }],
  ])('rejects %s before calling auth-service', async (_name, payload) => {
    const instance = await setup();

    const response = await instance.inject({ method: 'POST', url: URL, payload });

    expect(response.statusCode).toBe(400);
    expect(response.json().error.code).toBe('VALIDATION_ERROR');
  });

  it('returns 429 on the eleventh attempt', async () => {
    const instance = await setup();
    const responses = await Promise.all(
      Array.from({ length: 11 }, () =>
        instance.inject({ method: 'POST', url: URL, payload: VALID_BODY }),
      ),
    );

    const limited = responses.find((response) => response.statusCode === 429);

    expect(limited?.headers['retry-after']).toBeDefined();
  });

  it('returns 503 and does not set a cookie when Redis is unavailable', async () => {
    const instance = await setup();
    await instance.redis.disconnect();

    const response = await instance.inject({
      method: 'POST',
      url: URL,
      payload: VALID_BODY,
    });

    expect(response.statusCode).toBe(503);
    expect(response.headers['set-cookie']).toBeUndefined();
  });
});
