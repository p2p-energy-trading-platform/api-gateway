import { randomUUID } from 'node:crypto'

import Fastify, {
  type FastifyInstance,
} from 'fastify'

import type { AppConfig } from './config/types.js'
import { registerHealthRoutes } from './health/routes.js'
import { createLoggerOptions } from './observability/logging.js'
import redisPlugin from './plugins/redis.js'
import { registerSecurity } from './plugins/security.js'
import { registerCors } from './plugins/cors.js'

export interface BuildAppOptions {
  config: AppConfig;
  registerInfrastructure?: boolean;
}

export async function buildApp(
  options: BuildAppOptions,
): Promise<FastifyInstance> {
  const { config, registerInfrastructure = true } = options

  const app = Fastify({
    logger: createLoggerOptions(config),

    bodyLimit: config.http.bodyLimitBytes,

    requestTimeout:
      config.http.requestTimeoutMs,

    genReqId(request) {
      const incoming =
        request.headers['x-request-id']

      if (
        typeof incoming === 'string' &&
        incoming.length > 0 &&
        incoming.length <= 128
      ) {
        return incoming
      }

      return randomUUID()
    },
  })

  /*
   * Infrastructure plugins
   */
  await registerSecurity(app)
  await registerCors(app, config)

  if (registerInfrastructure) {
    await app.register(redisPlugin, {
      config,
    })
  }

  /*
   * Routes
   */
  await registerHealthRoutes(app)

  return app
}