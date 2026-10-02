import helmet from '@fastify/helmet';
import type { FastifyInstance } from 'fastify';

import type { AppConfig } from '../config/types.js';

const ONE_YEAR_SECONDS = 31_536_000;

export async function registerSecurity(app: FastifyInstance, config: AppConfig): Promise<void> {
  await app.register(helmet, {
    /*
     * The gateway only returns JSON, so responses never need to load scripts, styles, or
     * images, and must never be embedded in another site's frame.
     */
    contentSecurityPolicy: {
      useDefaults: false,
      directives: {
        defaultSrc: ["'none'"],
        frameAncestors: ["'none'"],
      },
    },

    /*
     * HSTS tells browsers to use HTTPS only. Sent only in production so local http
     * development is not affected.
     */
    hsts:
      config.nodeEnv === 'production'
        ? { maxAge: ONE_YEAR_SECONDS, includeSubDomains: true }
        : false,
  });

  /*
   * API responses may contain tokens or personal data, so browsers and proxies must not
   * cache them. Routes that are safe to cache can set their own Cache-Control header.
   */
  app.addHook('onSend', async (_request, reply) => {
    if (!reply.hasHeader('cache-control')) {
      reply.header('cache-control', 'no-store');
    }
  });
}
