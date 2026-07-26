import * as grpc from '@grpc/grpc-js'
import * as protoLoader from '@grpc/proto-loader'
import path from 'path'
import { SDK_CONFIG } from '../config/sdk'


const PROTO_OPTIONS: protoLoader.Options = {
  keepCase: true,
  longs: String,
  enums: String,
  defaults: true,
  oneofs: true,
}

// Helper to create a gRPC channel with standard options
export function createGrpcChannel(serviceUrl: string): grpc.Channel {
  return new grpc.Channel(
    serviceUrl,
    grpc.credentials.createInsecure(),
    {
      'grpc.keepalive_time_ms': SDK_CONFIG.grpc.keepaliveTimeMs,
      'grpc.keepalive_timeout_ms': SDK_CONFIG.grpc.keepaliveTimeoutMs,
      'grpc.keepalive_permit_without_calls': SDK_CONFIG.grpc.keepalivePermitWithoutCalls ? 1 : 0,
    }
  )
}

// Matching Engine client
// NOTE: Proto file path will be updated once proto files are added to the protobuf repository under proto/gridx/matching/v1/
export function createMatchingEngineClient() {
  const serviceUrl = SDK_CONFIG.services.matchingEngine

  // Placeholder - will be replaced with actual proto once available
  // const packageDef = protoLoader.loadSync(
  //   path.resolve(__dirname, '../../proto/gridx/matching/v1/order.proto'),
  //   PROTO_OPTIONS
  // )
  // const proto = grpc.loadPackageDefinition(packageDef) as any
  // return new proto.gridx.matching.v1.RecoveryService(
  //   serviceUrl,
  //   grpc.credentials.createInsecure()
  // )

  console.log(`[gRPC] Matching Engine client configured at ${serviceUrl}`)
  return null // placeholder until proto files are ready
}

export const grpcClients = {
  matchingEngine: createMatchingEngineClient()
}
