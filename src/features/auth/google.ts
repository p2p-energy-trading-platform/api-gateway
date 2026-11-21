import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

import type { FastifyReply, FastifyRequest } from 'fastify';
import { Type, type Static } from 'typebox';

import { strictObject } from '../../common/validation.js';
import type { AppConfig } from '../../config/types.js';
import { AppError } from '../../errors/app-error.js';
import { grpcDeadlinesMs } from '../../transport/grpc/deadlines.js';
import type { RedisClient } from '../../transport/redis/client.js';
import { isMobileClient } from './client-type.js';
import { setSessionCookies } from './cookies.js';

export const GOOGLE_STATE_COOKIE_NAME = 'gridx_oauth_state';

const GOOGLE_AUTHORIZE_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const GOOGLE_SCOPES = 'openid email profile';
const STATE_COOKIE_PATH = '/api/v1/auth/google';
const STATE_TTL_SECONDS = 600;
const DEFAULT_RETURN_TO = '/dashboard';
const NEW_USER_RETURN_TO = '/sign-up?step=kyc';
const FAILURE_PATH = '/sign-in?error=google';
const HANDOFF_TTL_SECONDS = 60;
const PKCE_CHALLENGE_PATTERN = '^[A-Za-z0-9_-]{43}$';
const PKCE_VERIFIER_PATTERN = '^[A-Za-z0-9._~-]{43,128}$';
const HANDOFF_PATTERN = '^[A-Za-z0-9_-]{43}$';

export const googleStartQuerySchema = Type.Object({
  returnTo: Type.Optional(Type.String({ maxLength: 512 })),
  client: Type.Optional(Type.Literal('mobile')),
  codeChallenge: Type.Optional(Type.String({ pattern: PKCE_CHALLENGE_PATTERN })),
});

export const googleMobileExchangeBodySchema = strictObject({
  handoff: Type.String({ pattern: HANDOFF_PATTERN }),
  codeVerifier: Type.String({ pattern: PKCE_VERIFIER_PATTERN }),
});

export const googleMobileExchangeResponseSchema = strictObject({
  userId: Type.String(),
  email: Type.String(),
  accessToken: Type.String(),
  refreshToken: Type.String(),
  expiresIn: Type.Integer(),
  isNewUser: Type.Boolean(),
});

// Not strict: Google adds its own parameters (scope, authuser, prompt, ...) to the callback.
export const googleCallbackQuerySchema = Type.Object({
  code: Type.Optional(Type.String({ maxLength: 2048 })),
  state: Type.Optional(Type.String({ maxLength: 256 })),
  error: Type.Optional(Type.String({ maxLength: 256 })),
});

export type GoogleStartQuery = Static<typeof googleStartQuerySchema>;
export type GoogleCallbackQuery = Static<typeof googleCallbackQuerySchema>;
export type GoogleMobileExchangeBody = Static<typeof googleMobileExchangeBodySchema>;
export type GoogleMobileExchangeResponse = Static<typeof googleMobileExchangeResponseSchema>;

interface PendingGoogleLogin {
  codeVerifier: string;
  nonce: string;
  returnTo: string;
  appCodeChallenge?: string;
}

type MobileHandoff = GoogleMobileExchangeResponse & { appCodeChallenge: string };

type GoogleOAuthConfig = NonNullable<AppConfig['googleOAuth']>;

function randomToken(): string {
  return randomBytes(32).toString('base64url');
}

function pendingLoginKey(state: string): string {
  return `oauth:google:${createHash('sha256').update(state).digest('hex')}`;
}

export function mobileHandoffKey(handoff: string): string {
  return `oauth:google:handoff:${createHash('sha256').update(handoff).digest('hex')}`;
}

function codeChallengeFor(codeVerifier: string): string {
  return createHash('sha256').update(codeVerifier).digest('base64url');
}

/** Only same-site paths, so a crafted link cannot send users to another site after sign-in. */
export function safeReturnTo(value: string | undefined): string {
  if (
    value === undefined ||
    !value.startsWith('/') ||
    value.startsWith('//') ||
    value.includes('\\')
  ) {
    return DEFAULT_RETURN_TO;
  }

  return value;
}

function sameValue(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);

  return left.length === right.length && timingSafeEqual(left, right);
}

function stateCookieOptions(config: AppConfig) {
  return {
    httpOnly: true,
    secure: config.cookies.secure,
    // Lax (not Strict) so the cookie is sent when Google redirects back to the callback.
    sameSite: 'lax',
    path: STATE_COOKIE_PATH,
    ...(config.cookies.domain === undefined ? {} : { domain: config.cookies.domain }),
  } as const;
}

function requireGoogleConfig(config: AppConfig): GoogleOAuthConfig {
  if (config.googleOAuth === undefined) {
    throw new AppError('UPSTREAM_UNAVAILABLE', 'Google sign-in is not configured.');
  }

  return config.googleOAuth;
}

/** Reads and deletes the pending login, so each state can be used only once. */
async function consumePendingLogin(
  redis: RedisClient,
  state: string,
): Promise<PendingGoogleLogin | null> {
  const raw = await redis.getDel(pendingLoginKey(state));

  if (raw === null) {
    return null;
  }

  const parsed = JSON.parse(raw) as Partial<PendingGoogleLogin>;

  if (
    typeof parsed.codeVerifier !== 'string' ||
    typeof parsed.nonce !== 'string' ||
    typeof parsed.returnTo !== 'string' ||
    (parsed.appCodeChallenge !== undefined && typeof parsed.appCodeChallenge !== 'string')
  ) {
    return null;
  }

  return {
    codeVerifier: parsed.codeVerifier,
    nonce: parsed.nonce,
    returnTo: parsed.returnTo,
    ...(parsed.appCodeChallenge === undefined ? {} : { appCodeChallenge: parsed.appCodeChallenge }),
  };
}

/** Appends query parameters without breaking a deep link that already has some (e.g. exp://). */
function withQuery(base: string, params: Record<string, string>): string {
  const url = new URL(base);

  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }

  return url.toString();
}

function requireMobileRedirectUri(google: GoogleOAuthConfig): string {
  if (google.mobileRedirectUri === undefined) {
    throw new AppError('UPSTREAM_UNAVAILABLE', 'Mobile Google sign-in is not configured.');
  }

  return google.mobileRedirectUri;
}

function failureLocation(google: GoogleOAuthConfig, isMobile: boolean): string {
  if (isMobile && google.mobileRedirectUri !== undefined) {
    return withQuery(google.mobileRedirectUri, { error: 'google' });
  }

  return `${google.frontendBaseUrl}${FAILURE_PATH}`;
}

export async function googleStartHandler(
  request: FastifyRequest<{ Querystring: GoogleStartQuery }>,
  reply: FastifyReply,
) {
  const { config, redis } = request.server;
  const google = requireGoogleConfig(config);
  const { client, codeChallenge } = request.query;
  const isMobile = client === 'mobile';

  if (isMobile) {
    requireMobileRedirectUri(google);

    if (codeChallenge === undefined) {
      throw new AppError('BAD_REQUEST', 'codeChallenge is required for mobile sign-in.');
    }
  }

  const state = randomToken();
  const pending: PendingGoogleLogin = {
    codeVerifier: randomToken(),
    nonce: randomToken(),
    returnTo: safeReturnTo(request.query.returnTo),
    ...(isMobile && codeChallenge !== undefined ? { appCodeChallenge: codeChallenge } : {}),
  };

  try {
    await redis.set(pendingLoginKey(state), JSON.stringify(pending), { EX: STATE_TTL_SECONDS });
  } catch (err) {
    request.log.error({ err }, 'Failed to store Google sign-in state');
    return reply.redirect(failureLocation(google, isMobile));
  }

  reply.setCookie(GOOGLE_STATE_COOKIE_NAME, state, {
    ...stateCookieOptions(config),
    maxAge: STATE_TTL_SECONDS,
  });

  const authorizeUrl = new URL(GOOGLE_AUTHORIZE_URL);
  authorizeUrl.search = new URLSearchParams({
    client_id: google.clientId,
    redirect_uri: google.redirectUri,
    response_type: 'code',
    scope: GOOGLE_SCOPES,
    state,
    nonce: pending.nonce,
    code_challenge: codeChallengeFor(pending.codeVerifier),
    code_challenge_method: 'S256',
    prompt: 'select_account',
  }).toString();

  return reply.redirect(authorizeUrl.toString());
}

export async function googleCallbackHandler(
  request: FastifyRequest<{ Querystring: GoogleCallbackQuery }>,
  reply: FastifyReply,
) {
  const { config, redis, grpcClients } = request.server;
  const google = requireGoogleConfig(config);

  // Until the pending login is read we do not know the client, so failures go to the web app.
  let isMobile = false;

  const fail = (reason: string) => {
    request.log.warn({ reason, client: isMobile ? 'mobile' : 'web' }, 'Google sign-in failed');
    return reply.redirect(failureLocation(google, isMobile));
  };

  const cookieState = request.cookies[GOOGLE_STATE_COOKIE_NAME];
  reply.clearCookie(GOOGLE_STATE_COOKIE_NAME, stateCookieOptions(config));

  const { code, state, error } = request.query;

  try {
    // Consume first: whatever happens next, this state can never be used again.
    const pending = state ? await consumePendingLogin(redis, state) : null;
    isMobile = pending?.appCodeChallenge !== undefined && google.mobileRedirectUri !== undefined;

    if (error !== undefined) {
      return fail(error === 'access_denied' ? 'cancelled_by_user' : 'google_error');
    }

    if (!state || !cookieState || !sameValue(state, cookieState)) {
      return fail('state_mismatch');
    }

    if (pending === null) {
      return fail('state_expired_or_used');
    }

    if (!code) {
      return fail('missing_code');
    }

    const result = await grpcClients.auth.loginWithGoogle(
      {
        code,
        codeVerifier: pending.codeVerifier,
        redirectUri: google.redirectUri,
        nonce: pending.nonce,
      },
      grpcDeadlinesMs.authLoginWithGoogle,
    );

    if (isMobile && pending.appCodeChallenge !== undefined) {
      const handoff = randomToken();
      const stored: MobileHandoff = {
        userId: result.userId,
        email: result.email,
        accessToken: result.accessToken,
        refreshToken: result.refreshToken,
        expiresIn: Number(result.expiresIn),
        isNewUser: result.isNewUser,
        appCodeChallenge: pending.appCodeChallenge,
      };

      await redis.set(mobileHandoffKey(handoff), JSON.stringify(stored), {
        EX: HANDOFF_TTL_SECONDS,
      });

      return reply.redirect(withQuery(requireMobileRedirectUri(google), { handoff }));
    }

    setSessionCookies(reply, config, {
      accessToken: result.accessToken,
      refreshToken: result.refreshToken,
      expiresIn: Number(result.expiresIn),
    });

    // New users continue onboarding (KYC); returning users go where they started.
    const destination = result.isNewUser ? NEW_USER_RETURN_TO : pending.returnTo;

    return reply.redirect(`${google.frontendBaseUrl}${destination}`);
  } catch (err) {
    request.log.warn({ err }, 'Google sign-in could not be completed');
    return fail('sign_in_failed');
  }
}

async function consumeMobileHandoff(
  redis: RedisClient,
  handoff: string,
): Promise<MobileHandoff | null> {
  const raw = await redis.getDel(mobileHandoffKey(handoff));

  if (raw === null) {
    return null;
  }

  const parsed = JSON.parse(raw) as Partial<MobileHandoff>;

  if (
    typeof parsed.userId !== 'string' ||
    typeof parsed.email !== 'string' ||
    typeof parsed.accessToken !== 'string' ||
    typeof parsed.refreshToken !== 'string' ||
    typeof parsed.expiresIn !== 'number' ||
    typeof parsed.isNewUser !== 'boolean' ||
    typeof parsed.appCodeChallenge !== 'string'
  ) {
    return null;
  }

  return parsed as MobileHandoff;
}

export async function googleMobileExchangeHandler(
  request: FastifyRequest<{ Body: GoogleMobileExchangeBody }>,
): Promise<GoogleMobileExchangeResponse> {
  const { config, redis } = request.server;
  requireMobileRedirectUri(requireGoogleConfig(config));

  if (!isMobileClient(request)) {
    throw new AppError('BAD_REQUEST', 'This endpoint is only for the mobile app.');
  }

  const { handoff, codeVerifier } = request.body;

  const stored = await consumeMobileHandoff(redis, handoff);

  if (stored === null || !sameValue(codeChallengeFor(codeVerifier), stored.appCodeChallenge)) {
    throw new AppError('UNAUTHENTICATED', 'Google sign-in code is invalid or has expired.');
  }

  return {
    userId: stored.userId,
    email: stored.email,
    accessToken: stored.accessToken,
    refreshToken: stored.refreshToken,
    expiresIn: stored.expiresIn,
    isNewUser: stored.isNewUser,
  };
}
