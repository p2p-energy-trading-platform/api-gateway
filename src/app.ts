import { randomUUID } from 'node:crypto';

import Fastify, { type FastifyInstance } from 'fastify';

import { validatorCompiler } from './common/validation.js';
import type { AppConfig } from './config/types.js';
import { registerErrorHandler } from './errors/error-handler.js';
import { registerHealthRoutes } from './health/routes.js';
import { createLoggerOptions } from './observability/logging.js';
import redisPlugin from './plugins/redis.js';
import { registerSecurity } from './plugins/security.js';
import { registerCors } from './plugins/cors.js';

const REQUEST_ID_PATTERN = /^[A-Za-z0-9._:-]{1,128}$/;

export interface BuildAppOptions {
  config: AppConfig;
  registerInfrastructure?: boolean;
}

export async function buildApp(options: BuildAppOptions): Promise<FastifyInstance> {
  const { config, registerInfrastructure = true } = options;

  const app = Fastify({
    logger: createLoggerOptions(config),

    bodyLimit: config.http.bodyLimitBytes,

    requestTimeout: config.http.requestTimeoutMs,

    genReqId(request) {
      const incoming = request.headers['x-request-id'];

      if (typeof incoming === 'string' && REQUEST_ID_PATTERN.test(incoming)) {
        return incoming;
      }

      return randomUUID();
    },
  });

  // Return the request ID so clients can quote it when reporting a problem.
  app.addHook('onRequest', async (request, reply) => {
    reply.header('x-request-id', request.id);
  });

  /*
   * Validation and error handling
   */
  app.setValidatorCompiler(validatorCompiler);
  registerErrorHandler(app);

  /*
   * Infrastructure plugins
   */
  await registerSecurity(app, config);
  await registerCors(app, config);

  if (registerInfrastructure) {
    await app.register(redisPlugin, {
      config,
    });
  }

  /*
   * Routes
   */
  await registerHealthRoutes(app);

  return app;
}
