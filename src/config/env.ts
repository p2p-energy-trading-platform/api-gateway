import 'dotenv/config';
import { isIP } from 'node:net';
import envSchema from 'env-schema';
import { envSchema as schema } from './schema.js';
import type { AppConfig, NodeEnvironment, TrustProxy } from './types.js';

interface RawEnvironment {
  NODE_ENV: NodeEnvironment;
  SERVICE_NAME: string;
  SERVICE_VERSION: string;
  HOST: string;
  PORT: number;
  LOG_LEVEL: string;
  BODY_LIMIT_BYTES: number;
  REQUEST_TIMEOUT_MS: number;
  CORS_ORIGINS: string;
  REDIS_URL: string;
  REDIS_CONNECT_TIMEOUT_MS: number;
  TRUST_PROXY: string;
  RATE_LIMIT_HASH_SECRET: string;
  AUTH_SERVICE_GRPC_TARGET: string;
  METRICS_HOST: string;
  METRICS_PORT: number;
  AUTH_SERVICE_GRPC_URL: string;
  GRPC_DEFAULT_TIMEOUT_MS: number;
  GRPC_TLS_ENABLED: boolean;
  GRPC_TLS_CA_PATH?: string;
  GRPC_TLS_CERT_PATH?: string;
  GRPC_TLS_KEY_PATH?: string;
}

export function parseCorsOrigins(raw: string, nodeEnv: NodeEnvironment): string[] {
  const origins = raw
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);

  if (origins.length === 0) {
    throw new Error('CORS_ORIGINS must contain at least one origin.');
  }

  for (const origin of origins) {
    if (origin === '*') {
      throw new Error('CORS_ORIGINS must not contain a wildcard (*).');
    }

    let url: URL;

    try {
      url = new URL(origin);
    } catch {
      throw new Error(`CORS_ORIGINS contains an invalid origin: "${origin}".`);
    }

    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      throw new Error(`CORS_ORIGINS origin must use http or https: "${origin}".`);
    }

    if (url.origin !== origin) {
      throw new Error(
        `CORS_ORIGINS origin must not include a path or trailing slash: "${origin}" (use "${url.origin}").`,
      );
    }

    if (nodeEnv === 'production' && url.protocol !== 'https:') {
      throw new Error(`CORS_ORIGINS origin must use https in production: "${origin}".`);
    }
  }

  return origins;
}

export function parseTrustProxy(raw: string): TrustProxy {
  const value = raw.trim();

  if (value === '' || value === 'false' || value === '0') {
    return false;
  }

  if (value === 'true') {
    throw new Error(
      'TRUST_PROXY=true would let any client fake its IP. List the proxy IPs/CIDRs instead.',
    );
  }

  if (/^[0-9]+$/.test(value)) {
    throw new Error('TRUST_PROXY must list proxy IPs/CIDRs, not a hop count.');
  }

  const proxies = value
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);

  for (const proxy of proxies) {
    const [address = '', prefix] = proxy.split('/');
    const family = isIP(address);
    const maxPrefix = family === 6 ? 128 : 32;

    const validPrefix =
      prefix === undefined || (/^[0-9]+$/.test(prefix) && Number(prefix) <= maxPrefix);

    if (family === 0 || !validPrefix) {
      throw new Error(`TRUST_PROXY contains an invalid IP or CIDR: "${proxy}".`);
    }
  }

  return proxies;
}

export function loadConfig(): AppConfig {
  const env = envSchema<RawEnvironment>({
    schema,
    dotenv: false,
  });

  return Object.freeze({
    nodeEnv: env.NODE_ENV,

    service: {
      name: env.SERVICE_NAME,
      version: env.SERVICE_VERSION,
    },

    http: {
      host: env.HOST,
      port: env.PORT,
      bodyLimitBytes: env.BODY_LIMIT_BYTES,
      requestTimeoutMs: env.REQUEST_TIMEOUT_MS,
      trustProxy: parseTrustProxy(env.TRUST_PROXY),
    },

    logging: {
      level: env.LOG_LEVEL,
    },

    cors: {
      origins: parseCorsOrigins(env.CORS_ORIGINS, env.NODE_ENV),
    },

    redis: {
      url: env.REDIS_URL,
      connectTimeoutMs: env.REDIS_CONNECT_TIMEOUT_MS,
    },

    rateLimit: {
      hashSecret: env.RATE_LIMIT_HASH_SECRET,
    },

    services: {
      authGrpcTarget: env.AUTH_SERVICE_GRPC_TARGET,
    },
    
    metrics: {
      host: env.METRICS_HOST,
      port: env.METRICS_PORT,
    },

    grpc: {
      authServiceUrl: env.AUTH_SERVICE_GRPC_URL,
      defaultTimeoutMs: env.GRPC_DEFAULT_TIMEOUT_MS,
      tls: {
        enabled: env.GRPC_TLS_ENABLED,
        caPath: env.GRPC_TLS_CA_PATH,
        certPath: env.GRPC_TLS_CERT_PATH,
        keyPath: env.GRPC_TLS_KEY_PATH,
      },
    },

    auth: {
      issuer: '',
      audience: '',
      jwksUri: '',
      allowedAlgorithms: ['RS256', 'EDDSA'],
      clockToleranceSeconds: 5,
      jwksCacheTtlSeconds: 300,
      jwksRequestTimeoutMs: 2000,
    },
  });
}
