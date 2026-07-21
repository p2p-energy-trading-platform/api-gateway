import { FastifyInstance } from 'fastify'

export async function profileRoutes(app: FastifyInstance) {
  // GET /api/v1/users/me
  app.get('/me', async (request, reply) => {
    return reply.code(501).send({ message: 'Not implemented yet' })
  })

  // PATCH /api/v1/users/me
  app.patch('/me', async (request, reply) => {
    return reply.code(501).send({ message: 'Not implemented yet' })
  })

  // PATCH /api/v1/users/me/password
  app.patch('/me/password', async (request, reply) => {
    return reply.code(501).send({ message: 'Not implemented yet' })
  })

  // GET /api/v1/users/me/preferences
  app.get('/me/preferences', async (request, reply) => {
    return reply.code(501).send({ message: 'Not implemented yet' })
  })

  // PATCH /api/v1/users/me/preferences
  app.patch('/me/preferences', async (request, reply) => {
    return reply.code(501).send({ message: 'Not implemented yet' })
  })
}
