import Fastify from 'fastify'
import cors from '@fastify/cors'
import helmet from '@fastify/helmet'
import jwt from '@fastify/jwt'
import rateLimit from '@fastify/rate-limit'

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

  // Security
  app.register(cors)
  app.register(helmet)

  // Rate limiting - global default
  app.register(rateLimit, {
    global: true,
    max: 100,
    timeWindow: '1 minute',
    errorResponseBuilder: () => ({
      error: {
        code: 'RATE_LIMIT_EXCEEDED',
        message: 'Too many requests. Please try again later.',
      }
    })
  })

  // JWT
  app.register(jwt, {
    secret: process.env.JWT_SECRET || 'dev-secret'
  })

  // Health check - excluded from rate limiting
  app.get('/health', {
    config: { rateLimit: false }
  }, async () => {
    return { status: 'ok', service: 'gridx-api-gateway' }
  })

  // Auth routes - stricter rate limit
  app.register(authRoutes, {
    prefix: '/api/v1/auth',
    config: {
      rateLimit: {
        max: 10,
        timeWindow: '1 minute'
      }
    }
  })

  // All other routes - global rate limit applies
  app.register(orderRoutes, { prefix: '/api/v1/orders' })
  app.register(tradeRoutes, { prefix: '/api/v1/trades' })
  app.register(walletRoutes, { prefix: '/api/v1/wallet' })
  app.register(marketRoutes, { prefix: '/api/v1/market' })
  app.register(deviceRoutes, { prefix: '/api/v1/devices' })
  app.register(notificationRoutes, { prefix: '/api/v1/notifications' })
  app.register(profileRoutes, { prefix: '/api/v1/users' })

  return app
}
