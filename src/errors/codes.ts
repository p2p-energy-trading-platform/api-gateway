export const ErrorCodes = {
  VALIDATION_ERROR:     { status: 400, message: 'Request validation failed.' },
  UNAUTHENTICATED:      { status: 401, message: 'Authentication required.' },
  FORBIDDEN:            { status: 403, message: 'Access denied.' },
  NOT_FOUND:            { status: 404, message: 'Resource not found.' },
  CONFLICT:             { status: 409, message: 'Resource already exists.' },
  PAYLOAD_TOO_LARGE:    { status: 413, message: 'Request body too large.' },
  RATE_LIMITED:         { status: 429, message: 'Too many requests.' },
  INTERNAL_ERROR:       { status: 500, message: 'An unexpected error occurred.' },
  UPSTREAM_UNAVAILABLE: { status: 503, message: 'Service temporarily unavailable.' },
  UPSTREAM_TIMEOUT:     { status: 504, message: 'Upstream service timed out.' },
} as const;

export type ErrorCode = keyof typeof ErrorCodes;
