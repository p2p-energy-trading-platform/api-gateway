import type { TypeBoxTypeProvider } from '@fastify/type-provider-typebox';
import type { FastifyInstance } from 'fastify';

import { getWalletHandler } from './handler.js';
import { emptyQuerySchema, walletResponseSchema } from './schemas.js';

export async function registerWalletRoutes(app: FastifyInstance): Promise<void> {
  const router = app.withTypeProvider<TypeBoxTypeProvider>();

  router.get(
    '/api/v1/wallet',
    {
      config: { rateLimit: 'authenticated-read', auth: 'required' },
      schema: {
        querystring: emptyQuerySchema,
        response: { 200: walletResponseSchema },
      },
    },
    getWalletHandler,
  );
}
