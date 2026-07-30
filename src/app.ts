import Fastify, { FastifyInstance } from 'fastify'
import cors from '@fastify/cors'
import helmet from '@fastify/helmet'
import jwt from '@fastify/jwt'
import rateLimit from '@fastify/rate-limit'
import { env } from './config/env'

import { authRoutes } from './routes/v1/auth'
import { orderRoutes } from './routes/v1/orders'
import { tradeRoutes } from './routes/v1/trades'
import { walletRoutes } from './routes/v1/wallet'
import { marketRoutes } from './routes/v1/market'
import { deviceRoutes } from './routes/v1/devices'
import { notificationRoutes } from './routes/v1/notifications'
import { profileRoutes } from './routes/v1/profile'

export function buildApp(): FastifyInstance {

  const app = Fastify({
    logger: {
      level: env.logLevel
    }
  })


  /*Security middleware*/
  app.register(cors, {
    origin: true
  })
  app.register(helmet)


  /*Global rate limiting*/

  app.register(rateLimit, {
    global: true,
    max: env.rateLimit.max,
    timeWindow: env.rateLimit.window,
    errorResponseBuilder: () => ({
      success: false,
      error: {
        code: 'RATE_LIMIT_EXCEEDED',
        message: 'Too many requests. Please try again later.'
      }
    })
  })

  /*JWT Authentication */
  app.register(jwt, {
    secret: env.jwtSecret
  })


  /*Global error handler*/
app.setErrorHandler(
  (error, request, reply) => {
    request.log.error(error)
    const statusCode =
      typeof error === 'object' &&
      error !== null &&
      'statusCode' in error
        ? Number(error.statusCode)
        : 500

    const errorCode =
      typeof error === 'object' &&
      error !== null &&
      'code' in error
        ? String(error.code)
        : 'INTERNAL_SERVER_ERROR'

    const message =
      error instanceof Error
        ? error.message
        : 'Something went wrong'

    reply.status(statusCode).send({
      success: false,
      error: {
        code: errorCode,
        message
      }
    })
  }
)

  /*404 handler*/
  app.setNotFoundHandler(
    (request, reply) => {
      reply.status(404)
        .send({
          success: false,
          error: {
            code: 'NOT_FOUND',
            message: 'Route not found'
          }
        })
    }
  )
  /* Health check */
  app.get(
    '/health',
    {
      config: {
        rateLimit: false
      }
    },
    async () => {

      return {
        success: true,
        data: {
          status: 'ok',
          service: 'gridx-api-gateway',
          environment: env.nodeEnv
        }
      }
    })

  /*Authentication routes*/
  app.register(authRoutes, {

    prefix: '/api/v1/auth',

    config: {

      rateLimit: {

        max: env.rateLimit.authMax,

        timeWindow: env.rateLimit.window

      }
    }
  })

  /*Business routes*/

  app.register(orderRoutes, {
    prefix: '/api/v1/orders'
  })

  app.register(tradeRoutes, {
    prefix: '/api/v1/trades'
  })

  app.register(walletRoutes, {
    prefix: '/api/v1/wallet'
  })

  app.register(marketRoutes, {
    prefix: '/api/v1/market'
  })

  app.register(deviceRoutes, {
    prefix: '/api/v1/devices'
  })

  app.register(notificationRoutes, {
    prefix: '/api/v1/notifications'
  })

 app.register(profileRoutes, {
  prefix: '/api/v1/users'
})

if (env.nodeEnv === 'development') {
  app.ready(() => {
    console.log(app.printRoutes())
  })
}

return app

}