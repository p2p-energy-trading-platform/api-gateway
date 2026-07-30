export const env = {

  port: Number(process.env.PORT ?? 3000),
  nodeEnv:
    process.env.NODE_ENV ?? 'development',
  jwtSecret:
    process.env.JWT_SECRET ?? 'dev-secret',
  logLevel:
    process.env.LOG_LEVEL ?? 'info',

  rateLimit: {
    max:
      Number(process.env.RATE_LIMIT_MAX ?? 100),
    window:
      process.env.RATE_LIMIT_WINDOW ?? '1 minute',
    authMax:
      Number(process.env.RATE_LIMIT_AUTH_MAX ?? 10)
  },

  gatewayUrl:
    process.env.GATEWAY_BASE_URL ??
    'http://localhost:3000',

  grpc: {
    port:
      Number(process.env.GRPC_PORT ?? 50050)
  },

  services: {
    matchingEngine:
      process.env.MATCHING_ENGINE_URL ??
      'localhost:50051',
    order:
      process.env.ORDER_SERVICE_URL ??
      'localhost:50052',
    auth:
      process.env.AUTH_SERVICE_URL ??
      'localhost:50053',
    notification:
      process.env.NOTIFICATION_SERVICE_URL ??
      'localhost:50054'
  }
}