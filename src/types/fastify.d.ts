import type { AppConfig } from '../config/types.js';
import type { GrpcClients } from '../plugins/grpc.js';
import '@fastify/request-context';
import type { RequestTracingContext } from '../transport/grpc/metadata.js';
import type { RedisClient } from '../transport/redis/client.js';

import type { Metrics } from '../observability/metrics.js';
import type { TraceContext } from '../observability/tracing.js';
import type { AuthenticatedPrincipal } from './authentication.js';
import type { RouteAuthPolicy } from '../policies/route-auth.ts';
import type { RateLimitPolicyName } from '../policies/rate-limits.ts';
import type { WebsocketLimits } from '../policies/websocket.ts';
import type { WebsocketUser } from '../websocket/connection.ts';

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
    realtime: {
      // Sends an event to every local connection subscribed to the topic key.
      publish(topicKey: string, event: string, payload: unknown): number;
      connectionCount(): number;
      limits: WebsocketLimits;
    };
  }

  interface FastifyContextConfig {
    auth?: RouteAuthPolicy;
    rateLimit?: RateLimitPolicyName | false;
  }

  interface FastifyRequest {
    traceContext: TraceContext;
    principal: AuthenticatedPrincipal | null;
    cookies: Record<string, string | undefined>;
    websocketUser: WebsocketUser | null;
  }
}

declare module '@fastify/cookie' {
  import { FastifyPluginAsync } from 'fastify';
  const fastifyCookie: FastifyPluginAsync<any>;
  export default fastifyCookie;
}
