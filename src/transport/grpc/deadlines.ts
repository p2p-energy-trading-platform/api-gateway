export const DEFAULT_GRPC_TIMEOUT_MS = 5000;

export function getTimeoutOptions(timeoutMs: number = DEFAULT_GRPC_TIMEOUT_MS) {
  return {
    timeoutMs,
  };
}