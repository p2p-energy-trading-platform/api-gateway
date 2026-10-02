import { Writable } from 'node:stream';

import Fastify from 'fastify';
import { describe, expect, it } from 'vitest';

import { createLoggerOptions } from '../../../src/observability/logging.js';
import { testConfig } from '../../helpers/test-config.js';

/*
 * Builds a Fastify logger with the real gateway logger options, writing to memory so the
 * output can be inspected. Fastify's default `req` serializer drops headers entirely, so it is
 * replaced with a pass-through here to test the redact paths themselves (e.g. if a future
 * serializer starts logging headers).
 */
function createCapturingLogger() {
  const lines: string[] = [];

  const stream = new Writable({
    write(chunk: Buffer, _encoding, callback) {
      lines.push(chunk.toString());
      callback();
    },
  });

  const app = Fastify({
    logger: {
      ...(createLoggerOptions(testConfig) as object),
      level: 'info',
      stream,
      serializers: {
        req: (req) => req as unknown as Record<string, unknown>,
        res: (res) => res as unknown as Record<string, unknown>,
      },
    },
  });

  return { log: app.log, output: () => lines.join('') };
}

describe('log redaction', () => {
  it('redacts authorization, cookie, and API key headers', () => {
    const { log, output } = createCapturingLogger();

    log.info(
      {
        req: {
          headers: {
            authorization: 'Bearer eyJhbGciOi.secret-token',
            cookie: 'session=abc123',
            'x-api-key': 'key-456',
            'user-agent': 'vitest',
          },
        },
      },
      'request',
    );

    expect(output()).not.toContain('secret-token');
    expect(output()).not.toContain('abc123');
    expect(output()).not.toContain('key-456');
    expect(output()).toContain('vitest');
    expect(output()).toContain('[REDACTED]');
  });

  it('redacts sensitive fields at the top level and one level deep', () => {
    const { log, output } = createCapturingLogger();

    log.info(
      {
        password: 'top-level-pass',
        body: { email: 'user@example.com', password: 'nested-pass', refreshToken: 'rt-789' },
      },
      'login attempt',
    );

    expect(output()).not.toContain('top-level-pass');
    expect(output()).not.toContain('nested-pass');
    expect(output()).not.toContain('rt-789');
    expect(output()).toContain('user@example.com');
  });

  it('redacts set-cookie response headers', () => {
    const { log, output } = createCapturingLogger();

    log.info({ res: { headers: { 'set-cookie': 'refresh=xyz-999' } } }, 'response');

    expect(output()).not.toContain('xyz-999');
  });
});
