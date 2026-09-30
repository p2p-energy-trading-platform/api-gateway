import 'dotenv/config';
import envSchema from 'env-schema';

import { envSchema as schema } from './schema.js';
import type { AppConfig, NodeEnvironment } from './types.js';

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

    auth: {
      issuer: '',
      audience: '',
      jwksUri: '',
      allowedAlgorithms: ['RS256'],
      clockToleranceSeconds: 5,
      jwksCacheTtlSeconds: 300,
      jwksRequestTimeoutMs: 2000,
    },
  });
}
