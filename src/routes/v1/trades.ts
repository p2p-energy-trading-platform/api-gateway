import { FastifyInstance } from 'fastify'

export async function tradeRoutes(app: FastifyInstance) {

  // GET /api/v1/trades
  app.get('/', async (request, reply) => {

    return reply.code(501).send({
      success: false,
      error: {
        code: 'NOT_IMPLEMENTED',
        message: 'Trade history service not implemented yet'
      }
    })

  })

  // GET /api/v1/trades/:tradeId
  app.get('/:tradeId', async (request, reply) => {

    return reply.code(501).send({
      success: false,
      error: {
        code: 'NOT_IMPLEMENTED',
        message: 'Trade details service not implemented yet'
      }
    })

  })

}