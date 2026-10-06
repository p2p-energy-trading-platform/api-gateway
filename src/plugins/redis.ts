import fp from 'fastify-plugin';
import type { FastifyPluginAsync } from 'fastify';
import { createRedisClient } from '../transport/redis/client.js';
import type { AppConfig } from '../config/types.js';

export interface RedisPluginOptions {
  config: AppConfig;
}

const redisPlugin: FastifyPluginAsync<RedisPluginOptions> = async (fastify, options) => {
  const client = createRedisClient({
    url: options.config.redis.url,
    onError: (error) => {
      fastify.log.error({ err: error }, 'Redis client error');
    },
  });

  await client.connect();

  fastify.decorate('redis', client);

  fastify.addHook('onClose', async () => {
    if (client.isOpen) {
      await client.close();
    }
  });
};

export default fp(redisPlugin, { name: 'redis' });
