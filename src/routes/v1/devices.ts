import { FastifyInstance } from 'fastify'

export async function deviceRoutes(app: FastifyInstance) {
  // GET /api/v1/devices
  app.get('/', async (request, reply) => {
    return reply.code(501).send({ message: 'Not implemented yet' })
  })

  // GET /api/v1/devices/:deviceId
  app.get('/:deviceId', async (request, reply) => {
    return reply.code(501).send({ message: 'Not implemented yet' })
  })

  // POST /api/v1/devices/dispatch
  app.post('/dispatch', async (request, reply) => {
    return reply.code(501).send({ message: 'Not implemented yet' })
  })
}
