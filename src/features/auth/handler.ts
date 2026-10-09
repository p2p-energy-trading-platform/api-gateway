import type { FastifyReply, FastifyRequest } from 'fastify';
import { grpcDeadlinesMs } from '../../transport/grpc/deadlines.js';
import type { RegisterBody } from './schemas.js';
import { mapRegisterResponse } from './mapper.js';
import { mapLoginResponse, mapMeResponse } from './mapper.js';
import type { LoginBody } from './schemas.js';
import { AppError } from '../../errors/app-error.js';
import { clearAuthCookies, REFRESH_COOKIE_NAME, setAuthCookies } from './cookies.js';

export async function registerHandler(
  request: FastifyRequest<{ Body: RegisterBody }>,
  reply: FastifyReply,
): Promise<FastifyReply> {
  const result = await request.server.grpcClients.auth.register(
    {
      email: request.body.email,
      password: request.body.password,
    },
    grpcDeadlinesMs.authRegister,
  );

  return reply.code(201).send(mapRegisterResponse(result));
}

export async function loginHandler(
  request: FastifyRequest<{ Body: LoginBody }>,
  reply: FastifyReply,
): Promise<FastifyReply> {
  const result = await request.server.grpcClients.auth.login(
    request.body,
    grpcDeadlinesMs.authLogin,
  );

  setAuthCookies(
    reply,
    request.server.config,
    result.accessToken,
    result.refreshToken,
    Number(result.expiresIn),
  );

  return reply.code(200).send(mapLoginResponse(result));
}

export async function refreshHandler(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<FastifyReply> {
  const refreshToken = request.cookies?.[REFRESH_COOKIE_NAME];

  if (refreshToken === undefined) {
    throw new AppError('UNAUTHENTICATED');
  }

  try {
    const result = await request.server.grpcClients.auth.refreshToken(
      { refreshToken },
      grpcDeadlinesMs.authRefresh,
    );

    setAuthCookies(
      reply,
      request.server.config,
      result.accessToken,
      result.refreshToken,
      Number(result.expiresIn),
    );

    return reply.code(204).send();
  } catch (error) {
    clearAuthCookies(reply, request.server.config);
    throw error;
  }
}

export async function logoutHandler(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<FastifyReply> {
  const refreshToken = request.cookies?.[REFRESH_COOKIE_NAME];

  if (refreshToken !== undefined) {
    try {
      await request.server.grpcClients.auth.logout({ refreshToken }, grpcDeadlinesMs.authLogout);
    } catch (error) {
      request.log.warn({ err: error }, 'Auth-service logout failed; clearing gateway cookies');
    }
  }

  clearAuthCookies(reply, request.server.config);
  return reply.code(204).send();
}

export async function meHandler(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<FastifyReply> {
  if (request.principal === null) {
    throw new AppError('UNAUTHENTICATED');
  }

  const result = await request.server.grpcClients.auth.getUser(
    { userId: request.principal.userId },
    grpcDeadlinesMs.authGetUser,
  );

  return reply.code(200).send(mapMeResponse(result));
}
