import { FastifyInstance } from 'fastify'

export async function authRoutes(app: FastifyInstance) {
  // POST /api/v1/auth/register
  app.post('/register', async (request, reply) => {
    return reply.code(501).send({ message: 'Not implemented yet' })
  })

  // POST /api/v1/auth/login
  app.post('/login', async (request, reply) => {
    return reply.code(501).send({ message: 'Not implemented yet' })
  })

  // POST /api/v1/auth/refresh
  app.post('/refresh', async (request, reply) => {
    return reply.code(501).send({ message: 'Not implemented yet' })
  })

  // POST /api/v1/auth/logout
  app.post('/logout', async (request, reply) => {
    return reply.code(501).send({ message: 'Not implemented yet' })
  })
}
