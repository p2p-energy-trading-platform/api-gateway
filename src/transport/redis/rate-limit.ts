import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';


import type { RateLimitPolicy } from '../../policies/rate-limits.js';
import type { RedisClient } from './client.js';

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
  redis: RedisClient,
  key: string,
  policy: RateLimitPolicy,
): Promise<RateLimitResult> {
  const options = {
    keys: [key],
    arguments: [String(policy.limit), String(policy.windowMs)]
  }

  let raw: unknown;

  try {
    raw = await redis.evalSha(RATE_LIMIT_SCRIPT_SHA, options);
  } catch (error) {
    if (!(error instanceof Error) || !error.message.startsWith('NOSCRIPT')) {
      throw error;
    }

    raw = await redis.eval(RATE_LIMIT_SCRIPT, options);
  }

  const [allowed, remaining, retryAfterMs, resetMs] = raw as [number, number, number, number];

  return {
    allowed: allowed === 1,
    remaining,
    retryAfterMs,
    resetMs,
  };
}
