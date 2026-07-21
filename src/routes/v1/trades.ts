import { FastifyInstance } from 'fastify'

export async function tradeRoutes(app: FastifyInstance) {
  // GET /api/v1/trades
  app.get('/', async (request, reply) => {
    return reply.code(501).send({ message: 'Not implemented yet' })
  })

  // GET /api/v1/trades/:tradeId
  app.get('/:tradeId', async (request, reply) => {
    return reply.code(501).send({ message: 'Not implemented yet' })
  })
}
