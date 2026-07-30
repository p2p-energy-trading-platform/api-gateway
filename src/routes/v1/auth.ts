import { FastifyInstance } from 'fastify'

export async function authRoutes(app: FastifyInstance) {

  app.get('/', async () => {
    return {
      success: true,
      data: {
        service: 'auth-service',
        status: 'available',
        endpoints: [
          '/register',
          '/login',
          '/refresh',
          '/logout'
        ]
      }
    }
  })

  // POST /api/v1/auth/register
  app.post('/register', async (request, reply) => {

    return reply.code(501).send({
      success: false,
      error: {
        code: 'NOT_IMPLEMENTED',
        message: 'User registration service not implemented yet'
      }
    })

  })

  // POST /api/v1/auth/login
  app.post('/login', async (request, reply) => {

    return reply.code(501).send({
      success: false,
      error: {
        code: 'NOT_IMPLEMENTED',
        message: 'Login service not implemented yet'
      }
    })

  })

  // POST /api/v1/auth/refresh
  app.post('/refresh', async (request, reply) => {

    return reply.code(501).send({
      success: false,
      error: {
        code: 'NOT_IMPLEMENTED',
        message: 'Token refresh service not implemented yet'
      }
    })

  })

  // POST /api/v1/auth/logout
  app.post('/logout', async (request, reply) => {

    return reply.code(501).send({
      success: false,
      error: {
        code: 'NOT_IMPLEMENTED',
        message: 'Logout service not implemented yet'
      }
    })

  })

}