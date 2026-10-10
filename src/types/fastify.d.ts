import type { AppConfig } from '../config/types.js';
import type { GrpcClients } from '../plugins/grpc.js';
import '@fastify/request-context';
import type { RequestTracingContext } from '../transport/grpc/metadata.js';
import type { RedisClient } from '../transport/redis/client.js';

import type { Metrics } from '../observability/metrics.js';
import type { TraceContext } from '../observability/tracing.js';
import type { AuthenticatedPrincipal } from './authentication.js';
import type { RouteAuthPolicy } from '../policies/route-auth.ts';

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

  interface FastifyContextConfig {
    auth?: RouteAuthPolicy;
  }

  interface FastifyRequest {
    traceContext: TraceContext;
    principal: AuthenticatedPrincipal | null;
    cookies: { [key: string]: string | undefined };
  }
}
