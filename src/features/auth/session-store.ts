import { createHash } from 'node:crypto';

import type { RedisClient } from '../../transport/redis/client.js';

const SESSION_KEY_PREFIX = 'auth:session:';

export function sessionKey(userId: string): string {
  return `${SESSION_KEY_PREFIX}${userId}`;
}

export function hashAccessToken(accessToken: string): string {
  return createHash('sha256').update(accessToken).digest('hex');
}

export async function storeAccessToken(
  redis: RedisClient,
  userId: string,
  accessToken: string,
  expiresIn: number,
): Promise<void> {
  await redis.set(sessionKey(userId), hashAccessToken(accessToken), { EX: expiresIn });
}

export async function getAccessTokenHash(
  redis: RedisClient,
  userId: string,
): Promise<string | null> {
  return redis.get(sessionKey(userId));
}

export async function deleteAccessToken(redis: RedisClient, userId: string): Promise<void> {
  await redis.del(sessionKey(userId));
}
