import { AppError } from './app-error.js';
import { ErrorCodes, type ErrorCode } from './codes.js';

/*
 * Numeric gRPC status codes, so this mapping does not depend on a specific gRPC client library.
 * https://grpc.io/docs/guides/status-codes/
 */
export const GrpcStatus = {
  OK: 0,
  CANCELLED: 1,
  UNKNOWN: 2,
  INVALID_ARGUMENT: 3,
  DEADLINE_EXCEEDED: 4,
  NOT_FOUND: 5,
  ALREADY_EXISTS: 6,
  PERMISSION_DENIED: 7,
  RESOURCE_EXHAUSTED: 8,
  FAILED_PRECONDITION: 9,
  ABORTED: 10,
  OUT_OF_RANGE: 11,
  UNIMPLEMENTED: 12,
  INTERNAL: 13,
  UNAVAILABLE: 14,
  DATA_LOSS: 15,
  UNAUTHENTICATED: 16,
} as const;

const errorCodeByGrpcStatus = new Map<number, ErrorCode>([
  [GrpcStatus.INVALID_ARGUMENT, 'VALIDATION_ERROR'],
  [GrpcStatus.FAILED_PRECONDITION, 'VALIDATION_ERROR'],
  [GrpcStatus.OUT_OF_RANGE, 'VALIDATION_ERROR'],
  [GrpcStatus.NOT_FOUND, 'NOT_FOUND'],
  [GrpcStatus.ALREADY_EXISTS, 'CONFLICT'],
  [GrpcStatus.ABORTED, 'CONFLICT'],
  [GrpcStatus.PERMISSION_DENIED, 'FORBIDDEN'],
  [GrpcStatus.UNAUTHENTICATED, 'UNAUTHENTICATED'],
  [GrpcStatus.RESOURCE_EXHAUSTED, 'RATE_LIMITED'],
  [GrpcStatus.UNAVAILABLE, 'UPSTREAM_UNAVAILABLE'],
  [GrpcStatus.DEADLINE_EXCEEDED, 'UPSTREAM_TIMEOUT'],
]);

export function grpcStatusToErrorCode(grpcStatus: number): ErrorCode {
  return errorCodeByGrpcStatus.get(grpcStatus) ?? 'INTERNAL_ERROR';
}

/*
 * Upstream messages are kept only for client errors (4xx). Server-side failures use the
 * default message so internal details from downstream services never reach clients.
 */
export function fromGrpcError(grpcStatus: number, message?: string): AppError {
  const code = grpcStatusToErrorCode(grpcStatus);
  const isClientError = ErrorCodes[code].status < 500;

  if (isClientError && message !== undefined && message.length > 0) {
    return new AppError(code, message);
  }

  return new AppError(code);
}
