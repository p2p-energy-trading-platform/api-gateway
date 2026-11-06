import fp from 'fastify-plugin';
import type { FastifyPluginAsync } from 'fastify';

import { AppError } from '../errors/app-error.js';
import type { AppConfig } from '../config/types.js';

const METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
const GATEWAY_COOKIES = new Set(['gridx_access', 'gridx_refresh']);

function hasGatewayCookie(header: string | undefined): boolean {
  if (header === undefined) {
    return false;
  }

  return header.split(';').some((part) => {
    const name = part.trim().split('=', 1)[0];
    return name !== undefined && GATEWAY_COOKIES.has(name);
  });
}

export interface CsrfPluginOptions {
  config: AppConfig;
}

const csrfPlugin: FastifyPluginAsync<CsrfPluginOptions> = async (app, options) => {
  app.addHook('onRequest', async (request) => {
    if (!METHODS.has(request.method) || !hasGatewayCookie(request.headers.cookie)) {
      return;
    }

    const origin = request.headers.origin;

    if (typeof origin !== 'string' || !options.config.cors.origins.includes(origin)) {
      throw new AppError(
        'FORBIDDEN',
        'A valid Origin header is required for cookie-authenticated requests.',
      );
    }
  });
};

export default fp(csrfPlugin, { name: 'csrf' });
