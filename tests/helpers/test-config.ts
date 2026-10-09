import type { AppConfig } from '../../src/config/types.js';

export const testConfig: AppConfig = {
  nodeEnv: 'test',

  service: {
    name: 'api-gateway',
    version: 'test',
  },

  http: {
    host: '127.0.0.1',
    port: 3000,
    bodyLimitBytes: 1_048_576,
    requestTimeoutMs: 10_000,
    trustProxy: false,
  },

  logging: {
    level: 'silent',
  },

  cors: {
    origins: ['http://localhost:5173'],
  },

  cookies: {
    secure: true,
    sameSite: 'lax',
    refreshMaxAgeSeconds: 2_592_000,
  },

  redis: {
    url: 'redis://localhost:6379',
    connectTimeoutMs: 2_000,
  },

  rateLimit: {
    hashSecret: 'test-rate-limit-secret',
  },

  metrics: {
    host: '127.0.0.1',
    port: 9464,
  },

  grpc: {
    authServiceUrl: 'http://auth-service:50051',
    defaultTimeoutMs: 5000,
    tls: {
      enabled: false,
    },
  },

  auth: {
    issuer: 'gridx-auth-service',
    audience: 'gridx-api-gateway',
    jwksUri: 'http://localhost:8080/.well-known/jwks.json',
    allowedAlgorithms: ['RS256'],
    clockToleranceSeconds: 5,
    jwksCacheTtlSeconds: 300,
    jwksRequestTimeoutMs: 2_000,
  },
};
