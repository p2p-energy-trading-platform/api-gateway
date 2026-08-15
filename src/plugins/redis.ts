import fp from 'fastify-plugin'
import type { FastifyPluginAsync } from 'fastify'

import type { AppConfig } from '../config/types.js'
import { createRedisClient } from '../transport/redis/client.js'

export interface RedisPluginOptions {
  config: AppConfig
}

const redisPlugin: FastifyPluginAsync<
  RedisPluginOptions
> = async (
  app,
  options,
): Promise<void> => {
  const { config } = options

  const redis =
    createRedisClient(config)

  try {
    await redis.connect()

    const result = await redis.ping()

    if (result !== 'PONG') {
      throw new Error(
        'Redis health check did not return PONG',
      )
    }

    app.log.info(
      'Redis connection established',
    )
  } catch (error) {
    app.log.error(
      { err: error },
      'Failed to connect to Redis',
    )

    redis.disconnect()

    throw error
  }

  app.decorate('redis', redis)

  app.addHook(
    'onClose',
    async () => {
      app.log.info(
        'Closing Redis connection',
      )

      try {
        await redis.quit()
      } catch (error) {
        app.log.warn(
          { err: error },
          'Redis quit failed; disconnecting',
        )

        redis.disconnect()
      }
    },
  )
}

export default fp(
  redisPlugin,
  {
    name: 'redis',
  },
)