import { FastifyInstance } from 'fastify'

export async function profileRoutes(app: FastifyInstance) {

  // GET /api/v1/users/me
  app.get('/me', async (request, reply) => {

    return reply.code(501).send({
      success: false,
      error: {
        code: 'NOT_IMPLEMENTED',
        message: 'User profile service not implemented yet'
      }
    })

  })

  // PATCH /api/v1/users/me
  app.patch('/me', async (request, reply) => {

    return reply.code(501).send({
      success: false,
      error: {
        code: 'NOT_IMPLEMENTED',
        message: 'Profile update service not implemented yet'
      }
    })

  })

  // PATCH /api/v1/users/me/password
  app.patch('/me/password', async (request, reply) => {

    return reply.code(501).send({
      success: false,
      error: {
        code: 'NOT_IMPLEMENTED',
        message: 'Password update service not implemented yet'
      }
    })

  })

  // GET /api/v1/users/me/preferences
  app.get('/me/preferences', async (request, reply) => {

    return reply.code(501).send({
      success: false,
      error: {
        code: 'NOT_IMPLEMENTED',
        message: 'User preferences service not implemented yet'
      }
    })

  })

  // PATCH /api/v1/users/me/preferences
  app.patch('/me/preferences', async (request, reply) => {

    return reply.code(501).send({
      success: false,
      error: {
        code: 'NOT_IMPLEMENTED',
        message: 'User preference update service not implemented yet'
      }
    })

  })

}