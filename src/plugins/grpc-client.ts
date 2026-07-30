import * as grpc from '@grpc/grpc-js'
import { SDK_CONFIG } from '../config/sdk'


export function createGrpcChannel(
  serviceUrl: string
): grpc.Channel {

  return new grpc.Channel(
    serviceUrl,
    grpc.credentials.createInsecure(),
    {
      'grpc.keepalive_time_ms':
        SDK_CONFIG.grpc.keepaliveTimeMs,

      'grpc.keepalive_timeout_ms':
        SDK_CONFIG.grpc.keepaliveTimeoutMs,

      'grpc.keepalive_permit_without_calls':
        SDK_CONFIG.grpc.keepalivePermitWithoutCalls
          ? 1
          : 0
    }
  )
}

/*
 Future gRPC clients will be initialized here
 once protobuf service definitions exist.
*/
export const grpcClients = {

  auth: {
    service:
      'auth-service',
    url:
      SDK_CONFIG.services.authService,
    client:
      null
  },

  order: {
    service:
      'order-service',
    url:
      SDK_CONFIG.services.orderService,
    client:
      null
  },

  trade: {
    service:
      'trade-service',
    url:
      SDK_CONFIG.services.tradeService,
    client:
      null
  },

  matchingEngine: {
    service:
      'matching-engine',
    url:
      SDK_CONFIG.services.matchingEngine,
    client:
      null
  },

  wallet: {
    service:
      'wallet-service',
    url:
      SDK_CONFIG.services.walletService,
    client:
      null
  },


  device: {
    service:
      'device-service',
    url:
      SDK_CONFIG.services.deviceService,
    client:
      null
  },


  notification: {
    service:
      'notification-service',
    url:
      SDK_CONFIG.services.notificationService,
    client:
      null
  }
}