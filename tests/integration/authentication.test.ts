import { randomUUID } from 'node:crypto';

import type { FastifyInstance } from 'fastify';
import { SignJWT } from 'jose';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { buildApp } from '../../src/app.js';
import { startFakeAuthService, type FakeAuthService } from '../helpers/fake-auth-service.js';
import {
  createTestKey,
  signAccessToken,
  startFakeJwks,
  TEST_AUDIENCE,
  TEST_ISSUER,
  type FakeJwks,
} from '../helpers/fake-jwks.js';
import { testConfig } from '../helpers/test-config.js';

function bearer(token: string) {
  return { authorization: `Bearer ${token}` };
}

/*
 * Access-token verification against a fake JWKS endpoint and a fake auth-service.
 * Needs Redis, like other tests that register the infrastructure plugins.
 */
describe('authentication', () => {
  let app: FastifyInstance;
  let jwks: FakeJwks;
  let authService: FakeAuthService;
  const forwardedHeaders: Headers[] = [];

  beforeEach(async () => {
    forwardedHeaders.length = 0;
    jwks = await startFakeJwks();

    authService = await startFakeAuthService({
      register: async (req, context) => {
        forwardedHeaders.push(context.requestHeader);

        return { userId: 'user-1', email: req.email, status: 'active', createdAt: 'now' };
      },
    });

    app = await buildApp({
      config: {
        ...testConfig,
        auth: {
          issuer: TEST_ISSUER,
          audience: TEST_AUDIENCE,
          jwksUri: jwks.url,
          allowedAlgorithms: ['EdDSA'],
          clockToleranceSeconds: 5,
          jwksCacheTtlSeconds: 300,
          jwksRequestTimeoutMs: 1000,
        },
        grpc: { ...testConfig.grpc, authServiceUrl: authService.url },
        rateLimit: { hashSecret: randomUUID() },
      },
      registerInfrastructure: true,
    });

    // Test-only routes, one per auth policy.
    app.get('/test/me', async (request) => ({ principal: request.principal }));
    app.get('/test/optional', { config: { auth: 'optional' } }, async (request) => ({
      principal: request.principal,
    }));
    app.get('/test/public', { config: { auth: 'public' } }, async () => ({ ok: true }));

    const callAuthService = async () => {
      await app.grpcClients.auth.register({ email: 'a@example.com', password: 'password123' });

      return { ok: true };
    };

    app.get('/test/call-auth', callAuthService);
    app.get('/test/call-auth-public', { config: { auth: 'public' } }, callAuthService);
  });

  afterEach(async () => {
    await app.close();
    await jwks.close();
    await authService.close();
  });

  describe('valid tokens', () => {
    it('accepts a valid token and exposes the verified principal', async () => {
      const token = await signAccessToken(jwks.key);

      const response = await app.inject({ method: 'GET', url: '/test/me', headers: bearer(token) });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({
        principal: { userId: 'user-123', role: 'prosumer', scopes: [] },
      });
    });

    it('reads scopes given as an array or a space-separated string', async () => {
      const asArray = await signAccessToken(jwks.key, { claims: { scope: ['orders:read'] } });
      const asString = await signAccessToken(jwks.key, {
        claims: { scope: 'orders:read orders:write' },
      });

      const first = await app.inject({ method: 'GET', url: '/test/me', headers: bearer(asArray) });
      const second = await app.inject({
        method: 'GET',
        url: '/test/me',
        headers: bearer(asString),
      });

      expect(first.json().principal.scopes).toEqual(['orders:read']);
      expect(second.json().principal.scopes).toEqual(['orders:read', 'orders:write']);
    });

    it('caches the signing keys instead of fetching them for every request', async () => {
      const token = await signAccessToken(jwks.key);

      for (let i = 0; i < 3; i += 1) {
        await app.inject({ method: 'GET', url: '/test/me', headers: bearer(token) });
      }

      expect(jwks.requestCount()).toBe(1);
    });
  });

  describe('rejected tokens', () => {
    it('returns 401 UNAUTHENTICATED when the token is missing', async () => {
      const response = await app.inject({ method: 'GET', url: '/test/me' });

      expect(response.statusCode).toBe(401);
      expect(response.json().error.code).toBe('UNAUTHENTICATED');
    });

    it.each([
      ['a non-Bearer scheme', 'Token abc.def.ghi'],
      ['a value that is not a JWT', 'Bearer not-a-jwt'],
      ['an empty Bearer value', 'Bearer '],
    ])('returns 401 for %s', async (_name, authorization) => {
      const response = await app.inject({
        method: 'GET',
        url: '/test/me',
        headers: { authorization },
      });

      expect(response.statusCode).toBe(401);
    });

    it.each([
      [
        'an expired token',
        { issuedAt: Math.floor(Date.now() / 1000) - 3600, expiresInSeconds: 60 },
      ],
      ['a wrong issuer', { issuer: 'http://evil.example.com' }],
      ['a wrong audience', { audience: 'some-other-api' }],
      ['a refresh-type token', { claims: { typ: 'refresh' } }],
      ['a missing subject', { subject: null }],
      ['an issued-at time in the future', { issuedAt: Math.floor(Date.now() / 1000) + 3600 }],
    ])('returns 401 for %s', async (_name, options) => {
      const token = await signAccessToken(jwks.key, options);

      const response = await app.inject({ method: 'GET', url: '/test/me', headers: bearer(token) });

      expect(response.statusCode).toBe(401);
      expect(response.json().error.code).toBe('UNAUTHENTICATED');
    });

    it('returns 401 for a token signed by an unknown key', async () => {
      const otherKey = await createTestKey('unknown-key');
      const token = await signAccessToken(otherKey);

      const response = await app.inject({ method: 'GET', url: '/test/me', headers: bearer(token) });

      expect(response.statusCode).toBe(401);
    });

    it('returns 401 for a shared-secret (HS256) token, even with a known kid', async () => {
      const token = await new SignJWT({ typ: 'access' })
        .setProtectedHeader({ alg: 'HS256', kid: jwks.key.kid })
        .setIssuer(TEST_ISSUER)
        .setAudience(TEST_AUDIENCE)
        .setSubject('attacker')
        .setIssuedAt()
        .setExpirationTime('15m')
        .sign(new TextEncoder().encode('guessed-secret-guessed-secret-32'));

      const response = await app.inject({ method: 'GET', url: '/test/me', headers: bearer(token) });

      expect(response.statusCode).toBe(401);
    });

    it('never echoes the token in the error response', async () => {
      const token = await signAccessToken(jwks.key, { audience: 'wrong' });

      const response = await app.inject({ method: 'GET', url: '/test/me', headers: bearer(token) });

      expect(response.body).not.toContain(token);
    });
  });

  describe('route policies', () => {
    it('lets public routes through without a token', async () => {
      const response = await app.inject({ method: 'GET', url: '/test/public' });

      expect(response.statusCode).toBe(200);
    });

    it('keeps health checks and register public', async () => {
      const health = await app.inject({ method: 'GET', url: '/health/live' });
      const register = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/register',
        payload: { name: 'New User', email: 'new@example.com', password: 'a-long-password' },
      });

      expect(health.statusCode).toBe(200);
      expect(register.statusCode).toBe(201);
    });

    it('allows optional routes without a token and attaches the principal with one', async () => {
      const token = await signAccessToken(jwks.key);

      const anonymous = await app.inject({ method: 'GET', url: '/test/optional' });
      const signedIn = await app.inject({
        method: 'GET',
        url: '/test/optional',
        headers: bearer(token),
      });

      expect(anonymous.json()).toEqual({ principal: null });
      expect(signedIn.json().principal.userId).toBe('user-123');
    });

    it('rejects an invalid token on optional routes instead of ignoring it', async () => {
      const token = await signAccessToken(jwks.key, { audience: 'wrong' });

      const response = await app.inject({
        method: 'GET',
        url: '/test/optional',
        headers: bearer(token),
      });

      expect(response.statusCode).toBe(401);
    });

    it('keeps unknown routes as 404 instead of 401', async () => {
      const response = await app.inject({ method: 'GET', url: '/does-not-exist' });

      expect(response.statusCode).toBe(404);
    });
  });

  describe('auth-service unavailable', () => {
    it('returns 503 when the signing keys cannot be loaded', async () => {
      jwks.fail(true);
      const token = await signAccessToken(jwks.key);

      const response = await app.inject({ method: 'GET', url: '/test/me', headers: bearer(token) });

      expect(response.statusCode).toBe(503);
      expect(response.json().error.code).toBe('UPSTREAM_UNAVAILABLE');
    });
  });

  describe('identity sent to backend services', () => {
    it('sends the verified user ID and never the original token', async () => {
      const token = await signAccessToken(jwks.key);

      await app.inject({ method: 'GET', url: '/test/call-auth', headers: bearer(token) });

      expect(forwardedHeaders[0]?.get('x-gridx-user-id')).toBe('user-123');
      expect(forwardedHeaders[0]?.get('authorization')).toBeNull();
    });

    it('never forwards identity headers sent by the client', async () => {
      await app.inject({
        method: 'GET',
        url: '/test/call-auth-public',
        headers: { 'x-gridx-user-id': 'admin', authorization: 'Bearer forged' },
      });

      expect(forwardedHeaders[0]?.get('x-gridx-user-id')).toBeNull();
      expect(forwardedHeaders[0]?.get('authorization')).toBeNull();
    });

    it('forwards a safe correlation ID and replaces an unsafe one', async () => {
      await app.inject({
        method: 'GET',
        url: '/test/call-auth-public',
        headers: { 'x-correlation-id': 'flow-42' },
      });
      await app.inject({
        method: 'GET',
        url: '/test/call-auth-public',
        headers: { 'x-correlation-id': '<script>alert(1)</script>' },
      });

      expect(forwardedHeaders[0]?.get('x-correlation-id')).toBe('flow-42');
      expect(forwardedHeaders[1]?.get('x-correlation-id')).not.toContain('<script>');
    });
  });

  describe('metrics', () => {
    it('counts outcomes by safe reason category', async () => {
      const token = await signAccessToken(jwks.key);

      await app.inject({ method: 'GET', url: '/test/me', headers: bearer(token) });
      await app.inject({ method: 'GET', url: '/test/me' });

      const text = await app.metrics.registry.metrics();

      expect(text).toContain('gateway_auth_outcomes_total{result="success"} 1');
      expect(text).toContain('gateway_auth_outcomes_total{result="missing"} 1');
    });
  });
});
