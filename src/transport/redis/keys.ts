import { createHmac } from 'node:crypto';

import type { NodeEnvironment } from '../../config/types.js';

const RATE_LIMIT_KEY_VERSION = 'v1';

export function hashIdentity(secret: string, value: string): string {
  return createHmac('sha256', secret).update(value).digest('hex').slice(0, 32);
}

export function rateLimitKey(
  environment: NodeEnvironment,
  policyName: string,
  hashedIdentity: string,
): string {
  return `gridx:${environment}:gateway:rl:${RATE_LIMIT_KEY_VERSION}:${policyName}:${hashedIdentity}`;
}
