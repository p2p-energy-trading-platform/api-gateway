import type { TypeBoxTypeProvider } from '@fastify/type-provider-typebox';
import type { FastifyInstance } from 'fastify';

import { registerHandler } from './handler.js';
import { registerBodySchema, registerResponseSchema } from './schemas.js';

export async function registerAuthRoutes(app: FastifyInstance): Promise<void> {
  const router = app.withTypeProvider<TypeBoxTypeProvider>();

  router.post(
    '/api/v1/auth/register',
    {
      config: {
        rateLimit: 'auth-register',
        auth: 'public',
      },
      schema: {
        body: registerBodySchema,
        response: {
          201: registerResponseSchema,
        },
      },
    },
    registerHandler,
  );
}
