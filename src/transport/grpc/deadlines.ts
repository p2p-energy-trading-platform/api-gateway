export const DEFAULT_GRPC_TIMEOUT_MS = 5000;

export const grpcDeadlinesMs = {
  authRegister: 3_000,
  authVerifyEmail: 3_000,
  authResendOtp: 3_000,
  authLogin: 3_000,
  authRefresh: 3_000,
  authLogout: 3_000,
  authGetUser: 3_000,
  authGetProfile: 3_000,
  authUpdateProfile: 3_000,
  authChangePassword: 3_000,
  authRequestEmailChange: 3_000,
  authVerifyEmailChange: 3_000,
  authPasswordReset: 3_000,
  authResetPassword: 3_000,
} as const;

export function getTimeoutOptions(timeoutMs: number = DEFAULT_GRPC_TIMEOUT_MS) {
  return {
    timeoutMs,
  };
}
