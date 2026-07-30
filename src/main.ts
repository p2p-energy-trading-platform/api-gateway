import 'dotenv/config'

import { buildApp } from './app'
import { env } from './config/env'

const HTTP_PORT = env.port


async function start() {
  const app = buildApp()
  // Graceful shutdown handler
  const shutdown = async () => {
    console.log('[Server] Shutting down...')
    await app.close()
    process.exit(0)
  }
  process.on('SIGINT', shutdown)
  process.on('SIGTERM', shutdown)

  try {
    await app.listen({
      port: HTTP_PORT,
      host: '0.0.0.0'
    })
    console.log(`[HTTP] Server listening on port ${HTTP_PORT}`)
  } catch (err) {
    app.log.error(err)
    process.exit(1)
  }
}

start()