import { randomUUID } from 'node:crypto';

import { Code, ConnectError } from '@connectrpc/connect';
import type { FastifyInstance } from 'fastify';
import { afterEach, describe, expect, it } from 'vitest';

import { buildApp } from '../../src/app.js';
import { startFakeAuthService, type FakeAuthService } from '../helpers/fake-auth-service.js';
import { testConfig } from '../helpers/test-config.js';

const URL = '/api/v1/auth/register';
const ALLOWED_ORIGIN = 'http://localhost:5173';
const UNKNOWN_ORIGIN = 'https://evil.example.com';
const VALID_BODY = { email: 'new@example.com', password: 'a-long-password' };

function registerSucceeds(email: string) {
  return { userId: 'user-1', email, status: 'active', createdAt: '2026-10-06T10:00:00Z' };
}

function registerFails(message: string, code: Code) {
  return () => {
    throw new ConnectError(message, code);
  };
}

/*
 * POST /api/v1/auth/register against a fake auth-service.
 * Needs Redis, like other tests that register the infrastructure plugins.
 */
describe('POST /api/v1/auth/register', () => {
  let app: FastifyInstance | undefined;
  let fake: FakeAuthService | undefined;
  let received: { email: string; password: string }[] = [];

  async function setup(register: (email: string) => unknown) {
    received = [];

    fake = await startFakeAuthService({
      register: async (req) => {
        received.push({ email: req.email, password: req.password });

        return register(req.email) as never;
      },
    });

    app = await buildApp({
      config: {
        ...testConfig,
        grpc: { ...testConfig.grpc, authServiceUrl: fake.url },
        // Fresh rate-limit keys for every test.
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

  it('creates the account and returns 201 with the public user fields', async () => {
    const instance = await setup(registerSucceeds);

    const response = await instance.inject({ method: 'POST', url: URL, payload: VALID_BODY });

    expect(response.statusCode).toBe(201);
    expect(response.json()).toEqual({
      userId: 'user-1',
      email: 'new@example.com',
      status: 'active',
      createdAt: '2026-10-06T10:00:00Z',
    });
    expect(received).toEqual([VALID_BODY]);
  });

  it('never returns the password', async () => {
    const instance = await setup(registerSucceeds);

    const response = await instance.inject({ method: 'POST', url: URL, payload: VALID_BODY });

    expect(response.body).not.toContain(VALID_BODY.password);
  });

  it('returns 409 CONFLICT when the email already exists', async () => {
    const instance = await setup(
      registerFails('An account with this email already exists', Code.AlreadyExists),
    );

    const response = await instance.inject({ method: 'POST', url: URL, payload: VALID_BODY });

    expect(response.statusCode).toBe(409);
    expect(response.json().error).toMatchObject({
      code: 'CONFLICT',
      message: 'An account with this email already exists',
    });
  });

  it('returns 400 when auth-service rejects the input', async () => {
    const instance = await setup(registerFails('Invalid Password', Code.InvalidArgument));

    const response = await instance.inject({ method: 'POST', url: URL, payload: VALID_BODY });

    expect(response.statusCode).toBe(400);
    expect(response.json().error.code).toBe('VALIDATION_ERROR');
  });

  it('returns 504 when auth-service times out', async () => {
    const instance = await setup(registerFails('timed out', Code.DeadlineExceeded));

    const response = await instance.inject({ method: 'POST', url: URL, payload: VALID_BODY });

    expect(response.statusCode).toBe(504);
    expect(response.json().error.code).toBe('UPSTREAM_TIMEOUT');
  });

  it('returns 500 without leaking the internal error message', async () => {
    const instance = await setup(registerFails('db password=hunter2', Code.Internal));

    const response = await instance.inject({ method: 'POST', url: URL, payload: VALID_BODY });

    expect(response.statusCode).toBe(500);
    expect(response.json().error.code).toBe('INTERNAL_ERROR');
    expect(response.body).not.toContain('hunter2');
  });

  it('returns 503 when auth-service is unreachable', async () => {
    const instance = await setup(registerSucceeds);

    await fake?.close();
    fake = undefined;

    const response = await instance.inject({ method: 'POST', url: URL, payload: VALID_BODY });

    expect(response.statusCode).toBe(503);
    expect(response.json().error.code).toBe('UPSTREAM_UNAVAILABLE');
  });

  it.each([
    ['a missing password', { email: 'new@example.com' }],
    ['an invalid email', { email: 'not-an-email', password: 'a-long-password' }],
    ['a 7-character password', { email: 'new@example.com', password: 'short12' }],
    ['a 129-character password', { email: 'new@example.com', password: 'x'.repeat(129) }],
    ['an unknown field', { ...VALID_BODY, role: 'admin' }],
  ])('returns 400 for %s without calling auth-service', async (_name, payload) => {
    const instance = await setup(registerSucceeds);

    const response = await instance.inject({ method: 'POST', url: URL, payload });

    expect(response.statusCode).toBe(400);
    expect(response.json().error.code).toBe('VALIDATION_ERROR');
    expect(received).toHaveLength(0);
  });

  it('applies the auth-register rate limit (5 per minute)', async () => {
    const instance = await setup(registerSucceeds);
    const codes: number[] = [];

    for (let i = 0; i < 6; i += 1) {
      const response = await instance.inject({
        method: 'POST',
        url: URL,
        payload: VALID_BODY,
        headers: { origin: ALLOWED_ORIGIN },
      });
      codes.push(response.statusCode);

      if (i === 5) {
        expect(response.headers['access-control-expose-headers']).toContain('Retry-After');
      }
    }

    expect(codes).toEqual([201, 201, 201, 201, 201, 429]);
  });

  it('allows credentialed register preflight requests from a configured origin', async () => {
    const instance = await setup(registerSucceeds);

    const response = await instance.inject({
      method: 'OPTIONS',
      url: URL,
      headers: {
        origin: ALLOWED_ORIGIN,
        'access-control-request-method': 'POST',
        'access-control-request-headers': 'content-type',
      },
    });

    expect(response.statusCode).toBe(204);
    expect(response.headers['access-control-allow-origin']).toBe(ALLOWED_ORIGIN);
    expect(response.headers['access-control-allow-credentials']).toBe('true');
  });

  it('does not allow register requests from an unknown origin', async () => {
    const instance = await setup(registerSucceeds);

    const response = await instance.inject({
      method: 'OPTIONS',
      url: URL,
      headers: {
        origin: UNKNOWN_ORIGIN,
        'access-control-request-method': 'POST',
        'access-control-request-headers': 'content-type',
      },
    });

    expect(response.headers['access-control-allow-origin']).toBeUndefined();
  });
});
