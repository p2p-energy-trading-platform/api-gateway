import type { AppConfig } from '../config/types.js';
import type { GrpcClients } from '../plugins/grpc.js';
import '@fastify/request-context';
import type { RequestTracingContext } from '../transport/grpc/metadata.js';
import type { RedisClient } from '../transport/redis/client.js';

declare module '@fastify/request-context' {
  interface RequestContextData {
    tracing: RequestTracingContext;
  }
}

declare module 'fastify' {
  interface FastifyInstance {
    config: AppConfig;
    redis: RedisClient;
    grpcClients: GrpcClients;
  }
}
