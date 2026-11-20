import type { FastifyRequest } from 'fastify';

/*
 * Mobile apps send `X-Client-Type: mobile` because they cannot use cookies.
 * For these requests, tokens are sent and received in the JSON body. Cookies are not used.
 *
 * Security: this header is not allowed in CORS, so other websites cannot send it.
 * Mobile requests also never read cookies, so a browser cannot use this header
 * to get its refresh token as JSON.
 */
export const CLIENT_TYPE_HEADER = 'x-client-type';

const MAX_REFRESH_TOKEN_LENGTH = 4096;

export function isMobileClient(request: FastifyRequest): boolean {
  return request.headers[CLIENT_TYPE_HEADER] === 'mobile';
}

/* Reads `{ "refreshToken": "..." }` from a mobile request body. */
export function readBodyRefreshToken(request: FastifyRequest): string | undefined {
  const body: unknown = request.body;

  if (typeof body !== 'object' || body === null || !('refreshToken' in body)) {
    return undefined;
  }

  const token = body.refreshToken;

  if (typeof token !== 'string' || token === '' || token.length > MAX_REFRESH_TOKEN_LENGTH) {
    return undefined;
  }

  return token;
}
