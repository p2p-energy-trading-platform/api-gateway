import fastifyJwt from '@fastify/jwt';
import type { FastifyJWTOptions, JwtHeader } from '@fastify/jwt';
import fp from 'fastify-plugin';
import type { FastifyPluginAsync, FastifyRequest } from 'fastify';
import { createPublicKey } from 'node:crypto';

import type { AppConfig } from '../config/types.js';
import { AppError } from '../errors/app-error.js';
import { ACCESS_COOKIE_NAME } from '../features/auth/cookies.js';
import { getAccessTokenHash, hashAccessToken } from '../features/auth/session-store.js';
import { DEFAULT_ROUTE_AUTH_POLICY, type RouteAuthPolicy } from '../policies/route-auth.js';
import type { AuthenticatedPrincipal } from '../types/authentication.js';

declare module 'fastify' {
  interface FastifyContextConfig {
    auth?: RouteAuthPolicy;
  }
}

export interface AuthenticationPluginOptions {
  config: AppConfig;
}

const BEARER_TOKEN = /^Bearer\s+(\S+)$/i;
const JWKS_COOLDOWN_MS = 30_000;

interface JsonWebKey {
  kid?: string;
  kty: string;
  alg?: string;
  use?: string;
  n?: string;
  e?: string;
  crv?: string;
  x?: string;
  y?: string;
}

interface JsonWebKeySet {
  keys: JsonWebKey[];
}

interface KeyCache {
  expiresAt: number;
  fetchedAt: number;
  keys: Map<string, string>;
}

class AuthenticationFailure extends Error {
  constructor(readonly reason: 'missing' | 'malformed' | 'invalid' | 'revoked' | 'unavailable') {
    super(reason);
  }
}

function readToken(request: FastifyRequest): string | undefined {
  const authorization = request.headers.authorization;

  if (authorization !== undefined) {
    const match = BEARER_TOKEN.exec(authorization);

    if (match?.[1] === undefined) {
      throw new AuthenticationFailure('malformed');
    }

    return match[1];
  }

  return request.cookies?.[ACCESS_COOKIE_NAME];
}

function toPrincipal(
  payload: Record<string, unknown>,
  clockToleranceSeconds: number,
): AuthenticatedPrincipal {
  if (payload.typ !== 'access' || typeof payload.sub !== 'string' || payload.sub.length === 0) {
    throw new AuthenticationFailure('invalid');
  }

  const nowSeconds = Math.floor(Date.now() / 1000);

  if (typeof payload.iat !== 'number' || payload.iat > nowSeconds + clockToleranceSeconds) {
    throw new AuthenticationFailure('invalid');
  }

  const scope = payload.scope;
  const scopes = Array.isArray(scope)
    ? scope.filter((value): value is string => typeof value === 'string')
    : typeof scope === 'string'
      ? scope.split(' ').filter(Boolean)
      : [];

  return {
    userId: payload.sub,
    role: typeof payload.role === 'string' ? payload.role : undefined,
    scopes,
  };
}

function readJwkKey(jwk: JsonWebKey): string {
  try {
    const key = createPublicKey({ key: jwk, format: 'jwk' }).export({
      type: 'spki',
      format: 'pem',
    });

    if (typeof key !== 'string') {
      throw new Error('JWKS public key was not exported as PEM');
    }

    return key;
  } catch {
    throw new AuthenticationFailure('unavailable');
  }
}

const authenticationPlugin: FastifyPluginAsync<AuthenticationPluginOptions> = async (
  app,
  options,
) => {
  let cache: KeyCache | undefined;
  let refreshStartedAt = 0;

  async function loadKeys(): Promise<Map<string, string>> {
    const now = Date.now();

    if (cache !== undefined && cache.expiresAt > now) {
      return cache.keys;
    }

    if (now - refreshStartedAt < JWKS_COOLDOWN_MS && cache !== undefined) {
      return cache.keys;
    }

    refreshStartedAt = now;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), options.config.auth.jwksRequestTimeoutMs);

    try {
      const response = await fetch(options.config.auth.jwksUri, { signal: controller.signal });

      if (!response.ok) {
        throw new Error(`JWKS request failed with status ${response.status}`);
      }

      const body = (await response.json()) as JsonWebKeySet;
      const keys = new Map<string, string>();

      for (const key of body.keys) {
        if (key.kid !== undefined) {
          keys.set(key.kid, readJwkKey(key));
        }
      }

      if (keys.size === 0) {
        throw new Error('JWKS did not contain usable keys');
      }

      cache = {
        keys,
        fetchedAt: now,
        expiresAt: now + options.config.auth.jwksCacheTtlSeconds * 1000,
      };

      return keys;
    } catch {
      throw new AuthenticationFailure('unavailable');
    } finally {
      clearTimeout(timeout);
    }
  }

  await app.register(fastifyJwt, {
    decode: { complete: true },
    secret: ((
      _request: FastifyRequest,
      tokenOrHeader: JwtHeader | { header: JwtHeader; payload: object },
      callback: (error: Error | null, secret: string | Buffer | undefined) => void,
    ) => {
      void (async () => {
        const header = 'header' in tokenOrHeader ? tokenOrHeader.header : tokenOrHeader;
        const kid = header.kid;

        if (typeof kid !== 'string') {
          throw new AuthenticationFailure('invalid');
        }

        const key = (await loadKeys()).get(kid);

        if (key === undefined) {
          cache = undefined;
          const refreshed = await loadKeys();
          const refreshedKey = refreshed.get(kid);

          if (refreshedKey === undefined) {
            throw new AuthenticationFailure('invalid');
          }

          return refreshedKey;
        }

        return key;
      })().then(
        (key) => callback(null, key),
        (error: unknown) =>
          callback(error instanceof Error ? error : new Error(String(error)), undefined),
      );
    }) as FastifyJWTOptions['secret'],
    verify: {
      algorithms: options.config.auth.allowedAlgorithms as Array<'RS256' | 'ES256' | 'EdDSA'>,
      allowedIss: options.config.auth.issuer,
      allowedAud: options.config.auth.audience,
      clockTolerance: options.config.auth.clockToleranceSeconds,
      requiredClaims: ['sub', 'exp', 'iat'],
    },
  });

  app.decorateRequest('principal', null);

  app.addHook('onRequest', async (request) => {
    const policy = request.routeOptions.config.auth ?? DEFAULT_ROUTE_AUTH_POLICY;

    if (policy === 'public' || request.is404) {
      return;
    }

    try {
      const token = readToken(request);

      if (token === undefined) {
        if (policy === 'optional') {
          return;
        }

        throw new AuthenticationFailure('missing');
      }

      request.headers.authorization = `Bearer ${token}`;
      const payload = await request.jwtVerify<Record<string, unknown>>();
      const principal = toPrincipal(payload, options.config.auth.clockToleranceSeconds);

      let storedHash: string | null;

      try {
        storedHash = await getAccessTokenHash(app.redis, principal.userId);
      } catch (error) {
        request.log.error({ err: error }, 'Could not read access token session');
        throw new AuthenticationFailure('unavailable');
      }

      if (storedHash === null || storedHash !== hashAccessToken(token)) {
        throw new AuthenticationFailure('revoked');
      }

      request.principal = principal;
    } catch (error) {
      if (error instanceof AuthenticationFailure && error.reason === 'unavailable') {
        request.log.error({ err: error }, 'Could not load authentication dependencies');
        throw new AppError('UPSTREAM_UNAVAILABLE');
      }

      request.log.info(
        { reason: error instanceof AuthenticationFailure ? error.reason : 'invalid' },
        'Authentication failed',
      );
      throw new AppError('UNAUTHENTICATED', 'Invalid or missing access token.');
    }

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
