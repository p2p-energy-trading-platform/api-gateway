export const ErrorCodes = {
  BAD_REQUEST: { status: 400, message: 'Bad request.' },
  VALIDATION_ERROR: { status: 400, message: 'Request validation failed.' },
  UNAUTHENTICATED: { status: 401, message: 'Authentication required.' },
  FORBIDDEN: { status: 403, message: 'Access denied.' },
  NOT_FOUND: { status: 404, message: 'Resource not found.' },
  METHOD_NOT_ALLOWED: { status: 405, message: 'Method not allowed.' },
  CONFLICT: { status: 409, message: 'Resource already exists.' },
  PAYLOAD_TOO_LARGE: { status: 413, message: 'Request body too large.' },
  UNSUPPORTED_MEDIA_TYPE: { status: 415, message: 'Unsupported media type.' },
  RATE_LIMITED: { status: 429, message: 'Too many requests.' },
  INTERNAL_ERROR: { status: 500, message: 'An unexpected error occurred.' },
  UPSTREAM_UNAVAILABLE: { status: 503, message: 'Service temporarily unavailable.' },
  UPSTREAM_TIMEOUT: { status: 504, message: 'Upstream service timed out.' },
} as const satisfies Record<string, { status: number; message: string }>;

export type ErrorCode = keyof typeof ErrorCodes;

const errorCodeByStatus = new Map<number, ErrorCode>(
  Object.entries(ErrorCodes)
    .filter(([code]) => code !== 'VALIDATION_ERROR')
    .map(([code, { status }]) => [status, code as ErrorCode]),
);

export function errorCodeFromStatus(statusCode: number): ErrorCode {
  const code = errorCodeByStatus.get(statusCode);

  if (code !== undefined) {
    return code;
  }

  return statusCode >= 400 && statusCode < 500 ? 'BAD_REQUEST' : 'INTERNAL_ERROR';
}
