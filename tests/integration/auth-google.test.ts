import { createHash, randomBytes, randomUUID } from 'node:crypto';

import { Code, ConnectError } from '@connectrpc/connect';
import type { FastifyInstance } from 'fastify';
import { afterEach, describe, expect, it } from 'vitest';

import { buildApp } from '../../src/app.js';
import { GOOGLE_STATE_COOKIE_NAME, mobileHandoffKey } from '../../src/features/auth/google.js';
import { startFakeAuthService, type FakeAuthService } from '../helpers/fake-auth-service.js';
import { testConfig } from '../helpers/test-config.js';

const START_URL = '/api/v1/auth/google/start';
const CALLBACK_URL = '/api/v1/auth/google/callback';
const FRONTEND = 'http://localhost:5173';
const REDIRECT_URI = 'http://localhost:8000/api/v1/auth/google/callback';
const FAILURE_LOCATION = `${FRONTEND}/sign-in?error=google`;
const EXCHANGE_URL = '/api/v1/auth/google/mobile/exchange';
const MOBILE_REDIRECT = 'gridx://auth/google';
const MOBILE_HEADERS = { 'x-client-type': 'mobile' };

// What the app generates: 32 random bytes, base64url (43 chars).
const APP_VERIFIER = randomBytes(32).toString('base64url');
const APP_CHALLENGE = createHash('sha256').update(APP_VERIFIER).digest('base64url');

interface LoginCall {
  code: string;
  codeVerifier: string;
  redirectUri: string;
  nonce: string;
}

/*
 * Google sign-in redirect flow against a fake auth-service.
 * Needs Redis, like other tests that register the infrastructure plugins.
 */
describe('Google sign-in', () => {
  let app: FastifyInstance | undefined;
  let fake: FakeAuthService | undefined;
  let loginCalls: LoginCall[] = [];

  interface SetupOptions {
    isNewUser?: boolean;
    loginFails?: boolean;
    googleConfigured?: boolean;
    mobileRedirectUri?: string | null;
  }

  async function setup(options: SetupOptions = {}) {
    loginCalls = [];
    fake = await startFakeAuthService({
      loginWithGoogle: async (req) => {
        loginCalls.push({
          code: req.code,
          codeVerifier: req.codeVerifier,
          redirectUri: req.redirectUri,
          nonce: req.nonce,
        });

        if (options.loginFails === true) {
          throw new ConnectError('Google sign-in failed', Code.Unauthenticated);
        }

        return {
          userId: 'google-user-1',
          email: 'user@gmail.com',
          accessToken: 'google-access',
          refreshToken: 'google-refresh',
          expiresIn: 900n,
          isNewUser: options.isNewUser === true,
        };
      },
    });

    app = await buildApp({
      config: {
        ...testConfig,
        grpc: { ...testConfig.grpc, authServiceUrl: fake.url },
        // Fresh rate-limit keys for every test.
        rateLimit: { hashSecret: randomUUID() },
        googleOAuth:
          options.googleConfigured === false
            ? undefined
            : {
                clientId: 'client-id.apps.googleusercontent.com',
                redirectUri: REDIRECT_URI,
                frontendBaseUrl: FRONTEND,
                ...(options.mobileRedirectUri === null
                  ? {}
                  : { mobileRedirectUri: options.mobileRedirectUri ?? MOBILE_REDIRECT }),
              },
      },
      registerInfrastructure: true,
    });

    return app;
  }

  /** Runs /start and returns what the browser would carry to Google and back. */
  async function startSignIn(
    instance: FastifyInstance,
    returnTo?: string,
    extraQuery: Record<string, string> = {},
  ) {
    const response = await instance.inject({
      method: 'GET',
      url: START_URL,
      query: { ...(returnTo === undefined ? {} : { returnTo }), ...extraQuery },
    });

    const location = new URL(String(response.headers.location));
    const stateCookie = response.cookies.find((cookie) => cookie.name === GOOGLE_STATE_COOKIE_NAME);

    return {
      response,
      location,
      state: location.searchParams.get('state') ?? '',
      stateCookie,
    };
  }

  function callback(
    instance: FastifyInstance,
    query: Record<string, string>,
    stateCookie?: string,
  ) {
    return instance.inject({
      method: 'GET',
      url: CALLBACK_URL,
      query,
      ...(stateCookie === undefined
        ? {}
        : { cookies: { [GOOGLE_STATE_COOKIE_NAME]: stateCookie } }),
    });
  }

  function sessionCookieNames(response: { cookies: { name: string; value: string }[] }) {
    return response.cookies.filter((cookie) => cookie.value !== '').map((cookie) => cookie.name);
  }

  afterEach(async () => {
    await app?.close();
    await fake?.close();
    app = undefined;
    fake = undefined;
  });

  describe('GET /api/v1/auth/google/start', () => {
    it('redirects to Google with state, nonce and a PKCE challenge', async () => {
      const instance = await setup();

      const { response, location, state } = await startSignIn(instance);

      expect(response.statusCode).toBe(302);
      expect(location.origin + location.pathname).toBe(
        'https://accounts.google.com/o/oauth2/v2/auth',
      );
      expect(Object.fromEntries(location.searchParams)).toMatchObject({
        client_id: 'client-id.apps.googleusercontent.com',
        redirect_uri: REDIRECT_URI,
        response_type: 'code',
        scope: 'openid email profile',
        code_challenge_method: 'S256',
        prompt: 'select_account',
      });
      expect(state).not.toBe('');
      expect(location.searchParams.get('nonce')).not.toBe('');
    });

    it('stores the login in Redis with a challenge that matches its verifier', async () => {
      const instance = await setup();

      const { location, state } = await startSignIn(instance, '/trade');
      const key = `oauth:google:${createHash('sha256').update(state).digest('hex')}`;
      const stored = JSON.parse(String(await instance.redis.get(key))) as {
        codeVerifier: string;
        nonce: string;
        returnTo: string;
      };

      expect(stored.returnTo).toBe('/trade');
      expect(stored.nonce).toBe(location.searchParams.get('nonce'));
      expect(createHash('sha256').update(stored.codeVerifier).digest('base64url')).toBe(
        location.searchParams.get('code_challenge'),
      );
      expect(await instance.redis.ttl(key)).toBeGreaterThan(500);
    });

    it('binds the state to the browser with a short-lived Lax cookie', async () => {
      const instance = await setup();

      const { state, stateCookie } = await startSignIn(instance);

      expect(stateCookie).toMatchObject({
        value: state,
        httpOnly: true,
        secure: true,
        sameSite: 'Lax',
        path: '/api/v1/auth/google',
        maxAge: 600,
      });
    });

    it.each(['//evil.example.com', 'https://evil.example.com', '/\\evil.example.com', 'trade'])(
      'falls back to /dashboard for the unsafe returnTo "%s"',
      async (returnTo) => {
        const instance = await setup();

        const { state, stateCookie } = await startSignIn(instance, returnTo);
        const response = await callback(instance, { code: 'auth-code', state }, stateCookie?.value);

        expect(response.headers.location).toBe(`${FRONTEND}/dashboard`);
      },
    );

    it('returns 503 when Google sign-in is not configured', async () => {
      const instance = await setup({ googleConfigured: false });

      const response = await instance.inject({ method: 'GET', url: START_URL });

      expect(response.statusCode).toBe(503);
      expect(response.json().error.code).toBe('UPSTREAM_UNAVAILABLE');
    });
  });

  describe('GET /api/v1/auth/google/callback', () => {
    it('signs in an existing user and returns them to where they started', async () => {
      const instance = await setup();
      const { location, state, stateCookie } = await startSignIn(instance, '/trade');

      const response = await callback(
        instance,
        // Google adds its own parameters; they must not break validation.
        { code: 'auth-code', state, scope: 'openid email profile', authuser: '0' },
        stateCookie?.value,
      );

      expect(response.statusCode).toBe(302);
      expect(response.headers.location).toBe(`${FRONTEND}/trade`);
      expect(sessionCookieNames(response)).toEqual(
        expect.arrayContaining(['gridx_access', 'gridx_refresh']),
      );
      expect(loginCalls).toEqual([
        {
          code: 'auth-code',
          codeVerifier: expect.any(String) as string,
          redirectUri: REDIRECT_URI,
          nonce: location.searchParams.get('nonce'),
        },
      ]);
    });

    it('sends a new user to sign-up to continue onboarding', async () => {
      const instance = await setup({ isNewUser: true });
      const { state, stateCookie } = await startSignIn(instance, '/trade');

      const response = await callback(instance, { code: 'auth-code', state }, stateCookie?.value);

      expect(response.headers.location).toBe(`${FRONTEND}/sign-up?step=kyc`);
    });

    it('clears the state cookie', async () => {
      const instance = await setup();
      const { state, stateCookie } = await startSignIn(instance);

      const response = await callback(instance, { code: 'auth-code', state }, stateCookie?.value);
      const cleared = response.cookies.find((cookie) => cookie.name === GOOGLE_STATE_COOKIE_NAME);

      expect(cleared?.value).toBe('');
      expect(cleared?.path).toBe('/api/v1/auth/google');
    });

    it('rejects a state that does not match the browser cookie', async () => {
      const instance = await setup();
      const { state } = await startSignIn(instance);

      const response = await callback(instance, { code: 'auth-code', state }, 'another-state');

      expect(response.headers.location).toBe(FAILURE_LOCATION);
      expect(loginCalls).toHaveLength(0);
    });

    it('rejects a callback without the state cookie', async () => {
      const instance = await setup();
      const { state } = await startSignIn(instance);

      const response = await callback(instance, { code: 'auth-code', state });

      expect(response.headers.location).toBe(FAILURE_LOCATION);
      expect(loginCalls).toHaveLength(0);
    });

    it('allows each state to be used only once', async () => {
      const instance = await setup();
      const { state, stateCookie } = await startSignIn(instance);

      await callback(instance, { code: 'auth-code', state }, stateCookie?.value);
      const replay = await callback(instance, { code: 'auth-code', state }, stateCookie?.value);

      expect(replay.headers.location).toBe(FAILURE_LOCATION);
      expect(loginCalls).toHaveLength(1);
    });

    it('returns to sign-in when the user cancels on the Google screen', async () => {
      const instance = await setup();
      const { state, stateCookie } = await startSignIn(instance);

      const response = await callback(
        instance,
        { error: 'access_denied', state },
        stateCookie?.value,
      );

      expect(response.headers.location).toBe(FAILURE_LOCATION);
      expect(loginCalls).toHaveLength(0);
    });

    it('returns to sign-in without a session when auth-service rejects the login', async () => {
      const instance = await setup({ loginFails: true });
      const { state, stateCookie } = await startSignIn(instance);

      const response = await callback(instance, { code: 'auth-code', state }, stateCookie?.value);

      expect(response.headers.location).toBe(FAILURE_LOCATION);
      expect(sessionCookieNames(response)).not.toContain('gridx_access');
    });

    it('rejects a callback without a code', async () => {
      const instance = await setup();
      const { state, stateCookie } = await startSignIn(instance);

      const response = await callback(instance, { state }, stateCookie?.value);

      expect(response.headers.location).toBe(FAILURE_LOCATION);
      expect(loginCalls).toHaveLength(0);
    });
  });

  describe('mobile sign-in', () => {
    function startMobile(instance: FastifyInstance, codeChallenge = APP_CHALLENGE) {
      return startSignIn(instance, undefined, { client: 'mobile', codeChallenge });
    }

    function exchange(
      instance: FastifyInstance,
      body: Record<string, string>,
      headers: Record<string, string> = MOBILE_HEADERS,
    ) {
      return instance.inject({ method: 'POST', url: EXCHANGE_URL, headers, payload: body });
    }

    /** Runs start + callback and returns the handoff code from the app deep link. */
    async function handoffFor(instance: FastifyInstance) {
      const { state, stateCookie } = await startMobile(instance);
      const response = await callback(instance, { code: 'auth-code', state }, stateCookie?.value);
      const location = new URL(String(response.headers.location));

      return { response, location, handoff: location.searchParams.get('handoff') ?? '' };
    }

    it('stores the app challenge with the pending login', async () => {
      const instance = await setup();

      const { state } = await startMobile(instance);
      const key = `oauth:google:${createHash('sha256').update(state).digest('hex')}`;
      const stored = JSON.parse(String(await instance.redis.get(key))) as {
        appCodeChallenge?: string;
      };

      expect(stored.appCodeChallenge).toBe(APP_CHALLENGE);
    });

    it('requires a code challenge', async () => {
      const instance = await setup();

      const response = await instance.inject({
        method: 'GET',
        url: START_URL,
        query: { client: 'mobile' },
      });

      expect(response.statusCode).toBe(400);
    });

    it('rejects a malformed code challenge', async () => {
      const instance = await setup();

      const response = await instance.inject({
        method: 'GET',
        url: START_URL,
        query: { client: 'mobile', codeChallenge: 'too-short' },
      });

      expect(response.statusCode).toBe(400);
    });

    it('returns 503 when mobile sign-in is not configured', async () => {
      const instance = await setup({ mobileRedirectUri: null });

      const response = await instance.inject({
        method: 'GET',
        url: START_URL,
        query: { client: 'mobile', codeChallenge: APP_CHALLENGE },
      });

      expect(response.statusCode).toBe(503);
      expect(response.json().error.code).toBe('UPSTREAM_UNAVAILABLE');
    });

    it('redirects to the app with a handoff code and no tokens or cookies', async () => {
      const instance = await setup();

      const { response, location, handoff } = await handoffFor(instance);

      expect(response.statusCode).toBe(302);
      expect(`${location.protocol}//${location.host}${location.pathname}`).toBe(MOBILE_REDIRECT);
      expect(handoff).toMatch(/^[A-Za-z0-9_-]{43}$/);
      expect(String(response.headers.location)).not.toContain('google-access');
      expect(String(response.headers.location)).not.toContain('google-refresh');
      expect(sessionCookieNames(response)).not.toContain('gridx_access');
      expect(sessionCookieNames(response)).not.toContain('gridx_refresh');
      expect(await instance.redis.ttl(mobileHandoffKey(handoff))).toBeLessThanOrEqual(60);
    });

    it('keeps the query string of a development deep link', async () => {
      const instance = await setup({
        mobileRedirectUri: 'exp://192.168.1.5:8081/--/auth/google?x=1',
      });

      const { location, handoff } = await handoffFor(instance);

      expect(location.searchParams.get('x')).toBe('1');
      expect(handoff).not.toBe('');
    });

    it('exchanges the handoff code and verifier for tokens', async () => {
      const instance = await setup({ isNewUser: true });
      const { handoff } = await handoffFor(instance);

      const response = await exchange(instance, { handoff, codeVerifier: APP_VERIFIER });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({
        userId: 'google-user-1',
        email: 'user@gmail.com',
        accessToken: 'google-access',
        refreshToken: 'google-refresh',
        expiresIn: 900,
        isNewUser: true,
      });
      expect(response.cookies).toHaveLength(0);
    });

    it('allows each handoff code to be exchanged only once', async () => {
      const instance = await setup();
      const { handoff } = await handoffFor(instance);

      await exchange(instance, { handoff, codeVerifier: APP_VERIFIER });
      const replay = await exchange(instance, { handoff, codeVerifier: APP_VERIFIER });

      expect(replay.statusCode).toBe(401);
    });

    it('rejects a wrong verifier and burns the handoff code', async () => {
      const instance = await setup();
      const { handoff } = await handoffFor(instance);

      const wrong = await exchange(instance, { handoff, codeVerifier: 'x'.repeat(43) });
      const retry = await exchange(instance, { handoff, codeVerifier: APP_VERIFIER });

      expect(wrong.statusCode).toBe(401);
      expect(retry.statusCode).toBe(401);
    });

    it('rejects an unknown handoff code', async () => {
      const instance = await setup();

      const response = await exchange(instance, {
        handoff: 'a'.repeat(43),
        codeVerifier: APP_VERIFIER,
      });

      expect(response.statusCode).toBe(401);
      expect(response.json().error.code).toBe('UNAUTHENTICATED');
    });

    it('rejects an exchange without the mobile client header', async () => {
      const instance = await setup();
      const { handoff } = await handoffFor(instance);

      const response = await exchange(instance, { handoff, codeVerifier: APP_VERIFIER }, {});

      expect(response.statusCode).toBe(400);
      // A rejected request must not use up the handoff code.
      expect(await instance.redis.exists(mobileHandoffKey(handoff))).toBe(1);
    });

    it('sends a cancelled sign-in back to the app', async () => {
      const instance = await setup();
      const { state, stateCookie } = await startMobile(instance);

      const response = await callback(
        instance,
        { error: 'access_denied', state },
        stateCookie?.value,
      );

      expect(response.headers.location).toBe(`${MOBILE_REDIRECT}?error=google`);
      expect(loginCalls).toHaveLength(0);
    });

    it('sends a failed sign-in back to the app', async () => {
      const instance = await setup({ loginFails: true });
      const { state, stateCookie } = await startMobile(instance);

      const response = await callback(instance, { code: 'auth-code', state }, stateCookie?.value);

      expect(response.headers.location).toBe(`${MOBILE_REDIRECT}?error=google`);
    });
  });
});
