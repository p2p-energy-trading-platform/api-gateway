import { FastifyInstance } from 'fastify'

export async function notificationRoutes(app: FastifyInstance) {

  // GET /api/v1/notifications
  app.get('/', async (request, reply) => {

    return reply.code(501).send({
      success: false,
      error: {
        code: 'NOT_IMPLEMENTED',
        message: 'Notification listing service not implemented yet'
      }
    })

  })

  // PATCH /api/v1/notifications/read-all
  app.patch('/read-all', async (request, reply) => {

    return reply.code(501).send({
      success: false,
      error: {
        code: 'NOT_IMPLEMENTED',
        message: 'Mark all notifications as read service not implemented yet'
      }
    })

  })

  // PATCH /api/v1/notifications/:notificationId/read
  app.patch('/:notificationId/read', async (request, reply) => {

    return reply.code(501).send({
      success: false,
      error: {
        code: 'NOT_IMPLEMENTED',
        message: 'Mark notification as read service not implemented yet'
      }
    })

  })

  // GET /api/v1/notifications/preferences
  app.get('/preferences', async (request, reply) => {

    return reply.code(501).send({
      success: false,
      error: {
        code: 'NOT_IMPLEMENTED',
        message: 'Notification preferences service not implemented yet'
      }
    })

  })

  // PATCH /api/v1/notifications/preferences
  app.patch('/preferences', async (request, reply) => {

    return reply.code(501).send({
      success: false,
      error: {
        code: 'NOT_IMPLEMENTED',
        message: 'Notification preference update service not implemented yet'
      }
    })

  })

}