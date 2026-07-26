import * as grpc from '@grpc/grpc-js'
import { SDK_CONFIG } from '../config/sdk'

// GridX API Gateway - gRPC Server
// This server exposes internal gRPC endpoints that other microservices can call directly.
// NOTE: Proto file definitions will be wired in once the protobuf repo has the finalized .proto files under proto/gridx/

const GRPC_PORT = process.env.GRPC_PORT || '50050'

export function createGrpcServer(): grpc.Server {
  const server = new grpc.Server({
    'grpc.keepalive_time_ms': SDK_CONFIG.grpc.keepaliveTimeMs,
    'grpc.keepalive_timeout_ms': SDK_CONFIG.grpc.keepaliveTimeoutMs,
    'grpc.keepalive_permit_without_calls': SDK_CONFIG.grpc.keepalivePermitWithoutCalls ? 1 : 0,
  })

  // Services will be registered here once proto files are available
  // Example:
  // server.addService(
  //   proto.gridx.gateway.v1.GatewayService.service,
  //   gatewayServiceImpl
  // )

  return server
}

export async function startGrpcServer(): Promise<grpc.Server> {
  const server = createGrpcServer()

  return new Promise((resolve, reject) => {
    server.bindAsync(
      `0.0.0.0:${GRPC_PORT}`,
      grpc.ServerCredentials.createInsecure(),
      (error, port) => {
        if (error) {
          reject(error)
          return
        }
        console.log(`[gRPC] Server listening on port ${port}`)
        resolve(server)
      }
    )
  })
}

export async function stopGrpcServer(server: grpc.Server): Promise<void> {
  return new Promise((resolve, reject) => {
    server.tryShutdown((error) => {
      if (error) {
        reject(error)
        return
      }
      console.log('[gRPC] Server stopped gracefully')
      resolve()
    })
  })
}
