import type { FastifyReply, FastifyRequest } from 'fastify';

import type { AppConfig } from '../../config/types.js';

export const ACCESS_COOKIE_NAME = 'gridx_access';
export const REFRESH_COOKIE_NAME = 'gridx_refresh';

const REFRESH_COOKIE_PATH = '/api/v1/auth';

export interface SessionTokens {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

export type RefreshCredential = {
  token: string;
  source: 'bearer' | 'cookie';
};

function baseCookieOptions(config: AppConfig) {
  return {
    httpOnly: true,
    secure: config.cookies.secure,
    sameSite: config.cookies.sameSite,
    ...(config.cookies.domain === undefined ? {} : { domain: config.cookies.domain }),
  } as const;
}

export function setSessionCookies(
  reply: FastifyReply,
  config: AppConfig,
  tokens: SessionTokens,
): void {
  reply.setCookie(ACCESS_COOKIE_NAME, tokens.accessToken, {
    ...baseCookieOptions(config),
    path: '/',
    maxAge: tokens.expiresIn,
  });

  reply.setCookie(REFRESH_COOKIE_NAME, tokens.refreshToken, {
    ...baseCookieOptions(config),
    path: REFRESH_COOKIE_PATH,
    maxAge: config.cookies.refreshMaxAgeSeconds,
  });
}

export function clearSessionCookies(reply: FastifyReply, config: AppConfig): void {
  reply.clearCookie(ACCESS_COOKIE_NAME, { ...baseCookieOptions(config), path: '/' });
  reply.clearCookie(REFRESH_COOKIE_NAME, {
    ...baseCookieOptions(config),
    path: REFRESH_COOKIE_PATH,
  });
}

export function readRefreshToken(request: FastifyRequest): string | undefined {
  return readRefreshCredential(request)?.token;
}

export function readRefreshCredential(request: FastifyRequest): RefreshCredential | undefined {
  const authorization = request.headers.authorization;

  if (authorization !== undefined) {
    const match = /^Bearer ([^\s]+)$/.exec(authorization);

    if (match === null) {
      return undefined;
    }

    const token = match[1];
    return token === undefined ? undefined : { token, source: 'bearer' };
  }

  const token = request.cookies[REFRESH_COOKIE_NAME];

  return token === undefined || token === '' ? undefined : { token, source: 'cookie' };
}
