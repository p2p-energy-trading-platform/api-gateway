import { randomUUID } from 'node:crypto';

import type { FastifyInstance } from 'fastify';
import { afterEach, describe, expect, it } from 'vitest';

import { buildApp } from '../../src/app.js';
import { startFakeAuthService, type FakeAuthService } from '../helpers/fake-auth-service.js';
import { testConfig } from '../helpers/test-config.js';

const URL = '/api/v1/auth/password-reset';
const VALID_BODY = { email: 'user@example.com' };

describe('POST /api/v1/auth/password-reset', () => {
  let app: FastifyInstance | undefined;
  let fake: FakeAuthService | undefined;
  let received: string[] = [];

  async function setup() {
    received = [];

    fake = await startFakeAuthService({
      requestPasswordReset: async (req) => {
        received.push(req.email);
        return { success: true } as never;
      },
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

  it('returns success and forwards the email to auth-service', async () => {
    const instance = await setup();

    const response = await instance.inject({
      method: 'POST',
      url: URL,
      payload: VALID_BODY,
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ success: true });
    expect(received).toEqual([VALID_BODY.email]);
  });

  it('rejects an invalid email without calling auth-service', async () => {
    const instance = await setup();

    const response = await instance.inject({
      method: 'POST',
      url: URL,
      payload: { email: 'not-an-email' },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json().error.code).toBe('VALIDATION_ERROR');
    expect(received).toHaveLength(0);
  });

  it('rejects missing email and unknown fields', async () => {
    const instance = await setup();

    const missingEmail = await instance.inject({
      method: 'POST',
      url: URL,
      payload: {},
    });

    const unknownField = await instance.inject({
      method: 'POST',
      url: URL,
      payload: { ...VALID_BODY, role: 'admin' },
    });

    expect(missingEmail.statusCode).toBe(400);
    expect(unknownField.statusCode).toBe(400);
    expect(received).toHaveLength(0);
  });

  it('limits requests to 10 per minute', async () => {
    const instance = await setup();
    const statusCodes: number[] = [];

    for (let i = 0; i < 11; i += 1) {
      const response = await instance.inject({
        method: 'POST',
        url: URL,
        payload: VALID_BODY,
      });

      statusCodes.push(response.statusCode);
    }

    expect(statusCodes.filter((code) => code === 200)).toHaveLength(10);
    expect(statusCodes.filter((code) => code === 429)).toHaveLength(1);
  });
});

const CONFIRM_URL = '/api/v1/auth/password-reset/confirm';
const VALID_RESET_BODY = {
  token: 'test-reset-token',
  newPassword: 'new-password-123',
};

describe('POST /api/v1/auth/password-reset/confirm', () => {
  let app: FastifyInstance | undefined;
  let fake: FakeAuthService | undefined;
  let received: Array<{ token: string; newPassword: string }> = [];

  async function setup() {
    received = [];

    fake = await startFakeAuthService({
      resetPassword: async (req) => {
        received.push({
          token: req.token,
          newPassword: req.newPassword,
        });
        return { success: true } as never;
      },
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

  it('returns success and forwards the token and new password', async () => {
    const instance = await setup();

    const response = await instance.inject({
      method: 'POST',
      url: CONFIRM_URL,
      payload: VALID_RESET_BODY,
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ success: true });
    expect(received).toEqual([VALID_RESET_BODY]);
  });

  it('rejects missing token and passwords shorter than 8 characters', async () => {
    const instance = await setup();

    const missingToken = await instance.inject({
      method: 'POST',
      url: CONFIRM_URL,
      payload: { ...VALID_RESET_BODY, token: '' },
    });

    const shortPassword = await instance.inject({
      method: 'POST',
      url: CONFIRM_URL,
      payload: { ...VALID_RESET_BODY, newPassword: 'short' },
    });

    expect(missingToken.statusCode).toBe(400);
    expect(shortPassword.statusCode).toBe(400);
    expect(received).toHaveLength(0);
  });

  it('limits confirmation requests to 10 per minute', async () => {
    const instance = await setup();
    const statusCodes: number[] = [];

    for (let i = 0; i < 11; i += 1) {
      const response = await instance.inject({
        method: 'POST',
        url: CONFIRM_URL,
        payload: VALID_RESET_BODY,
      });

      statusCodes.push(response.statusCode);
    }

    expect(statusCodes.filter((code) => code === 200)).toHaveLength(10);
    expect(statusCodes.filter((code) => code === 429)).toHaveLength(1);
  });
});
