import type { FastifyReply, FastifyRequest } from 'fastify';
import { grpcDeadlinesMs } from '../../transport/grpc/deadlines.js';
import type {
  ProfileResponse,
  UpdateProfileBody,
  ChangePasswordBody,
  ChangePasswordResponse,
  RequestEmailChangeBody,
  RequestEmailChangeResponse,
  VerifyEmailChangeBody,
  LoginBody,
  ResendOtpBody,
  ResendOtpResponse,
  VerifyEmailBody,
  VerifyEmailResponse,
  LoginResponse,
  MeResponse,
  RegisterBody,
  RegisterResponse,
  RequestPasswordResetBody,
  RequestPasswordResetResponse,
  ResetPasswordBody,
  ResetPasswordResponse,
} from './schemas.js';
import {
  mapLoginResponse,
  mapMeResponse,
  mapProfileResponse,
  mapRegisterResponse,
} from './mapper.js';
import { AppError } from '../../errors/app-error.js';
import { clearSessionCookies, readRefreshToken, setSessionCookies } from './cookies.js';

export async function verifyEmailHandler(
  request: FastifyRequest<{ Body: VerifyEmailBody }>,
): Promise<VerifyEmailResponse> {
  const result = await request.server.grpcClients.auth.verifyEmail(
    { email: request.body.email, otp: request.body.otp },
    grpcDeadlinesMs.authVerifyEmail,
  );

  return { success: result.success, message: result.message };
}

export async function resendOtpHandler(
  request: FastifyRequest<{ Body: ResendOtpBody }>,
): Promise<ResendOtpResponse> {
  const result = await request.server.grpcClients.auth.resendOtp(
    { email: request.body.email },
    grpcDeadlinesMs.authResendOtp,
  );

  return { success: result.success };
}

export async function registerHandler(
  request: FastifyRequest<{ Body: RegisterBody }>,
  reply: FastifyReply,
): Promise<RegisterResponse> {
  const result = await request.server.grpcClients.auth.register(
    {
      name: request.body.name.trim(),
      email: request.body.email,
      password: request.body.password,
    },
    grpcDeadlinesMs.authRegister,
  );

  setSessionCookies(reply, request.server.config, {
    accessToken: result.accessToken,
    refreshToken: result.refreshToken,
    expiresIn: Number(result.expiresIn),
  });

  reply.code(201);

  return mapRegisterResponse(result);
}

export async function requestPasswordResetHandler(
  request: FastifyRequest<{ Body: RequestPasswordResetBody }>,
): Promise<RequestPasswordResetResponse> {
  const result = await request.server.grpcClients.auth.requestPasswordReset(
    { email: request.body.email },
    grpcDeadlinesMs.authPasswordReset,
  );

  return { success: result.success };
}

export async function resetPasswordHandler(
  request: FastifyRequest<{ Body: ResetPasswordBody }>,
): Promise<ResetPasswordResponse> {
  const result = await request.server.grpcClients.auth.resetPassword(
    {
      token: request.body.token,
      newPassword: request.body.newPassword,
    },
    grpcDeadlinesMs.authResetPassword,
  );

  return { success: result.success };
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

export async function getProfileHandler(request: FastifyRequest): Promise<ProfileResponse> {
  if (request.principal === null) {
    throw new AppError('UNAUTHENTICATED');
  }

  const result = await request.server.grpcClients.auth.getProfile(
    {},
    grpcDeadlinesMs.authGetProfile,
  );

  return mapProfileResponse(result.profile);
}

export async function updateProfileHandler(
  request: FastifyRequest<{ Body: UpdateProfileBody }>,
): Promise<ProfileResponse> {
  if (request.principal === null) {
    throw new AppError('UNAUTHENTICATED');
  }

  const result = await request.server.grpcClients.auth.updateProfile(
    { name: request.body.name },
    grpcDeadlinesMs.authUpdateProfile,
  );

  return mapProfileResponse(result.profile);
}

export async function changePasswordHandler(
  request: FastifyRequest<{ Body: ChangePasswordBody }>,
): Promise<ChangePasswordResponse> {
  if (request.principal === null) {
    throw new AppError('UNAUTHENTICATED');
  }

  const result = await request.server.grpcClients.auth.changePassword(
    {
      currentPassword: request.body.currentPassword,
      newPassword: request.body.newPassword,
    },
    grpcDeadlinesMs.authChangePassword,
  );

  return { success: result.success };
}

export async function requestEmailChangeHandler(
  request: FastifyRequest<{ Body: RequestEmailChangeBody }>,
): Promise<RequestEmailChangeResponse> {
  if (request.principal === null) {
    throw new AppError('UNAUTHENTICATED');
  }

  const result = await request.server.grpcClients.auth.requestEmailChange(
    { newEmail: request.body.newEmail },
    grpcDeadlinesMs.authRequestEmailChange,
  );

  return { success: result.success };
}

export async function verifyEmailChangeHandler(
  request: FastifyRequest<{ Body: VerifyEmailChangeBody }>,
): Promise<ProfileResponse> {
  const result = await request.server.grpcClients.auth.verifyEmailChange(
    { token: request.body.token },
    grpcDeadlinesMs.authVerifyEmailChange,
  );

  return mapProfileResponse(result.profile);
}
