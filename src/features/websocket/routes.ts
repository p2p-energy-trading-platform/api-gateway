import type { FastifyInstance } from 'fastify';
import { Type } from 'typebox';

import { strictObject } from '../../common/validation.js';
import { AppError } from '../../errors/app-error.js';
import { createWsTicket } from '../../transport/redis/ws-tickets.js';

const ticketResponseSchema = strictObject({
  ticket: Type.String(),
  // Seconds until the ticket expires.
  expiresIn: Type.Integer(),
});

/*
 * POST /api/v1/ws/ticket
 *
 * Browsers cannot send an Authorization header when opening a WebSocket, and access tokens must
 * not go in URLs. So the app first calls this protected route with its normal token and gets a
 * short-lived, single-use ticket, then connects to /api/v1/ws?ticket=...
 */
export async function registerWebsocketRoutes(app: FastifyInstance): Promise<void> {
  app.post(
    '/api/v1/ws/ticket',
    {
      // auth: 'required' is the default.
      config: { rateLimit: 'websocket-connect' },
      schema: { response: { 201: ticketResponseSchema } },
    },
    async (request, reply) => {
      const { principal } = request;

      if (principal === null) {
        throw new AppError('UNAUTHENTICATED', 'Invalid or missing access token.');
      }

      const { ticketTtlSeconds } = app.realtime.limits;
      let ticket: string;

      try {
        ticket = await createWsTicket(
          app.redis,
          app.config.nodeEnv,
          { userId: principal.userId, role: principal.role },
          ticketTtlSeconds,
        );
      } catch (error) {
        request.log.error({ err: error }, 'Could not store WebSocket ticket');

        throw new AppError('UPSTREAM_UNAVAILABLE');
      }

      return reply.code(201).send({ ticket, expiresIn: ticketTtlSeconds });
    },
  );
}
