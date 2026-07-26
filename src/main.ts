import { buildApp } from './app'
import { startGrpcServer, stopGrpcServer } from './plugins/grpc-server'
import * as grpc from '@grpc/grpc-js'

const HTTP_PORT = Number(process.env.PORT) || 3000

async function start() {
  const app = buildApp()
  let grpcServer: grpc.Server | null = null

  // Graceful shutdown handler
  const shutdown = async () => {
    console.log('[Server] Shutting down...')
    await app.close()
    if (grpcServer) {
      await stopGrpcServer(grpcServer)
    }
    process.exit(0)
  }

  process.on('SIGINT', shutdown)
  process.on('SIGTERM', shutdown)

  try {
    // Start gRPC server
    grpcServer = await startGrpcServer()

    // Start HTTP server
    await app.listen({ port: HTTP_PORT, host: '0.0.0.0' })
    console.log(`[HTTP] Server listening on port ${HTTP_PORT}`)
  } catch (err) {
    app.log.error(err)
    process.exit(1)
  }
}

start()
