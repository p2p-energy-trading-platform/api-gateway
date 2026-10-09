import type { FastifyReply } from 'fastify';

import type { AppConfig } from '../../config/types.js';

export const ACCESS_COOKIE_NAME = 'gridx_access';

function accessCookieOptions(config: AppConfig) {
  return {
    httpOnly: true,
    secure: config.cookies.secure,
    sameSite: 'lax' as const,
    path: '/',
    ...(config.cookies.domain === undefined ? {} : { domain: config.cookies.domain }),
  } as const;
}

export function setAccessCookie(
  reply: FastifyReply,
  config: AppConfig,
  accessToken: string,
  expiresIn: number,
): void {
  reply.setCookie(ACCESS_COOKIE_NAME, accessToken, {
    ...accessCookieOptions(config),
    maxAge: expiresIn,
  });
}

export function clearAccessCookie(reply: FastifyReply, config: AppConfig): void {
  reply.clearCookie(ACCESS_COOKIE_NAME, accessCookieOptions(config));
}
