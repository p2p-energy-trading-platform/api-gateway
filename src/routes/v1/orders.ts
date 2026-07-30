import { FastifyInstance } from 'fastify'

export async function orderRoutes(app: FastifyInstance) {

  // GET /api/v1/orders
  app.get('/', async (request, reply) => {

    return reply.code(501).send({
      success: false,
      error: {
        code: 'NOT_IMPLEMENTED',
        message: 'Order listing not implemented yet'
      }
    })

  })

  // POST /api/v1/orders
  app.post('/', async (request, reply) => {

    return reply.code(501).send({
      success: false,
      error: {
        code: 'NOT_IMPLEMENTED',
        message: 'Order creation not implemented yet'
      }
    })

  })

  // GET /api/v1/orders/:orderId
  app.get('/:orderId', async (request, reply) => {

    return reply.code(501).send({
      success: false,
      error: {
        code: 'NOT_IMPLEMENTED',
        message: 'Order retrieval not implemented yet'
      }
    })

  })

  // DELETE /api/v1/orders/:orderId
  app.delete('/:orderId', async (request, reply) => {

    return reply.code(501).send({
      success: false,
      error: {
        code: 'NOT_IMPLEMENTED',
        message: 'Order cancellation not implemented yet'
      }
    })

  })

}