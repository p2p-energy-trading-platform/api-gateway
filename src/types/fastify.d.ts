import type Redis from 'ioredis';

import type { Metrics } from '../observability/metrics.js';
import type { TraceContext } from '../observability/tracing.js';

declare module 'fastify' {
  interface FastifyInstance {
    redis: Redis;
    metrics: Metrics;
  }

  interface FastifyRequest {
    traceContext: TraceContext;
  }
}
