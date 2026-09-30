import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';

import { buildApp } from '../../src/app.js';
import { AppError } from '../../src/errors/app-error.js';
import { testConfig } from '../helpers/test-config.js';

const ISO_TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;

function expectStandardError(body: unknown, code: string): void {
  expect(body).toEqual({
    error: {
      code,
      message: expect.any(String),
      requestId: expect.any(String),
      timestamp: expect.stringMatching(ISO_TIMESTAMP),
      details: expect.any(Array),
    },
  });
}

describe('error handling', () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    app = await buildApp({
      config: testConfig,
      registerInfrastructure: false,
    });

    // Test-only routes that trigger each kind of error.
    app.get('/test/app-error', async () => {
      throw new AppError('CONFLICT', 'Email already registered', [{ field: 'email' }]);
    });

    app.get('/test/unexpected', async () => {
      throw new Error('db password=secret');
    });

    app.post(
      '/test/validated',
      {
        schema: {
          body: {
            type: 'object',
            required: ['email'],
            properties: {
              email: { type: 'string' },
            },
          },
        },
      },
      async () => ({ ok: true }),
    );
  });

  afterEach(async () => {
    await app.close();
  });

  it('returns NOT_FOUND in the standard shape for unknown routes', async () => {
    const response = await app.inject({ method: 'GET', url: '/does-not-exist' });

    expect(response.statusCode).toBe(404);
    expectStandardError(response.json(), 'NOT_FOUND');
  });

  it('returns an AppError with its status, message, and details', async () => {
    const response = await app.inject({ method: 'GET', url: '/test/app-error' });

    expect(response.statusCode).toBe(409);
    expectStandardError(response.json(), 'CONFLICT');
    expect(response.json().error.message).toBe('Email already registered');
    expect(response.json().error.details).toEqual([{ field: 'email' }]);
  });

  it('hides internal details of unexpected errors', async () => {
    const response = await app.inject({ method: 'GET', url: '/test/unexpected' });

    expect(response.statusCode).toBe(500);
    expectStandardError(response.json(), 'INTERNAL_ERROR');
    expect(response.body).not.toContain('secret');
  });

  it('returns VALIDATION_ERROR with details for an invalid body', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/test/validated',
      payload: {},
    });

    expect(response.statusCode).toBe(400);
    expectStandardError(response.json(), 'VALIDATION_ERROR');
    expect(response.json().error.details).toEqual([
      expect.objectContaining({ location: 'body', message: expect.any(String) }),
    ]);
  });

  it('returns BAD_REQUEST for malformed JSON', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/test/validated',
      headers: { 'content-type': 'application/json' },
      payload: '{"email":',
    });

    expect(response.statusCode).toBe(400);
    expectStandardError(response.json(), 'BAD_REQUEST');
  });

  it('returns PAYLOAD_TOO_LARGE when the body exceeds the limit', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/test/validated',
      headers: { 'content-type': 'application/json' },
      payload: JSON.stringify({ email: 'x'.repeat(testConfig.http.bodyLimitBytes) }),
    });

    expect(response.statusCode).toBe(413);
    expectStandardError(response.json(), 'PAYLOAD_TOO_LARGE');
  });

  it('uses the incoming x-request-id as the error requestId', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/does-not-exist',
      headers: { 'x-request-id': 'trace-abc-123' },
    });

    expect(response.json().error.requestId).toBe('trace-abc-123');
  });
});
