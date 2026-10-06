import { randomUUID } from 'node:crypto';

import Fastify, { LogController, type FastifyInstance } from 'fastify';

import { validatorCompiler } from './common/validation.js';
import type { AppConfig } from './config/types.js';
import { registerErrorHandler } from './errors/error-handler.js';
import { registerHealthRoutes } from './health/routes.js';
import { createLoggerOptions } from './observability/logging.js';
import observabilityPlugin from './plugins/observability.js';
import rateLimitPlugin from './plugins/rate-limit.js';
import redisPlugin from './plugins/redis.js';
import { registerSecurity } from './plugins/security.js';
import { registerCors } from './plugins/cors.js';
import fastifyRequestContext from '@fastify/request-context';
import grpcPlugin from './plugins/grpc.js';
import { registerAuthRoutes } from './features/auth/routes.js';

const REQUEST_ID_PATTERN = /^[A-Za-z0-9._:-]{1,128}$/;

export interface BuildAppOptions {
  config: AppConfig;
  registerInfrastructure?: boolean;
}

export async function buildApp(options: BuildAppOptions): Promise<FastifyInstance> {
  const { config, registerInfrastructure = true } = options;

  const app = Fastify({
    logger: createLoggerOptions(config),

    // We write one structured log line per request ourselves (plugins/observability.ts).
    logController: new LogController({
      disableRequestLogging: true,
      requestIdLogLabel: 'requestId',
    }),

    bodyLimit: config.http.bodyLimitBytes,

    requestTimeout: config.http.requestTimeoutMs,

    trustProxy: config.http.trustProxy,

    genReqId(request) {
      const incoming = request.headers['x-request-id'];

      if (typeof incoming === 'string' && REQUEST_ID_PATTERN.test(incoming)) {
        return incoming;
      }

      return randomUUID();
    },
  });

  app.decorate('config', config);

  // Initializes store and seeds tracing details for gRPC header propagation
  await app.register(fastifyRequestContext, {
    defaultStoreValues: (req) => ({
      tracing: {
        requestId: req.id,
        correlationId:
          (typeof req.headers['x-correlation-id'] === 'string'
            ? req.headers['x-correlation-id']
            : undefined) ?? req.id,
        traceparent:
          typeof req.headers['traceparent'] === 'string' ? req.headers['traceparent'] : undefined,
        authorization:
          typeof req.headers['authorization'] === 'string'
            ? req.headers['authorization']
            : undefined,
      },
    }),
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
   * Observability: trace IDs, metrics, request logs.
   * Registered before everything else (and before rate-limit) so all later hooks and logs
   * already have a trace ID and the metrics are ready.
   */
  await app.register(observabilityPlugin);

  /*
   * Infrastructure plugins
   */
  await registerSecurity(app, config);
  await registerCors(app, config);

  if (registerInfrastructure) {
    await app.register(redisPlugin, {
      config,
    });

    await app.register(rateLimitPlugin, {
      config,
    });

    await app.register(grpcPlugin);
  }

  /*
   * Routes
   */
  await registerHealthRoutes(app);
  await registerAuthRoutes(app);

  return app;
}
