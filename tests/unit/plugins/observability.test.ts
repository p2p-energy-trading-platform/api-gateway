import { Writable } from 'node:stream';

import Fastify, { LogController } from 'fastify';
import { describe, expect, it } from 'vitest';

import type {} from '../../../src/types/fastify.d.ts';
import observabilityPlugin from '../../../src/plugins/observability.js';

/*
 * Builds a small Fastify app with only the observability plugin. Logs are written to memory
 * so the tests can read them (same idea as tests/unit/observability/redaction.test.ts).
 */
async function buildTestApp() {
  const lines: string[] = [];

  const stream = new Writable({
    write(chunk: Buffer, _encoding, callback) {
      lines.push(chunk.toString());
      callback();
    },
  });

  const app = Fastify({
    logger: { level: 'info', stream },
    logController: new LogController({
      disableRequestLogging: true,
      requestIdLogLabel: 'requestId',
    }),
  });

  await app.register(observabilityPlugin);

  app.get('/ok', async () => ({ ok: true }));
  app.get('/items/:id', async () => ({ ok: true }));
  app.get('/boom', async () => {
    throw new Error('boom');
  });

  await app.ready();

  const logs = () =>
    lines
      .join('')
      .split('\n')
      .filter(Boolean)
      .map((line) => JSON.parse(line) as Record<string, unknown>);

  const completed = () => logs().filter((entry) => entry.msg === 'request completed');

  return { app, logs, completed };
}

describe('request log', () => {
  it('writes exactly one structured line per request', async () => {
    const { app, completed } = await buildTestApp();

    await app.inject({ method: 'GET', url: '/ok' });

    const entries = completed();

    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      method: 'GET',
      route: '/ok',
      statusCode: 200,
      requestId: expect.any(String),
    });
    expect(typeof entries[0]?.durationMs).toBe('number');

    await app.close();
  });

  it('logs the route template, not the raw URL', async () => {
    const { app, completed } = await buildTestApp();

    await app.inject({ method: 'GET', url: '/items/42' });

    expect(completed()[0]?.route).toBe('/items/:id');
    expect(JSON.stringify(completed())).not.toContain('/items/42');

    await app.close();
  });

  it('logs 404s as not_found and never the raw URL', async () => {
    const { app, completed } = await buildTestApp();

    await app.inject({ method: 'GET', url: '/secret/user-123' });

    expect(completed()[0]).toMatchObject({ route: 'not_found', statusCode: 404 });
    expect(JSON.stringify(completed())).not.toContain('user-123');

    await app.close();
  });
});

describe('trace IDs', () => {
  it('keeps the trace ID of an incoming traceparent header in the log line', async () => {
    const { app, completed } = await buildTestApp();
    const traceId = '4bf92f3577b34da6a3ce929d0e0e4736';

    await app.inject({
      method: 'GET',
      url: '/ok',
      headers: { traceparent: `00-${traceId}-00f067aa0ba902b7-01` },
    });

    expect(completed()[0]?.traceId).toBe(traceId);

    await app.close();
  });

  it('creates a new trace ID when the header is missing or invalid', async () => {
    const { app, completed } = await buildTestApp();

    await app.inject({ method: 'GET', url: '/ok' });
    await app.inject({ method: 'GET', url: '/ok', headers: { traceparent: 'garbage' } });

    const [first, second] = completed();

    expect(first?.traceId).toMatch(/^[0-9a-f]{32}$/);
    expect(second?.traceId).toMatch(/^[0-9a-f]{32}$/);
    expect(first?.traceId).not.toBe(second?.traceId);

    await app.close();
  });
});

describe('metrics', () => {
  it('counts a request with method, route template and status code', async () => {
    const { app } = await buildTestApp();

    await app.inject({ method: 'GET', url: '/ok' });

    const text = await app.metrics.registry.metrics();

    expect(text).toContain('http_requests_total{method="GET",route="/ok",status_code="200"} 1');
    expect(text).toContain(
      'http_request_duration_seconds_count{method="GET",route="/ok",status_code="200"} 1',
    );

    await app.close();
  });

  it('uses the route template as the label, never the raw URL', async () => {
    const { app } = await buildTestApp();

    await app.inject({ method: 'GET', url: '/items/1' });
    await app.inject({ method: 'GET', url: '/items/2' });

    const text = await app.metrics.registry.metrics();

    expect(text).toContain('route="/items/:id",status_code="200"} 2');
    expect(text).not.toContain('/items/1');

    await app.close();
  });

  it('counts a 500 with status_code="500"', async () => {
    const { app } = await buildTestApp();

    await app.inject({ method: 'GET', url: '/boom' });

    const text = await app.metrics.registry.metrics();

    expect(text).toContain('http_requests_total{method="GET",route="/boom",status_code="500"} 1');

    await app.close();
  });

  it('counts a 404 with route="not_found"', async () => {
    const { app } = await buildTestApp();

    await app.inject({ method: 'GET', url: '/nope/abc' });

    const text = await app.metrics.registry.metrics();

    expect(text).toContain('route="not_found",status_code="404"} 1');
    expect(text).not.toContain('/nope/abc');

    await app.close();
  });

  it('brings the in-flight gauge back to 0 after requests finish', async () => {
    const { app } = await buildTestApp();

    await Promise.all([
      app.inject({ method: 'GET', url: '/ok' }),
      app.inject({ method: 'GET', url: '/boom' }),
      app.inject({ method: 'GET', url: '/missing' }),
    ]);

    const text = await app.metrics.registry.metrics();

    expect(text).toMatch(/^http_requests_in_flight 0$/m);

    await app.close();
  });

  it('exposes default process metrics', async () => {
    const { app } = await buildTestApp();

    const text = await app.metrics.registry.metrics();

    expect(text).toContain('process_cpu_user_seconds_total');

    await app.close();
  });
});
