import { FastifyInstance } from 'fastify'

export async function marketRoutes(app: FastifyInstance) {
  // GET /api/v1/market/orderbook
  app.get('/orderbook', async (request, reply) => {
    return reply.code(501).send({ message: 'Not implemented yet' })
  })

  // GET /api/v1/market/prices
  app.get('/prices', async (request, reply) => {
    return reply.code(501).send({ message: 'Not implemented yet' })
  })

  // GET /api/v1/market/candles
  app.get('/candles', async (request, reply) => {
    return reply.code(501).send({ message: 'Not implemented yet' })
  })
}
