import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { loadConfig, parseCorsOrigins, parseTrustProxy } from './env.js';

const REQUIRED_ENV = {
  NODE_ENV: 'test',
  SERVICE_NAME: 'api-gateway',
  PORT: '3000',
  REDIS_URL: 'redis://localhost:6379',
};

// Every key loadConfig()/schema.ts reads from process.env. Cleared before
// each test so results never depend on a local .env file being present.
const ALL_SCHEMA_KEYS = [
  'NODE_ENV',
  'SERVICE_NAME',
  'SERVICE_VERSION',
  'HOST',
  'PORT',
  'LOG_LEVEL',
  'BODY_LIMIT_BYTES',
  'REQUEST_TIMEOUT_MS',
  'CORS_ORIGINS',
  'REDIS_URL',
  'REDIS_CONNECT_TIMEOUT_MS',
  'TRUST_PROXY',
  'RATE_LIMIT_HASH_SECRET',
  'METRICS_HOST',
  'METRICS_PORT',
];

let originalEnv: NodeJS.ProcessEnv;

beforeEach(() => {
  originalEnv = { ...process.env };

  for (const key of ALL_SCHEMA_KEYS) {
    delete process.env[key];
  }
});

afterEach(() => {
  process.env = originalEnv;
});

function setEnv(overrides: Record<string, string | undefined>): void {
  for (const [key, value] of Object.entries(overrides)) {
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
}

describe('loadConfig', () => {
  it('loads successfully with all required env vars present', () => {
    setEnv(REQUIRED_ENV);

    const config = loadConfig();

    expect(config.nodeEnv).toBe('test');
    expect(config.service.name).toBe('api-gateway');
    expect(config.http.port).toBe(3000);
    expect(config.redis.url).toBe('redis://localhost:6379');
  });

  it('applies documented defaults for optional env vars', () => {
    setEnv(REQUIRED_ENV);

    const config = loadConfig();

    expect(config.http.host).toBe('0.0.0.0');
    expect(config.logging.level).toBe('info');
    expect(config.cors.origins).toEqual(['http://localhost:5173']);
  });

  it('throws a clear error when a required env var is missing', () => {
    setEnv({ ...REQUIRED_ENV, REDIS_URL: undefined });

    expect(() => loadConfig()).toThrowError(/REDIS_URL/);
  });

  it('throws when NODE_ENV is not one of the allowed values', () => {
    setEnv({ ...REQUIRED_ENV, NODE_ENV: 'staging' });

    expect(() => loadConfig()).toThrowError(/NODE_ENV/);
  });

  it('throws when PORT is out of the allowed range', () => {
    setEnv({ ...REQUIRED_ENV, PORT: '70000' });

    expect(() => loadConfig()).toThrowError(/PORT/);
  });

  it('splits and trims comma-separated CORS_ORIGINS', () => {
    setEnv({
      ...REQUIRED_ENV,
      CORS_ORIGINS: 'http://localhost:5173, http://localhost:4000 ,http://example.com',
    });

    const config = loadConfig();

    expect(config.cors.origins).toEqual([
      'http://localhost:5173',
      'http://localhost:4000',
      'http://example.com',
    ]);
  });

  it.each(['', 'localhost:6379', 'http://localhost:6379'])(
    'throws when REDIS_URL is "%s"',
    (redisUrl) => {
      setEnv({ ...REQUIRED_ENV, REDIS_URL: redisUrl });

      expect(() => loadConfig()).toThrowError(/REDIS_URL/);
    },
  );

  it('accepts a TLS rediss:// REDIS_URL', () => {
    setEnv({ ...REQUIRED_ENV, REDIS_URL: 'rediss://user:pass@redis.internal:6380' });

    expect(loadConfig().redis.url).toBe('rediss://user:pass@redis.internal:6380');
  });

  it.each(['SERVICE_NAME', 'HOST'])('throws when %s is empty', (key) => {
    setEnv({ ...REQUIRED_ENV, [key]: '' });

    expect(() => loadConfig()).toThrowError(new RegExp(key));
  });
});

describe('parseCorsOrigins', () => {
  it.each([
    ['*', /wildcard/],
    ['http://localhost:5173,*', /wildcard/],
    [' , ', /at least one origin/],
    ['localhost:5173', /http or https/],
    ['not a url', /invalid origin/],
    ['ftp://example.com', /http or https/],
    ['http://localhost:5173/', /trailing slash/],
    ['https://app.gridx.io/dashboard', /path/],
  ])('rejects "%s"', (raw, message) => {
    expect(() => parseCorsOrigins(raw, 'development')).toThrowError(message);
  });

  it('rejects http origins in production', () => {
    expect(() => parseCorsOrigins('http://app.gridx.io', 'production')).toThrowError(/https/);
  });

  it('accepts https origins in production', () => {
    expect(parseCorsOrigins('https://app.gridx.io, https://m.gridx.io', 'production')).toEqual([
      'https://app.gridx.io',
      'https://m.gridx.io',
    ]);
  });

  it('makes loadConfig fail on an invalid origin', () => {
    setEnv({ ...REQUIRED_ENV, CORS_ORIGINS: '*' });

    expect(() => loadConfig()).toThrowError(/CORS_ORIGINS/);
  });
});

describe('parseTrustProxy', () => {
  it.each([
    ['', false],
    ['false', false],
    ['0', false],
    ['10.0.0.1', ['10.0.0.1']],
    ['10.0.0.0/8, 192.168.1.10', ['10.0.0.0/8', '192.168.1.10']],
    ['2001:db8::/32', ['2001:db8::/32']],
  ])('parses "%s"', (raw, expected) => {
    expect(parseTrustProxy(raw)).toEqual(expected);
  });

  it('rejects "true" because any client could fake its IP', () => {
    expect(() => parseTrustProxy('true')).toThrowError(/fake its IP/);
  });

  it.each(['1', '2'])('rejects hop count "%s"', (raw) => {
    expect(() => parseTrustProxy(raw)).toThrowError(/not a hop count/);
  });

  it.each(['proxy.local', '10.0.0.0/33', '2001:db8::/129', '10.0.0.1/abc'])(
    'rejects invalid entry "%s"',
    (raw) => {
      expect(() => parseTrustProxy(raw)).toThrowError(/TRUST_PROXY/);
    },
  );
});

describe('metrics config', () => {
  it('defaults to an internal-only host and port 9464', () => {
    setEnv(REQUIRED_ENV);

    const config = loadConfig();

    expect(config.metrics.host).toBe('127.0.0.1');
    expect(config.metrics.port).toBe(9464);
  });

  it('throws when METRICS_PORT is out of range', () => {
    setEnv({ ...REQUIRED_ENV, METRICS_PORT: '70000' });

    expect(() => loadConfig()).toThrowError(/METRICS_PORT/);
  });
});

describe('rate-limit config', () => {
  it('defaults to not trusting proxies', () => {
    setEnv(REQUIRED_ENV);

    expect(loadConfig().http.trustProxy).toBe(false);
  });

  it('rejects a hash secret shorter than 16 characters', () => {
    setEnv({ ...REQUIRED_ENV, RATE_LIMIT_HASH_SECRET: 'short' });

    expect(() => loadConfig()).toThrowError(/RATE_LIMIT_HASH_SECRET/);
  });

  it('accepts a real hash secret in production', () => {
    setEnv({
      ...REQUIRED_ENV,
      NODE_ENV: 'production',
      CORS_ORIGINS: 'https://app.gridx.io',
      RATE_LIMIT_HASH_SECRET: 'a-real-production-secret-value',
    });

    expect(loadConfig().rateLimit.hashSecret).toBe('a-real-production-secret-value');
  });
});
