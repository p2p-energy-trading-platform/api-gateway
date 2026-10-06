import type { FastifyReply, FastifyRequest } from 'fastify';
import { grpcDeadlinesMs } from '../../transport/grpc/deadlines.js';
import type { RegisterBody, RegisterResponse } from './schemas.js';
import { mapRegisterResponse } from './mapper.js';

export async function registerHandler(
  request: FastifyRequest<{ Body: RegisterBody }>,
  reply: FastifyReply,
): Promise<RegisterResponse> {
  const result = await request.server.grpcClients.auth.register(
    {
      email: request.body.email,
      password: request.body.password,
    },
    grpcDeadlinesMs.authRegister,
  );

  reply.code(201);

  return mapRegisterResponse(result);
}
