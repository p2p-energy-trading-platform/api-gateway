import type { FastifyInstance } from 'fastify';
import { registerHandler } from './handler.js';
import { registerBodySchema } from './schemas.js';

export async function registerAuthRoutes(app: FastifyInstance): Promise<void> {
  app.post(
    '/api/v1/auth/register',
    {
      config: {
        rateLimit: 'auth-register',
      },
      schema: {
        body: registerBodySchema,
      },
    },
    registerHandler,
  );
}
