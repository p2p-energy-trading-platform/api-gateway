export const SDK_CONFIG = {
  // Base URL
  gatewayBaseUrl: process.env.GATEWAY_BASE_URL || 'http://localhost:3000',

  // Downstream service gRPC addresses
  services: {
    matchingEngine: process.env.MATCHING_ENGINE_URL || 'localhost:50051',
    orderService: process.env.ORDER_SERVICE_URL || 'localhost:50052',
    authService: process.env.AUTH_SERVICE_URL || 'localhost:50053',
    notificationService: process.env.NOTIFICATION_SERVICE_URL || 'localhost:50054',
  },

  // gRPC connection options
  grpc: {
    keepaliveTimeMs: 10000,
    keepaliveTimeoutMs: 5000,
    keepalivePermitWithoutCalls: true,
  }
}
