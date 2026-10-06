import { Code, ConnectError } from '@connectrpc/connect';

export class GrpcTransportError extends Error {
  public readonly code: Code;
  public readonly httpStatusCode: number;

  constructor(code: Code, message: string) {
    super(`gRPC Transport Error [${Code[code] || code}]: ${message}`);
    this.name = 'GrpcTransportError';
    this.code = code;
    this.httpStatusCode = mapConnectCodeToHttpStatus(code);
  }
}

export function parseGrpcError(error: unknown): GrpcTransportError {
  if (error instanceof ConnectError) {
    return new GrpcTransportError(error.code, error.rawMessage);
  }

  if (error instanceof GrpcTransportError) {
    return error;
  }

  return new GrpcTransportError(
    Code.Internal,
    error instanceof Error ? error.message : 'Internal gRPC error'
  );
}

export function mapConnectCodeToHttpStatus(code: Code): number {
  switch (code) {
    case Code.Canceled:
      return 499;
    case Code.InvalidArgument:
    case Code.FailedPrecondition:
    case Code.OutOfRange:
      return 400;
    case Code.DeadlineExceeded:
      return 504;
    case Code.NotFound:
      return 404;
    case Code.AlreadyExists:
    case Code.Aborted:
      return 409;
    case Code.PermissionDenied:
      return 403;
    case Code.Unauthenticated:
      return 401;
    case Code.ResourceExhausted:
      return 429;
    case Code.Unimplemented:
      return 501;
    case Code.Unavailable:
      return 503;
    default:
      return 500;
  }
}