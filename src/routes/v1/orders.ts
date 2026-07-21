import { FastifyInstance } from 'fastify'

export async function orderRoutes(app: FastifyInstance) {
  // POST /api/v1/orders
  app.post('/', async (request, reply) => {
    return reply.code(501).send({ message: 'Not implemented yet' })
  })

  // GET /api/v1/orders
  app.get('/', async (request, reply) => {
    return reply.code(501).send({ message: 'Not implemented yet' })
  })

  // GET /api/v1/orders/:orderId
  app.get('/:orderId', async (request, reply) => {
    return reply.code(501).send({ message: 'Not implemented yet' })
  })

  // DELETE /api/v1/orders/:orderId
  app.delete('/:orderId', async (request, reply) => {
    return reply.code(501).send({ message: 'Not implemented yet' })
  })
}
