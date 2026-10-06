import { describe, expect, it } from 'vitest';

import { getTraceContext, toTraceparent } from '../../../src/observability/tracing.js';

const TRACE_ID = '4bf92f3577b34da6a3ce929d0e0e4736';
const PARENT_ID = '00f067aa0ba902b7';
const VALID = `00-${TRACE_ID}-${PARENT_ID}-01`;

describe('getTraceContext', () => {
  it('keeps the trace ID from a valid traceparent header', () => {
    const context = getTraceContext(VALID);

    expect(context.traceId).toBe(TRACE_ID);
    expect(context.parentSpanId).toBe(PARENT_ID);
    expect(context.spanId).toMatch(/^[0-9a-f]{16}$/);
  });

  it('accepts upper-case hex and surrounding spaces', () => {
    expect(getTraceContext(`  ${VALID.toUpperCase()} `).traceId).toBe(TRACE_ID);
  });

  it.each([
    ['a missing header', undefined],
    ['an empty header', ''],
    ['a malformed header', 'not-a-traceparent'],
    ['a wrong version', `01-${TRACE_ID}-${PARENT_ID}-01`],
    ['a short trace ID', `00-abc-${PARENT_ID}-01`],
    ['an all-zero trace ID', `00-${'0'.repeat(32)}-${PARENT_ID}-01`],
    ['an all-zero parent span ID', `00-${TRACE_ID}-${'0'.repeat(16)}-01`],
  ])('starts a new trace for %s', (_name, header) => {
    const context = getTraceContext(header);

    expect(context.traceId).toMatch(/^[0-9a-f]{32}$/);
    expect(context.traceId).not.toBe(TRACE_ID);
    expect(context.parentSpanId).toBeNull();
  });

  it('creates a different trace ID each time', () => {
    expect(getTraceContext(undefined).traceId).not.toBe(getTraceContext(undefined).traceId);
  });
});

describe('toTraceparent', () => {
  it('builds a valid header with the same trace ID and the gateway span ID', () => {
    const context = getTraceContext(VALID);

    expect(toTraceparent(context)).toBe(`00-${TRACE_ID}-${context.spanId}-01`);
  });
});
