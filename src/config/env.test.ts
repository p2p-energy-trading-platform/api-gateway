import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { loadConfig } from './env.js';

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
});