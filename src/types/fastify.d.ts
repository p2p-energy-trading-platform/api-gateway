import type Redis from 'ioredis';
import type { AppConfig } from '../config/types.ts';
import type { GrpcClients } from '../plugins/grpc.ts';
import '@fastify/request-context';
import type { RequestTracingContext } from '../transport/grpc/metadata.js';

declare module '@fastify/request-context' {
  interface RequestContextData {
    tracing: RequestTracingContext;
  }
}

declare module 'fastify' {
  interface FastifyInstance {
    config: AppConfig;
    redis: Redis;
    grpcClients: GrpcClients;
  }
}
