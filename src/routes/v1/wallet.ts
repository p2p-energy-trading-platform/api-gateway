import { FastifyInstance } from 'fastify'

export async function walletRoutes(app: FastifyInstance) {


  // GET /api/v1/wallet
  app.get('/', async (request, reply) => {

    return reply.code(501).send({
      success: false,
      error: {
        code: 'NOT_IMPLEMENTED',
        message: 'Wallet balance service not implemented yet'
      }
    })

  })

  // GET /api/v1/wallet/transactions
  app.get('/transactions', async (request, reply) => {

    return reply.code(501).send({
      success: false,
      error: {
        code: 'NOT_IMPLEMENTED',
        message: 'Wallet transaction history service not implemented yet'
      }
    })

  })

  // POST /api/v1/wallet/deposit
  app.post('/deposit', async (request, reply) => {

    return reply.code(501).send({
      success: false,
      error: {
        code: 'NOT_IMPLEMENTED',
        message: 'Wallet deposit service not implemented yet'
      }
    })

  })

  // POST /api/v1/wallet/withdraw
  app.post('/withdraw', async (request, reply) => {

    return reply.code(501).send({
      success: false,
      error: {
        code: 'NOT_IMPLEMENTED',
        message: 'Wallet withdrawal service not implemented yet'
      }
    })

  })

}