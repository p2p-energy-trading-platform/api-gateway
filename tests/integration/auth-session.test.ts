import { randomUUID } from 'node:crypto';

import { Code, ConnectError } from '@connectrpc/connect';
import type { FastifyInstance } from 'fastify';
import { afterEach, describe, expect, it } from 'vitest';

import { buildApp } from '../../src/app.js';
import { startFakeAuthService, type FakeAuthService } from '../helpers/fake-auth-service.js';
import {
  signAccessToken,
  startFakeJwks,
  TEST_AUDIENCE,
  TEST_ISSUER,
  type FakeJwks,
} from '../helpers/fake-jwks.js';
import { testConfig } from '../helpers/test-config.js';

const ORIGIN = { origin: 'http://localhost:5173' };

describe('cookie sessions', () => {
  let app: FastifyInstance | undefined;
  let fake: FakeAuthService | undefined;
  let jwks: FakeJwks | undefined;
  const refreshCalls: string[] = [];
  const logoutCalls: string[] = [];

  interface SetupOptions {
    refreshFails?: boolean;
    logoutFails?: boolean;
  }

  async function setup(options: SetupOptions = {}) {
    refreshCalls.length = 0;
    logoutCalls.length = 0;
    jwks = await startFakeJwks();
    fake = await startFakeAuthService({
      getUser: async ({ userId }) => ({
        userId,
        email: 'user@example.com',
        status: 'ACTIVE',
        role: 'USER',
      }),
      refreshToken: async ({ refreshToken }) => {
        refreshCalls.push(refreshToken);

        if (options.refreshFails === true) {
          throw new ConnectError('Invalid refresh token', Code.Unauthenticated);
        }

        return { accessToken: 'new-access', refreshToken: 'new-refresh', expiresIn: 900 };
      },
      logout: async ({ refreshToken }) => {
        logoutCalls.push(refreshToken);

        if (options.logoutFails === true) {
          throw new ConnectError('Invalid refresh token', Code.Unauthenticated);
        }

        return { success: true };
      },
    });
    app = await buildApp({
      config: {
        ...testConfig,
        auth: {
          ...testConfig.auth,
          issuer: TEST_ISSUER,
          audience: TEST_AUDIENCE,
          jwksUri: jwks.url,
        },
        grpc: { ...testConfig.grpc, authServiceUrl: fake.url },
        rateLimit: { hashSecret: randomUUID() },
      },
      registerInfrastructure: true,
    });
    return app;
  }

  async function accessToken(subject = 'session-user-1') {
    if (jwks === undefined) {
      throw new Error('Test JWKS is not initialized');
    }

    return signAccessToken(jwks.key, { subject });
  }

  afterEach(async () => {
    await app?.close();
    await fake?.close();
    await jwks?.close();
    app = undefined;
    fake = undefined;
    jwks = undefined;
  });

  describe('GET /api/v1/auth/me', () => {
    it('authenticates with the access cookie', async () => {
      const instance = await setup();

      const response = await instance.inject({
        method: 'GET',
        url: '/api/v1/auth/me',
        cookies: { gridx_access: await accessToken() },
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({
        userId: 'session-user-1',
        email: 'user@example.com',
        status: 'ACTIVE',
        role: 'USER',
      });
    });

    it('prefers the Bearer header over the cookie', async () => {
      const instance = await setup();

      const response = await instance.inject({
        method: 'GET',
        url: '/api/v1/auth/me',
        headers: { authorization: `Bearer ${await accessToken('bearer-user')}` },
        cookies: { gridx_access: 'not-a-jwt' },
      });

      expect(response.statusCode).toBe(200);
      expect(response.json().userId).toBe('bearer-user');
    });

    it('rejects a malformed access cookie', async () => {
      const instance = await setup();

      const response = await instance.inject({
        method: 'GET',
        url: '/api/v1/auth/me',
        cookies: { gridx_access: 'not-a-jwt' },
      });

      expect(response.statusCode).toBe(401);
    });

    it('requires authentication', async () => {
      const instance = await setup();

      const response = await instance.inject({ method: 'GET', url: '/api/v1/auth/me' });

      expect(response.statusCode).toBe(401);
    });
  });

  describe('POST /api/v1/auth/refresh', () => {
    it('rotates both cookies using the refresh cookie', async () => {
      const instance = await setup();

      const response = await instance.inject({
        method: 'POST',
        url: '/api/v1/auth/refresh',
        headers: ORIGIN,
        cookies: { gridx_refresh: 'old-refresh' },
      });

      expect(response.statusCode).toBe(204);
      expect(refreshCalls).toEqual(['old-refresh']);
      expect(response.cookies).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ name: 'gridx_access', value: 'new-access', maxAge: 900 }),
          expect.objectContaining({ name: 'gridx_refresh', value: 'new-refresh' }),
        ]),
      );
    });

    it('returns 401 without a refresh cookie', async () => {
      const instance = await setup();

      const response = await instance.inject({ method: 'POST', url: '/api/v1/auth/refresh' });

      expect(response.statusCode).toBe(401);
      expect(refreshCalls).toEqual([]);
    });

    it('clears the cookies when auth-service rejects the refresh token', async () => {
      const instance = await setup({ refreshFails: true });

      const response = await instance.inject({
        method: 'POST',
        url: '/api/v1/auth/refresh',
        headers: ORIGIN,
        cookies: { gridx_refresh: 'revoked-refresh' },
      });

      expect(response.statusCode).toBe(401);
      expect(response.cookies).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ name: 'gridx_access', maxAge: 0 }),
          expect.objectContaining({ name: 'gridx_refresh', maxAge: 0 }),
        ]),
      );
    });
  });

  describe('POST /api/v1/auth/logout', () => {
    it('revokes the session in auth-service and clears both cookies', async () => {
      const instance = await setup();

      const response = await instance.inject({
        method: 'POST',
        url: '/api/v1/auth/logout',
        headers: ORIGIN,
        cookies: { gridx_access: await accessToken(), gridx_refresh: 'refresh-1' },
      });

      expect(response.statusCode).toBe(204);
      expect(logoutCalls).toEqual(['refresh-1']);
      expect(response.cookies).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ name: 'gridx_access', maxAge: 0 }),
          expect.objectContaining({ name: 'gridx_refresh', maxAge: 0 }),
        ]),
      );
    });

    it('still logs out when the access token has expired', async () => {
      const instance = await setup();

      const response = await instance.inject({
        method: 'POST',
        url: '/api/v1/auth/logout',
        headers: ORIGIN,
        cookies: { gridx_refresh: 'refresh-1' },
      });

      expect(response.statusCode).toBe(204);
      expect(logoutCalls).toEqual(['refresh-1']);
    });

    it('succeeds when the refresh token was already revoked', async () => {
      const instance = await setup({ logoutFails: true });

      const response = await instance.inject({
        method: 'POST',
        url: '/api/v1/auth/logout',
        headers: ORIGIN,
        cookies: { gridx_refresh: 'revoked-refresh' },
      });

      expect(response.statusCode).toBe(204);
    });

    it('rejects a cookie request from an unknown origin (CSRF)', async () => {
      const instance = await setup();

      const response = await instance.inject({
        method: 'POST',
        url: '/api/v1/auth/logout',
        headers: { origin: 'https://evil.example' },
        cookies: { gridx_refresh: 'refresh-1' },
      });

      expect(response.statusCode).toBe(403);
      expect(logoutCalls).toEqual([]);
    });
  });
});
