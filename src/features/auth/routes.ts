import type { FastifyInstance } from 'fastify';
import { loginHandler, logoutHandler, meHandler, registerHandler } from './handler.js';
import {
  loginBodySchema,
  loginResponseSchema,
  meResponseSchema,
  registerBodySchema,
  registerResponseSchema,
} from './schemas.js';

export async function registerAuthRoutes(app: FastifyInstance): Promise<void> {
  app.post(
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

  app.post(
    '/api/v1/auth/login',
    {
      config: { rateLimit: 'auth-login', auth: 'public' },
      schema: {
        body: loginBodySchema,
        response: { 200: loginResponseSchema },
      },
    },
    loginHandler,
  );

  app.post(
    '/api/v1/auth/logout',
    {
      config: { rateLimit: 'authenticated-write', auth: 'required' },
    },
    logoutHandler,
  );

  app.get(
    '/api/v1/auth/me',
    {
      config: { rateLimit: 'authenticated-read', auth: 'required' },
      schema: { response: { 200: meResponseSchema } },
    },
    meHandler,
  );
}
