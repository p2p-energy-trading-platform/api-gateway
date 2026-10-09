import type { FastifyReply } from 'fastify';

import type { AppConfig } from '../../config/types.js';

export const ACCESS_COOKIE_NAME = 'gridx_access';
export const REFRESH_COOKIE_NAME = 'gridx_refresh';
export const REFRESH_COOKIE_PATH = '/api/v1/auth';

function cookieOptions(config: AppConfig) {
  return {
    httpOnly: true,
    secure: config.cookies.secure,
    sameSite: config.cookies.sameSite,
    ...(config.cookies.domain === undefined ? {} : { domain: config.cookies.domain }),
  } as const;
}

export function setAuthCookies(
  reply: FastifyReply,
  config: AppConfig,
  accessToken: string,
  refreshToken: string,
  expiresIn: number,
): void {
  reply.setCookie(ACCESS_COOKIE_NAME, accessToken, {
    ...cookieOptions(config),
    path: '/',
    maxAge: expiresIn,
  });
  reply.setCookie(REFRESH_COOKIE_NAME, refreshToken, {
    ...cookieOptions(config),
    path: REFRESH_COOKIE_PATH,
    maxAge: config.cookies.refreshMaxAgeSeconds,
  });
}

export function clearAuthCookies(reply: FastifyReply, config: AppConfig): void {
  const options = cookieOptions(config);
  reply.clearCookie(ACCESS_COOKIE_NAME, { ...options, path: '/' });
  reply.clearCookie(REFRESH_COOKIE_NAME, { ...options, path: REFRESH_COOKIE_PATH });
}
