import type { Interceptor } from '@connectrpc/connect';

export interface RequestTracingContext {
  requestId?: string;
  correlationId?: string;
  traceparent?: string;
  authorization?: string;
  userId?: string;
}

export function createHeaderPropagationInterceptor(
  ctxGetter: () => RequestTracingContext | undefined
): Interceptor {
  return (next) => async (req) => {
    const ctx = ctxGetter();
    if (ctx) {
      if (ctx.requestId) req.header.set('x-request-id', ctx.requestId);
      if (ctx.correlationId) req.header.set('x-correlation-id', ctx.correlationId);
      if (ctx.traceparent) req.header.set('traceparent', ctx.traceparent);
      if (ctx.authorization) req.header.set('authorization', ctx.authorization);
      if (ctx.userId) req.header.set('x-gridx-user-id', ctx.userId);
    }
    return await next(req);
  };
}