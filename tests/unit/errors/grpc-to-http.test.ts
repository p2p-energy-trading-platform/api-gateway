import { describe, expect, it } from 'vitest';

import { AppError } from '../../../src/errors/app-error.js';
import { errorCodeFromStatus } from '../../../src/errors/codes.js';
import {
  GrpcStatus,
  fromGrpcError,
  grpcStatusToErrorCode,
} from '../../../src/errors/grpc-to-http.js';

describe('grpcStatusToErrorCode', () => {
  it.each([
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
    [GrpcStatus.UNKNOWN, 'INTERNAL_ERROR'],
    [GrpcStatus.UNIMPLEMENTED, 'INTERNAL_ERROR'],
    [GrpcStatus.INTERNAL, 'INTERNAL_ERROR'],
    [GrpcStatus.DATA_LOSS, 'INTERNAL_ERROR'],
    [999, 'INTERNAL_ERROR'],
  ])('maps gRPC status %i to %s', (grpcStatus, expected) => {
    expect(grpcStatusToErrorCode(grpcStatus)).toBe(expected);
  });
});

describe('fromGrpcError', () => {
  it('keeps the upstream message for client errors', () => {
    const error = fromGrpcError(GrpcStatus.ALREADY_EXISTS, 'Email already registered');

    expect(error).toBeInstanceOf(AppError);
    expect(error.code).toBe('CONFLICT');
    expect(error.statusCode).toBe(409);
    expect(error.message).toBe('Email already registered');
  });

  it('hides the upstream message for server errors', () => {
    const error = fromGrpcError(GrpcStatus.INTERNAL, 'pq: connection to 10.0.0.5 refused');

    expect(error.code).toBe('INTERNAL_ERROR');
    expect(error.statusCode).toBe(500);
    expect(error.message).toBe('An unexpected error occurred.');
  });

  it('uses the default message when the upstream message is empty', () => {
    const error = fromGrpcError(GrpcStatus.NOT_FOUND, '');

    expect(error.message).toBe('Resource not found.');
  });
});

describe('errorCodeFromStatus', () => {
  it.each([
    [400, 'VALIDATION_ERROR'],
    [404, 'NOT_FOUND'],
    [413, 'PAYLOAD_TOO_LARGE'],
    [415, 'UNSUPPORTED_MEDIA_TYPE'],
    [418, 'VALIDATION_ERROR'],
    [502, 'INTERNAL_ERROR'],
  ])('maps HTTP %i to %s', (status, expected) => {
    expect(errorCodeFromStatus(status)).toBe(expected);
  });
});
