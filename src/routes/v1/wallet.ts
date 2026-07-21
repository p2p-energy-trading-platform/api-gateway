import { FastifyInstance } from 'fastify'

export async function walletRoutes(app: FastifyInstance) {
  // GET /api/v1/wallet
  app.get('/', async (request, reply) => {
    return reply.code(501).send({ message: 'Not implemented yet' })
  })

  // GET /api/v1/wallet/transactions
  app.get('/transactions', async (request, reply) => {
    return reply.code(501).send({ message: 'Not implemented yet' })
  })

  // POST /api/v1/wallet/deposit
  app.post('/deposit', async (request, reply) => {
    return reply.code(501).send({ message: 'Not implemented yet' })
  })

  // POST /api/v1/wallet/withdraw
  app.post('/withdraw', async (request, reply) => {
    return reply.code(501).send({ message: 'Not implemented yet' })
  })
}
