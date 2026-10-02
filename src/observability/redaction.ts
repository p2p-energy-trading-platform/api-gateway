export const REDACTED = '[REDACTED]';

const sensitiveFields = [
  'password',
  'currentPassword',
  'newPassword',
  'accessToken',
  'refreshToken',
  'token',
  'secret',
  'apiKey',
];

/*
 * Pino redact paths. Each sensitive field is covered at the top level and one level deep
 * (pino's `*` matches a single level), e.g. `password` and `body.password`.
 */
export const redactPaths = [
  'req.headers.authorization',
  'req.headers.cookie',
  'req.headers["x-api-key"]',
  'res.headers["set-cookie"]',
  ...sensitiveFields.flatMap((field) => [field, `*.${field}`]),
];
