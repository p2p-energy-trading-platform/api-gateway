export const DEFAULT_GRPC_TIMEOUT_MS = 5000;

export const grpcDeadlinesMs = {
  authRegister: 3_000,
} as const;

export function getTimeoutOptions(timeoutMs: number = DEFAULT_GRPC_TIMEOUT_MS) {
  return {
    timeoutMs,
  };
}
