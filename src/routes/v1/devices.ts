import { FastifyInstance } from 'fastify'

export async function deviceRoutes(app: FastifyInstance) {

  // GET /api/v1/devices
  app.get('/', async (request, reply) => {

    return reply.code(501).send({
      success: false,
      error: {
        code: 'NOT_IMPLEMENTED',
        message: 'Device listing service not implemented yet'
      }
    })

  })

  // GET /api/v1/devices/:deviceId
  app.get('/:deviceId', async (request, reply) => {

    return reply.code(501).send({
      success: false,
      error: {
        code: 'NOT_IMPLEMENTED',
        message: 'Device details service not implemented yet'
      }
    })

  })

  // POST /api/v1/devices/dispatch
  app.post('/dispatch', async (request, reply) => {

    return reply.code(501).send({
      success: false,
      error: {
        code: 'NOT_IMPLEMENTED',
        message: 'Device dispatch service not implemented yet'
      }
    })

  })

}