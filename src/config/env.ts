import 'dotenv/config'
import envSchema from 'env-schema'

import { envSchema as schema } from './schema.js'
import type { AppConfig } from './types.js'

interface RawEnvironment {
    NODE_ENV: 'development' | 'test' | 'production'
    SERVICE_NAME: string
    SERVICE_VERSION: string
    HOST: string
    PORT: number
    LOG_LEVEL: string
    BODY_LIMIT_BYTES: number
    REQUEST_TIMEOUT_MS: number
    CORS_ORIGINS: string
    REDIS_URL: string
    REDIS_CONNECT_TIMEOUT_MS: number
}

export function loadConfig(): AppConfig {
    const env = envSchema<RawEnvironment>({
        schema,
        dotenv: false,
    })

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
            origins: env.CORS_ORIGINS
                .split(',')
                .map((origin) => origin.trim())
                .filter(Boolean),
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
    })
}