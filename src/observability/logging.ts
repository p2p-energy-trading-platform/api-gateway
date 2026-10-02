import type { FastifyServerOptions, RawServerDefault } from 'fastify';
import { type AppConfig } from '../config/types.js';
import { REDACTED, redactPaths } from './redaction.js';

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
      paths: redactPaths,
      censor: REDACTED,
    },
  };
}
