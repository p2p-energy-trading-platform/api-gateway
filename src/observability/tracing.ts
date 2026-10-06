import { randomBytes } from 'node:crypto';

// W3C trace context: "00-<32 hex trace id>-<16 hex parent span id>-<2 hex flags>"
const TRACEPARENT = /^00-([0-9a-f]{32})-([0-9a-f]{16})-[0-9a-f]{2}$/;
const ALL_ZEROS = /^0+$/;

export interface TraceContext {
  traceId: string;
  parentSpanId: string | null;
  spanId: string;
}

function newSpanId(): string {
  return randomBytes(8).toString('hex');
}

// Keep a valid incoming trace; otherwise start a new one. Never trust a malformed value.
export function getTraceContext(header: string | undefined): TraceContext {
  const [, traceId, parentSpanId] = TRACEPARENT.exec(header?.trim().toLowerCase() ?? '') ?? [];

  if (
    traceId !== undefined &&
    parentSpanId !== undefined &&
    !ALL_ZEROS.test(traceId) &&
    !ALL_ZEROS.test(parentSpanId)
  ) {
    return { traceId, parentSpanId, spanId: newSpanId() };
  }

  return { traceId: randomBytes(16).toString('hex'), parentSpanId: null, spanId: newSpanId() };
}

// The header to send to downstream services (used later by gRPC calls).
export function toTraceparent(context: TraceContext): string {
  return `00-${context.traceId}-${context.spanId}-01`;
}
