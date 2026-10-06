import fp from 'fastify-plugin';
import type { FastifyPluginAsync, FastifyRequest } from 'fastify';

import { createMetrics } from '../observability/metrics.js';
import { getTraceContext, toTraceparent, type TraceContext } from '../observability/tracing.js';

const observabilityPlugin: FastifyPluginAsync = async (app) => {
  const metrics = createMetrics();

  app.decorate('metrics', metrics);
  // Set for every request in the first onRequest hook below.
  app.decorateRequest('traceContext', null as unknown as TraceContext);

  // Requests currently counted in the in-flight gauge. A request is removed exactly once,
  // so an aborted request can never be subtracted twice.
  const inFlight = new WeakSet<FastifyRequest>();

  // 1. Trace ID. Registered FIRST so every later log line already has traceId.
  app.addHook('onRequest', async (request) => {
    const header = request.headers.traceparent;

    request.traceContext = getTraceContext(typeof header === 'string' ? header : undefined);

    // Every log line written through request.log now includes traceId.
    request.log = request.log.child({ traceId: request.traceContext.traceId });

    const tracing = request.requestContext?.get('tracing');

    if (tracing !== undefined) {
      request.requestContext.set('tracing', {
        ...tracing,
        traceparent: toTraceparent(request.traceContext),
      });
    }
  });

  // 2. In-flight gauge goes up.
  app.addHook('onRequest', async (request) => {
    inFlight.add(request);
    metrics.httpInFlight.inc();
  });

  // The client hung up before the response finished.
  app.addHook('onRequestAbort', async (request) => {
    if (inFlight.delete(request)) {
      metrics.httpInFlight.dec();
    }
  });

  // 3. Request finished: update metrics and write ONE log line.
  app.addHook('onResponse', async (request, reply) => {
    if (inFlight.delete(request)) {
      metrics.httpInFlight.dec();
    }

    // The route TEMPLATE, e.g. "/api/v1/devices/:id", never the raw URL.
    const route = request.routeOptions.url ?? 'not_found';

    const labels = {
      method: request.method,
      route,
      status_code: String(reply.statusCode),
    };

    metrics.httpRequests.inc(labels);
    metrics.httpDuration.observe(labels, reply.elapsedTime / 1000);

    request.log.info(
      {
        method: request.method,
        route,
        statusCode: reply.statusCode,
        durationMs: Math.round(reply.elapsedTime),
      },
      'request completed',
    );
  });
};

export default fp(observabilityPlugin, { name: 'observability' });
