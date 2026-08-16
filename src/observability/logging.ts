import type { FastifyServerOptions, RawServerDefault } from 'fastify';
import { type AppConfig } from '../config/types.js';

type LoggerOptions = NonNullable<FastifyServerOptions<RawServerDefault>['logger']>;

export function createLoggerOptions(config: AppConfig): LoggerOptions {
  return {
    level: config.logging.level,

    base: {
      service: config.service.name,
      version: config.service.version,
      environment: config.nodeEnv,
    },

    redact: {
      paths: [
        'req.headers.authorization',
        'req.headers.cookie',
        'res.headers["set-cookie"]',
        '*.password',
        '*.accessToken',
        '*.refreshToken',
        '*.token',
      ],
      censor: '[REDACTED]',
    },
  };
}
