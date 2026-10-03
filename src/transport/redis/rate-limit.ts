import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

import type { Redis } from 'ioredis';

import type { RateLimitPolicy } from '../../policies/rate-limits.js';

const RATE_LIMIT_SCRIPT = readFileSync(
  new URL('./scripts/rate-limit.lua', import.meta.url),
  'utf8',
);
const RATE_LIMIT_SCRIPT_SHA = createHash('sha1').update(RATE_LIMIT_SCRIPT).digest('hex');

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  retryAfterMs: number;
  // Time until the client's full quota is available again.
  resetMs: number;
}


export async function consumeRateLimit(
  redis: Redis,
  key: string,
  policy: RateLimitPolicy,
): Promise<RateLimitResult> {
  const args = [1, key, policy.limit, policy.windowMs] as const;

  let raw: unknown;

  try {
    raw = await redis.evalsha(RATE_LIMIT_SCRIPT_SHA, ...args);
  } catch (error) {
    if (!(error instanceof Error) || !error.message.startsWith('NOSCRIPT')) {
      throw error;
    }

    raw = await redis.eval(RATE_LIMIT_SCRIPT, ...args);
  }

  const [allowed, remaining, retryAfterMs, resetMs] = raw as [number, number, number, number];

  return {
    allowed: allowed === 1,
    remaining,
    retryAfterMs,
    resetMs,
  };
}
