import type { FastifyReply, FastifyRequest } from 'fastify';
import { grpcDeadlinesMs } from '../../transport/grpc/deadlines.js';
import type {
  LoginBody,
  LoginResponse,
  MeResponse,
  RegisterBody,
  RegisterResponse,
} from './schemas.js';
import { mapLoginResponse, mapMeResponse, mapRegisterResponse } from './mapper.js';
import { AppError } from '../../errors/app-error.js';
import { clearSessionCookies, readRefreshToken, setSessionCookies } from './cookies.js';

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
    {
      email: request.body.email,
      password: request.body.password,
    },
    grpcDeadlinesMs.authLogin,
  );

  setSessionCookies(reply, request.server.config, {
    accessToken: result.accessToken,
    refreshToken: result.refreshToken,
    expiresIn: Number(result.expiresIn),
  });

  return mapLoginResponse(result);
}

export async function refreshHandler(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<FastifyReply> {
  const refreshToken = readRefreshToken(request);

  if (refreshToken === undefined) {
    throw new AppError('UNAUTHENTICATED', 'Missing refresh token.');
  }

  try {
    // auth-service rotates the refresh token: the old one is revoked and a new one is returned.
    const result = await request.server.grpcClients.auth.refreshToken(
      { refreshToken },
      grpcDeadlinesMs.authRefresh,
    );

    setSessionCookies(reply, request.server.config, {
      accessToken: result.accessToken,
      refreshToken: result.refreshToken,
      expiresIn: result.expiresIn,
    });
  } catch (error) {
    // A revoked or expired refresh token cannot be used again, so drop the cookies.
    if (error instanceof AppError && error.code === 'UNAUTHENTICATED') {
      clearSessionCookies(reply, request.server.config);
    }

    throw error;
  }

  return reply.code(204).send();
}

export async function logoutHandler(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<FastifyReply> {
  const refreshToken = readRefreshToken(request);

  clearSessionCookies(reply, request.server.config);

  if (refreshToken !== undefined) {
    try {
      // Revokes the session in auth-service, so the refresh token can no longer be used.
      await request.server.grpcClients.auth.logout({ refreshToken }, grpcDeadlinesMs.authLogout);
    } catch (error) {
      // Already revoked or expired: the user is logged out either way.
      if (!(error instanceof AppError && error.code === 'UNAUTHENTICATED')) {
        throw error;
      }
    }
  }

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
