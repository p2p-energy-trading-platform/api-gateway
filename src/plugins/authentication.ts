import fp from 'fastify-plugin';
import type { FastifyPluginAsync, FastifyRequest } from 'fastify';
import { createRemoteJWKSet, errors, jwtVerify, type JWTPayload } from 'jose';

import type { AppConfig } from '../config/types.js';
import { ACCESS_COOKIE_NAME } from '../features/auth/cookies.js';
import { AppError } from '../errors/app-error.js';
import { DEFAULT_ROUTE_AUTH_POLICY, type RouteAuthPolicy } from '../policies/route-auth.js';
import type { AuthenticatedPrincipal } from '../types/authentication.js';

declare module 'fastify' {
  interface FastifyContextConfig {
    auth?: RouteAuthPolicy;
  }

  interface FastifyRequest {
    // Set only after the access token has been verified; null for anonymous requests.
    principal: AuthenticatedPrincipal | null;
  }
}

export interface AuthenticationPluginOptions {
  config: AppConfig;
}

// Minimum time between JWKS refreshes triggered by an unknown "kid".
const JWKS_COOLDOWN_MS = 30_000;

const BEARER_TOKEN = /^Bearer ([A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+)$/i;
const JWT_FORMAT = /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/;

// Safe reason categories for logs and metrics. Never log the token itself.
type AuthFailure = 'missing' | 'malformed' | 'expired' | 'invalid' | 'unavailable';

class AuthenticationFailure extends Error {
  constructor(readonly reason: AuthFailure) {
    super(reason);
  }
}

/*
 * Browsers send the access token in the httpOnly cookie; other clients (mobile, services) send
 * a Bearer header. The header wins when both are present.
 */
function readAccessToken(request: FastifyRequest): string | undefined {
  const header = request.headers.authorization;

  if (header !== undefined) {
    const token = BEARER_TOKEN.exec(header)?.[1];

    if (token === undefined) {
      throw new AuthenticationFailure('malformed');
    }

    return token;
  }

  const cookie = request.cookies[ACCESS_COOKIE_NAME];

  if (cookie === undefined || cookie === '') {
    return undefined;
  }

  if (!JWT_FORMAT.test(cookie)) {
    throw new AuthenticationFailure('malformed');
  }

  return cookie;
}

function readScopes(payload: JWTPayload): string[] {
  const scope = payload['scope'];

  if (Array.isArray(scope)) {
    return scope.filter((value): value is string => typeof value === 'string');
  }

  return typeof scope === 'string' ? scope.split(' ').filter(Boolean) : [];
}

/*
 * Checks that jose does not do for us: the access-token profile of auth-service.
 * jose already checked signature, algorithm, issuer, audience, and expiry.
 */
function toPrincipal(payload: JWTPayload, clockToleranceSeconds: number): AuthenticatedPrincipal {
  const nowSeconds = Math.floor(Date.now() / 1000);

  if (payload['typ'] !== 'access') {
    throw new AuthenticationFailure('invalid');
  }

  if (typeof payload.sub !== 'string' || payload.sub.length === 0) {
    throw new AuthenticationFailure('invalid');
  }

  if (typeof payload.iat !== 'number' || payload.iat > nowSeconds + clockToleranceSeconds) {
    throw new AuthenticationFailure('invalid');
  }

  const role = payload['role'];

  return {
    userId: payload.sub,
    role: typeof role === 'string' ? role : undefined,
    scopes: readScopes(payload),
  };
}

function toFailure(error: unknown): AuthenticationFailure {
  if (error instanceof AuthenticationFailure) {
    return error;
  }

  if (error instanceof errors.JWTExpired) {
    return new AuthenticationFailure('expired');
  }

  // Could not load keys: timeout, bad key set, or non-200 / non-JSON response (jose throws the
  // base JOSEError for those). We cannot tell whether the token is valid.
  if (
    error instanceof errors.JWKSTimeout ||
    error instanceof errors.JWKSInvalid ||
    (error instanceof errors.JOSEError && error.constructor === errors.JOSEError)
  ) {
    return new AuthenticationFailure('unavailable');
  }

  // Every token problem (bad signature, wrong alg/iss/aud, unknown kid, ...) is a JOSEError subclass.
  if (error instanceof errors.JOSEError) {
    return new AuthenticationFailure('invalid');
  }

  // Anything else, e.g. the network request to the JWKS endpoint failed.
  return new AuthenticationFailure('unavailable');
}

const authenticationPlugin: FastifyPluginAsync<AuthenticationPluginOptions> = async (
  app,
  options,
) => {
  const { auth } = options.config;

  // jose caches keys, refreshes once on an unknown kid (respecting the cooldown), and shares
  // one in-flight fetch between concurrent requests.
  const jwks = createRemoteJWKSet(new URL(auth.jwksUri), {
    timeoutDuration: auth.jwksRequestTimeoutMs,
    cooldownDuration: JWKS_COOLDOWN_MS,
    cacheMaxAge: auth.jwksCacheTtlSeconds * 1000,
  });

  app.decorateRequest('principal', null);

  async function verify(token: string): Promise<AuthenticatedPrincipal> {
    const { payload } = await jwtVerify(token, jwks, {
      issuer: auth.issuer,
      audience: auth.audience,
      algorithms: auth.allowedAlgorithms,
      clockTolerance: auth.clockToleranceSeconds,
      requiredClaims: ['sub', 'exp', 'iat'],
    });

    return toPrincipal(payload, auth.clockToleranceSeconds);
  }

  app.addHook('onRequest', async (request) => {
    const policy = request.routeOptions.config.auth ?? DEFAULT_ROUTE_AUTH_POLICY;

    // Unknown routes stay 404 instead of turning into 401.
    if (policy === 'public' || request.is404) {
      return;
    }

    try {
      const token = readAccessToken(request);

      if (token === undefined) {
        if (policy === 'optional') {
          return;
        }

        throw new AuthenticationFailure('missing');
      }

      request.principal = await verify(token);
    } catch (error) {
      const failure = toFailure(error);

      app.metrics.authOutcomes.inc({ result: failure.reason });
      request.log.info({ reason: failure.reason }, 'Authentication failed');

      if (failure.reason === 'unavailable') {
        request.log.error({ err: error }, 'Could not load auth-service signing keys');

        throw new AppError('UPSTREAM_UNAVAILABLE');
      }

      throw new AppError('UNAUTHENTICATED', 'Invalid or missing access token.');
    }

    app.metrics.authOutcomes.inc({ result: 'success' });
    request.log = request.log.child({ userId: request.principal.userId });

    // gRPC calls forward identity from the request context: only the verified user ID,
    // never the original token or any identity header sent by the client.
    const tracing = request.requestContext?.get('tracing');

    if (tracing !== undefined) {
      request.requestContext.set('tracing', { ...tracing, userId: request.principal.userId });
    }
  });
};

export default fp(authenticationPlugin, {
  name: 'authentication',
  dependencies: ['observability', '@fastify/cookie'],
});
