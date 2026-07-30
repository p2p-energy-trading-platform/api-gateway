import { FastifyInstance } from 'fastify'

export async function marketRoutes(app: FastifyInstance) {

  // GET /api/v1/market
  app.get('/', async () => {
    return {
      "success": true,
      data: {
      service: 'market-service',
      status: 'available',
      endpoints: [
        '/orderbook',
        '/prices',
        '/candles'
      ]
    }
    }
  })

  // GET /api/v1/market/orderbook
  app.get('/orderbook', async (request, reply) => {

    return reply.code(501).send({
      message: 'Order book not implemented yet'
    })

  })

  // GET /api/v1/market/prices
  app.get('/prices', async (request, reply) => {

    return reply.code(501).send({
      message: 'Price feed not implemented yet'
    })

  })

  // GET /api/v1/market/candles
  app.get('/candles', async (request, reply) => {

    return reply.code(501).send({
      message: 'Candle data not implemented yet'
    })

  })

}