export interface RateLimitPolicy {
  limit: number;
  windowMs: number;
}

const ONE_MINUTE_MS = 60_000;

export const rateLimitPolicies = {
  'public-read': { limit: 100, windowMs: ONE_MINUTE_MS },
  'authenticated-read': { limit: 100, windowMs: ONE_MINUTE_MS },
  'expensive-read': { limit: 100, windowMs: ONE_MINUTE_MS },
  'authenticated-write': { limit: 100, windowMs: ONE_MINUTE_MS },
  'auth-login': { limit: 10, windowMs: ONE_MINUTE_MS },
  'auth-refresh': { limit: 10, windowMs: ONE_MINUTE_MS },
  'auth-logout': { limit: 10, windowMs: ONE_MINUTE_MS },
  'auth-password-reset': { limit: 10, windowMs: ONE_MINUTE_MS },
  'auth-register': { limit: 5, windowMs: ONE_MINUTE_MS },
  'websocket-connect': { limit: 20, windowMs: ONE_MINUTE_MS },
} as const satisfies Record<string, RateLimitPolicy>;

export type RateLimitPolicyName = keyof typeof rateLimitPolicies;

export const DEFAULT_RATE_LIMIT_POLICY: RateLimitPolicyName = 'public-read';
