import { Redis, type Redis as RedisClient } from 'ioredis'
import { type AppConfig } from '../../config/types.js'

export function createRedisClient(
  config: AppConfig,
): RedisClient {
  return new Redis(config.redis.url, {
    lazyConnect: true,

    connectTimeout:
      config.redis.connectTimeoutMs,

    maxRetriesPerRequest: 1,

    enableReadyCheck: true,
  })
}