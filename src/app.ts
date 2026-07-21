import Fastify from 'fastify'
import cors from '@fastify/cors'
import helmet from '@fastify/helmet'
import jwt from '@fastify/jwt'

import { authRoutes } from './routes/v1/auth'
import { orderRoutes } from './routes/v1/orders'
import { tradeRoutes } from './routes/v1/trades'
import { walletRoutes } from './routes/v1/wallet'
import { marketRoutes } from './routes/v1/market'
import { deviceRoutes } from './routes/v1/devices'
import { notificationRoutes } from './routes/v1/notifications'
import { profileRoutes } from './routes/v1/profile'

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

  // Routes
  app.register(authRoutes, { prefix: '/api/v1/auth' })
  app.register(orderRoutes, { prefix: '/api/v1/orders' })
  app.register(tradeRoutes, { prefix: '/api/v1/trades' })
  app.register(walletRoutes, { prefix: '/api/v1/wallet' })
  app.register(marketRoutes, { prefix: '/api/v1/market' })
  app.register(deviceRoutes, { prefix: '/api/v1/devices' })
  app.register(notificationRoutes, { prefix: '/api/v1/notifications' })
  app.register(profileRoutes, { prefix: '/api/v1/users' })

  return app
}
