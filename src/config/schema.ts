export const envSchema = {
  type: 'object',

  required: ['NODE_ENV', 'SERVICE_NAME', 'PORT', 'REDIS_URL'],

  properties: {
    NODE_ENV: {
      type: 'string',
      enum: ['development', 'test', 'production'],
    },

    SERVICE_NAME: {
      type: 'string',
      minLength: 1,
      default: 'api-gateway',
    },

    SERVICE_VERSION: {
      type: 'string',
      default: 'development',
    },

    HOST: {
      type: 'string',
      minLength: 1,
      default: '0.0.0.0',
    },

    PORT: {
      type: 'integer',
      minimum: 1,
      maximum: 65535,
      default: 3000,
    },

    LOG_LEVEL: {
      type: 'string',
      enum: ['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'],
      default: 'info',
    },

    BODY_LIMIT_BYTES: {
      type: 'integer',
      minimum: 1024,
      default: 1048576,
    },

    REQUEST_TIMEOUT_MS: {
      type: 'integer',
      minimum: 100,
      default: 10000,
    },

    CORS_ORIGINS: {
      type: 'string',
      default: 'http://localhost:5173',
    },

    REDIS_URL: {
      type: 'string',
      pattern: '^rediss?://.+',
    },

    REDIS_CONNECT_TIMEOUT_MS: {
      type: 'integer',
      minimum: 100,
      default: 2000,
    },

    TRUST_PROXY: {
      type: 'string',
      default: 'false',
    },

    RATE_LIMIT_HASH_SECRET: {
      type: 'string',
      minLength: 16,
    },

    AUTH_SERVICE_GRPC_URL: {
      type: 'string',
      minLength: 1,
      default: 'http://auth-service:50051',
    },

    GRPC_DEFAULT_TIMEOUT_MS: {
      type: 'integer',
      minimum: 100,
      default: 5000,
    },

    GRPC_TLS_ENABLED: {
      type: 'boolean',
      default: false,
    },

    GRPC_TLS_CA_PATH: {
      type: 'string',
    },

    GRPC_TLS_CERT_PATH: {
      type: 'string',
    },

    GRPC_TLS_KEY_PATH: {
      type: 'string',
    },
  },
} as const;
