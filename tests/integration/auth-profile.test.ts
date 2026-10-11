import { randomUUID } from 'node:crypto';

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

const PROFILE = {
  userId: 'profile-user-1',
  email: 'user@example.com',
  name: 'Test User',
  status: 'ACTIVE',
  createdAt: '2026-01-15T10:00:00Z',
};

const ACCESS_COOKIE = 'gridx_access';

describe('profile and account-management routes', () => {
  let app: FastifyInstance | undefined;
  let fake: FakeAuthService | undefined;
  let jwks: FakeJwks | undefined;

  const calls: Record<string, unknown[]> = {};

  function record(method: string, value: unknown) {
    (calls[method] ??= []).push(value);
  }

  async function setup() {
    for (const key of Object.keys(calls)) {
      delete calls[key];
    }

    jwks = await startFakeJwks();

    fake = await startFakeAuthService({
      getProfile: async (req) => {
        record('getProfile', req);
        return { profile: PROFILE } as never;
      },
      updateProfile: async (req) => {
        record('updateProfile', req);
        return {
          profile: { ...PROFILE, name: req.name },
        } as never;
      },
      changePassword: async (req) => {
        record('changePassword', req);
        return { success: true } as never;
      },
      requestEmailChange: async (req) => {
        record('requestEmailChange', req);
        return { success: true } as never;
      },
      verifyEmailChange: async (req) => {
        record('verifyEmailChange', req);
        return {
          profile: { ...PROFILE, email: 'new@example.com' },
        } as never;
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
        grpc: {
          ...testConfig.grpc,
          authServiceUrl: fake.url,
        },
        rateLimit: { hashSecret: randomUUID() },
      },
      registerInfrastructure: true,
    });

    return app;
  }

  async function accessToken() {
    if (jwks === undefined) {
      throw new Error('Test JWKS is not initialized');
    }

    return signAccessToken(jwks.key, { subject: PROFILE.userId });
  }

  async function authenticatedRequest(
    method: 'GET' | 'PATCH' | 'POST',
    url: string,
    payload?: Record<string, unknown>,
  ) {
    if (app === undefined) {
      throw new Error('Test app is not initialized');
    }

    return app.inject({
      method,
      url,
      headers: { origin: 'http://localhost:5173' },
      cookies: { [ACCESS_COOKIE]: await accessToken() },
      ...(payload === undefined ? {} : { payload }),
    });
  }

  afterEach(async () => {
    await app?.close();
    await fake?.close();
    await jwks?.close();
    app = undefined;
    fake = undefined;
    jwks = undefined;
  });

  describe('GET /api/v1/auth/profile', () => {
    it('returns the authenticated user profile', async () => {
      await setup();

      const response = await authenticatedRequest('GET', '/api/v1/auth/profile');

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual(PROFILE);
      expect(calls.getProfile).toHaveLength(1);
    });

    it('requires authentication', async () => {
      const instance = await setup();

      const response = await instance.inject({
        method: 'GET',
        url: '/api/v1/auth/profile',
      });

      expect(response.statusCode).toBe(401);
      expect(calls.getProfile ?? []).toHaveLength(0);
    });
  });

  describe('PATCH /api/v1/auth/profile', () => {
    it('updates the profile name and returns the updated profile', async () => {
      await setup();

      const response = await authenticatedRequest('PATCH', '/api/v1/auth/profile', {
        name: 'Updated User',
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({
        ...PROFILE,
        name: 'Updated User',
      });
      expect(calls.updateProfile?.[0]).toMatchObject({
        name: 'Updated User',
      });
    });

    it('rejects empty names and unknown fields', async () => {
      await setup();

      const emptyName = await authenticatedRequest('PATCH', '/api/v1/auth/profile', { name: '' });

      const unknownField = await authenticatedRequest('PATCH', '/api/v1/auth/profile', {
        name: 'Valid Name',
        role: 'ADMIN',
      });

      expect(emptyName.statusCode).toBe(400);
      expect(unknownField.statusCode).toBe(400);
      expect(calls.updateProfile ?? []).toHaveLength(0);
    });
  });

  describe('POST /api/v1/auth/change-password', () => {
    it('forwards the current and new passwords', async () => {
      await setup();

      const payload = {
        currentPassword: 'current-password',
        newPassword: 'new-password-123',
      };

      const response = await authenticatedRequest('POST', '/api/v1/auth/change-password', payload);

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({ success: true });
      expect(calls.changePassword?.[0]).toMatchObject(payload);
    });

    it('rejects a new password shorter than eight characters', async () => {
      await setup();

      const response = await authenticatedRequest('POST', '/api/v1/auth/change-password', {
        currentPassword: 'current-password',
        newPassword: 'short',
      });

      expect(response.statusCode).toBe(400);
      expect(calls.changePassword ?? []).toHaveLength(0);
    });
  });

  describe('POST /api/v1/auth/email-change', () => {
    it('requests verification for the new email address', async () => {
      await setup();

      const response = await authenticatedRequest('POST', '/api/v1/auth/email-change', {
        newEmail: 'new@example.com',
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({ success: true });
      expect(calls.requestEmailChange?.[0]).toMatchObject({
        newEmail: 'new@example.com',
      });
    });

    it('rejects an invalid email address', async () => {
      await setup();

      const response = await authenticatedRequest('POST', '/api/v1/auth/email-change', {
        newEmail: 'not-an-email',
      });

      expect(response.statusCode).toBe(400);
      expect(calls.requestEmailChange ?? []).toHaveLength(0);
    });

    it('requires authentication', async () => {
      const instance = await setup();

      const response = await instance.inject({
        method: 'POST',
        url: '/api/v1/auth/email-change',
        payload: { newEmail: 'new@example.com' },
      });

      expect(response.statusCode).toBe(401);
      expect(calls.requestEmailChange ?? []).toHaveLength(0);
    });
  });

  describe('POST /api/v1/auth/email-change/verify', () => {
    it('verifies the token and returns the updated profile', async () => {
      await setup();

      const response = await authenticatedRequest('POST', '/api/v1/auth/email-change/verify', {
        token: 'email-change-verification-token',
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({
        ...PROFILE,
        email: 'new@example.com',
      });
      expect(calls.verifyEmailChange?.[0]).toMatchObject({
        token: 'email-change-verification-token',
      });
    });

    it('allows verification without an authenticated session', async () => {
      const instance = await setup();

      const response = await instance.inject({
        method: 'POST',
        url: '/api/v1/auth/email-change/verify',
        payload: { token: 'email-change-verification-token' },
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({
        ...PROFILE,
        email: 'new@example.com',
      });
      expect(calls.verifyEmailChange).toHaveLength(1);
    });

    it('rejects an empty verification token', async () => {
      await setup();

      const response = await authenticatedRequest('POST', '/api/v1/auth/email-change/verify', {
        token: '',
      });

      expect(response.statusCode).toBe(400);
      expect(calls.verifyEmailChange ?? []).toHaveLength(0);
    });
  });
});
