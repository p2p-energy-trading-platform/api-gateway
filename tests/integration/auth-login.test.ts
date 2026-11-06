import { randomUUID } from 'node:crypto';

import { Code, ConnectError } from '@connectrpc/connect';
import type { FastifyInstance } from 'fastify';
import { afterEach, describe, expect, it } from 'vitest';

import { buildApp } from '../../src/app.js';
import { startFakeAuthService, type FakeAuthService } from '../helpers/fake-auth-service.js';
import { testConfig } from '../helpers/test-config.js';

const URL = '/api/v1/auth/login';
const VALID_BODY = { email: 'user@example.com', password: 'password' };
const ACCESS_TOKEN = 'access-token-for-test';
const REFRESH_TOKEN = 'refresh-token-for-test';

describe('POST /api/v1/auth/login', () => {
  let app: FastifyInstance | undefined;
  let fake: FakeAuthService | undefined;

  async function setup(
    login: () => unknown = () => ({
      userId: 'user-1',
      email: VALID_BODY.email,
      accessToken: ACCESS_TOKEN,
      refreshToken: REFRESH_TOKEN,
      expiresIn: 60n,
    }),
    cookies = testConfig.cookies,
  ) {
    fake = await startFakeAuthService({
      login: async () => login() as never,
    });
    app = await buildApp({
      config: {
        ...testConfig,
        cookies,
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

  it('sets the access and refresh cookies and returns no token', async () => {
    const instance = await setup();

    const response = await instance.inject({ method: 'POST', url: URL, payload: VALID_BODY });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ userId: 'user-1', email: VALID_BODY.email });
    expect(response.body).not.toContain(ACCESS_TOKEN);
    expect(response.body).not.toContain(REFRESH_TOKEN);

    const access = response.cookies.find((cookie) => cookie.name === 'gridx_access');
    const refresh = response.cookies.find((cookie) => cookie.name === 'gridx_refresh');

    expect(access).toMatchObject({
      value: ACCESS_TOKEN,
      path: '/',
      maxAge: 60,
      httpOnly: true,
      secure: true,
      sameSite: 'Lax',
    });
    expect(refresh).toMatchObject({
      value: REFRESH_TOKEN,
      path: '/api/v1/auth',
      maxAge: testConfig.cookies.refreshMaxAgeSeconds,
      httpOnly: true,
      secure: true,
      sameSite: 'Lax',
    });
  });

  it('uses the configured SameSite and domain', async () => {
    const instance = await setup(undefined, {
      ...testConfig.cookies,
      sameSite: 'strict',
      domain: 'example.com',
    });

    const response = await instance.inject({ method: 'POST', url: URL, payload: VALID_BODY });

    for (const cookie of response.cookies) {
      expect(cookie).toMatchObject({ sameSite: 'Strict', domain: 'example.com' });
    }
  });

  it('passes through invalid credentials without setting a cookie', async () => {
    const instance = await setup(() => {
      throw new ConnectError('Invalid credentials', Code.Unauthenticated);
    });

    const response = await instance.inject({ method: 'POST', url: URL, payload: VALID_BODY });

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
});
