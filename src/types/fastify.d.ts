import type { AppConfig } from '../config/types.js';
import type { GrpcClients } from '../plugins/grpc.js';
import '@fastify/request-context';
import type { RequestTracingContext } from '../transport/grpc/metadata.js';
import type { RedisClient } from '../transport/redis/client.js';

import type { Metrics } from '../observability/metrics.js';
import type { TraceContext } from '../observability/tracing.js';

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
    metrics: Metrics;
  }

  interface FastifyRequest {
    traceContext: TraceContext;
  }
}
