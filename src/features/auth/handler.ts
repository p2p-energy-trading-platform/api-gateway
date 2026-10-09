import type { FastifyReply, FastifyRequest } from 'fastify';
import { grpcDeadlinesMs } from '../../transport/grpc/deadlines.js';
import type { RegisterBody, RegisterResponse } from './schemas.js';
import { mapRegisterResponse } from './mapper.js';
import { mapLoginResponse, mapMeResponse } from './mapper.js';
import type { LoginBody, LoginResponse, MeResponse } from './schemas.js';
import { AppError } from '../../errors/app-error.js';
import { clearAccessCookie, setAccessCookie } from './cookies.js';
import { deleteAccessToken, storeAccessToken } from './session-store.js';

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

export async function loginHandler(
  request: FastifyRequest<{ Body: LoginBody }>,
  reply: FastifyReply,
): Promise<LoginResponse> {
  const result = await request.server.grpcClients.auth.login(
    request.body,
    grpcDeadlinesMs.authLogin,
  );

  const expiresIn = Number(result.expiresIn);

  try {
    await storeAccessToken(request.server.redis, result.userId, result.accessToken, expiresIn);
  } catch (error) {
    request.log.error({ err: error }, 'Could not store access token session');
    throw new AppError('UPSTREAM_UNAVAILABLE');
  }

  setAccessCookie(reply, request.server.config, result.accessToken, expiresIn);

  return mapLoginResponse(result);
}

export async function logoutHandler(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<FastifyReply> {
  if (request.principal === null) {
    throw new AppError('UNAUTHENTICATED');
  }

  try {
    await deleteAccessToken(request.server.redis, request.principal.userId);
  } catch (error) {
    request.log.error({ err: error }, 'Could not delete access token session');
    throw new AppError('UPSTREAM_UNAVAILABLE');
  }

  clearAccessCookie(reply, request.server.config);
  return reply.code(204).send();
}

export async function meHandler(request: FastifyRequest): Promise<MeResponse> {
  if (request.principal === null) {
    throw new AppError('UNAUTHENTICATED');
  }

  const result = await request.server.grpcClients.auth.getUser(
    { userId: request.principal.userId },
    grpcDeadlinesMs.authGetUser,
  );

  return mapMeResponse(result);
}
