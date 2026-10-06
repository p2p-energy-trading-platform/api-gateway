import { Counter, Gauge, Histogram, Registry, collectDefaultMetrics } from 'prom-client';

const HTTP_LABELS = ['method', 'route', 'status_code'] as const;

// A factory, not global objects: every buildApp() (and every test) gets its own registry.
export function createMetrics() {
  const registry = new Registry();

  // CPU, memory, event-loop delay, etc.
  collectDefaultMetrics({ register: registry });

  const httpRequests = new Counter({
    name: 'http_requests_total',
    help: 'HTTP requests handled by the gateway.',
    labelNames: HTTP_LABELS,
    registers: [registry],
  });

  const httpDuration = new Histogram({
    name: 'http_request_duration_seconds',
    help: 'HTTP request duration in seconds.',
    labelNames: HTTP_LABELS,
    buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5],
    registers: [registry],
  });

  const httpInFlight = new Gauge({
    name: 'http_requests_in_flight',
    help: 'HTTP requests currently being handled.',
    registers: [registry],
  });

  const rateLimitDecisions = new Counter({
    name: 'gateway_rate_limit_decisions_total',
    help: 'Rate-limit checks by policy and result.',
    labelNames: ['policy', 'result'] as const, // result: "allowed" | "denied"
    registers: [registry],
  });

  const rateLimitErrors = new Counter({
    name: 'gateway_rate_limit_errors_total',
    help: 'Rate-limit checks that failed because Redis was unavailable.',
    labelNames: ['policy'] as const,
    registers: [registry],
  });

  const rateLimitDuration = new Histogram({
    name: 'gateway_rate_limit_duration_seconds',
    help: 'Time spent checking the rate limit in Redis.',
    labelNames: ['policy'] as const,
    buckets: [0.001, 0.0025, 0.005, 0.01, 0.025, 0.05, 0.1],
    registers: [registry],
  });

  return {
    registry,
    httpRequests,
    httpDuration,
    httpInFlight,
    rateLimitDecisions,
    rateLimitErrors,
    rateLimitDuration,
  };
}

export type Metrics = ReturnType<typeof createMetrics>;
