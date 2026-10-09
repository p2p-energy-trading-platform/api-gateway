import { randomUUID } from 'node:crypto';

import type { FastifyInstance } from 'fastify';
import { afterEach, describe, expect, it } from 'vitest';

import { buildApp } from '../../src/app.js';
import { hashAccessToken, sessionKey } from '../../src/features/auth/session-store.js';
import { startAuthTestKeys } from '../helpers/auth-test-keys.js';
import { createAccessToken } from '../helpers/auth-test-keys.js';
import { startFakeAuthService, type FakeAuthService } from '../helpers/fake-auth-service.js';
import { testConfig } from '../helpers/test-config.js';

describe('cookie authentication and sessions', () => {
  let app: FastifyInstance | undefined;
  let fake: FakeAuthService | undefined;
  let keys: Awaited<ReturnType<typeof startAuthTestKeys>> | undefined;

  async function setup() {
    keys = await startAuthTestKeys();
    fake = await startFakeAuthService({
      getUser: async ({ userId }) => ({
        userId,
        email: 'user@example.com',
        status: 'ACTIVE',
        role: 'USER',
      }),
    });
    app = await buildApp({
      config: {
        ...testConfig,
        auth: { ...testConfig.auth, jwksUri: keys.jwksUri },
        grpc: { ...testConfig.grpc, authServiceUrl: fake.url },
        rateLimit: { hashSecret: randomUUID() },
      },
      registerInfrastructure: true,
    });
    return app;
  }

  async function seedSession(userId: string, suffix: string) {
    if (keys === undefined || app === undefined) {
      throw new Error('Test application is not initialized');
    }

    const token = createAccessToken(keys.privateKey, userId, suffix);
    await app.redis.set(sessionKey(userId), hashAccessToken(token), { EX: 300 });
    return token;
  }

  afterEach(async () => {
    await app?.close();
    await fake?.close();
    await keys?.close();
    app = undefined;
    fake = undefined;
    keys = undefined;
  });

  it('authenticates with the access cookie and restores the session', async () => {
    const instance = await setup();
    const token = await seedSession('session-user-1', 'first');

    const response = await instance.inject({
      method: 'GET',
      url: '/api/v1/auth/me',
      cookies: { gridx_access: token },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      userId: 'session-user-1',
      email: 'user@example.com',
      status: 'ACTIVE',
      role: 'USER',
    });
  });

  it('rejects a valid token without a matching Redis session', async () => {
    const instance = await setup();
    if (keys === undefined) {
      throw new Error('Test keys are not initialized');
    }
    const token = createAccessToken(keys.privateKey, 'session-user-1', 'missing');

    const response = await instance.inject({
      method: 'GET',
      url: '/api/v1/auth/me',
      cookies: { gridx_access: token },
    });

    expect(response.statusCode).toBe(401);
  });

  it('prefers a valid Bearer token over the cookie', async () => {
    const instance = await setup();
    const bearerToken = await seedSession('session-user-1', 'bearer');
    if (keys === undefined) {
      throw new Error('Test keys are not initialized');
    }
    const cookieToken = createAccessToken(keys.privateKey, 'session-user-1', 'cookie');

    const response = await instance.inject({
      method: 'GET',
      url: '/api/v1/auth/me',
      headers: { authorization: `Bearer ${bearerToken}` },
      cookies: { gridx_access: cookieToken },
    });

    expect(response.statusCode).toBe(200);
  });

  it('clears the cookie and deletes the Redis session on logout', async () => {
    const instance = await setup();
    const token = await seedSession('session-user-1', 'logout');

    const response = await instance.inject({
      method: 'POST',
      url: '/api/v1/auth/logout',
      headers: { origin: 'http://localhost:5173' },
      cookies: { gridx_access: token },
    });

    expect(response.statusCode).toBe(204);
    expect(response.headers['set-cookie']).toContain('gridx_access=');
    expect(response.headers['set-cookie']).toContain('Max-Age=0');
    expect(await instance.redis.get(sessionKey('session-user-1'))).toBeNull();

    const me = await instance.inject({
      method: 'GET',
      url: '/api/v1/auth/me',
      cookies: { gridx_access: token },
    });
    expect(me.statusCode).toBe(401);
  });

  it('requires authentication for /me and logout', async () => {
    const instance = await setup();

    expect((await instance.inject({ method: 'GET', url: '/api/v1/auth/me' })).statusCode).toBe(401);
    expect(
      (await instance.inject({ method: 'POST', url: '/api/v1/auth/logout' })).statusCode,
    ).toBe(401);
  });
});
