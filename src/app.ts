import Fastify from 'fastify'
import cors from '@fastify/cors'
import helmet from '@fastify/helmet'
import jwt from '@fastify/jwt'

export function buildApp() {
  const app = Fastify({ logger: true })

  // Plugins
  app.register(cors)
  app.register(helmet)
  app.register(jwt, {
    secret: process.env.JWT_SECRET || 'dev-secret'
  })

  // Health check
  app.get('/health', async () => {
    return { status: 'ok', service: 'gridx-api-gateway' }
  })

  return app
}
