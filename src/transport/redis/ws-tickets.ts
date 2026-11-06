import { createHash, randomBytes } from 'node:crypto';

import type { NodeEnvironment } from '../../config/types.js';
import type { WebsocketUser } from '../../websocket/connection.js';
import type { RedisClient } from './client.js';

const WS_TICKET_KEY_VERSION = 'v1';

/*
 * The key stores a hash of the ticket, not the ticket itself, so someone reading Redis cannot
 * use the tickets they see.
 */
function wsTicketKey(environment: NodeEnvironment, ticket: string): string {
  const hash = createHash('sha256').update(ticket).digest('hex');

  return `gridx:${environment}:gateway:ws-ticket:${WS_TICKET_KEY_VERSION}:${hash}`;
}

// Creates a random single-use ticket for a verified user. It expires after ttlSeconds.
export async function createWsTicket(
  redis: RedisClient,
  environment: NodeEnvironment,
  user: WebsocketUser,
  ttlSeconds: number,
): Promise<string> {
  const ticket = randomBytes(32).toString('base64url');

  await redis.set(wsTicketKey(environment, ticket), JSON.stringify(user), {
    expiration: { type: 'EX', value: ttlSeconds },
  });

  return ticket;
}

/*
 * Reads and deletes the ticket in one atomic Redis step (GETDEL), so it works only once, even if
 * two connections try to use it at the same moment. Returns null for unknown, expired, or used
 * tickets.
 */
export async function consumeWsTicket(
  redis: RedisClient,
  environment: NodeEnvironment,
  ticket: string,
): Promise<WebsocketUser | null> {
  const raw = await redis.getDel(wsTicketKey(environment, ticket));

  if (typeof raw !== 'string') {
    return null;
  }

  let data: Partial<WebsocketUser>;

  try {
    data = JSON.parse(raw) as Partial<WebsocketUser>;
  } catch {
    return null;
  }

  if (typeof data.userId !== 'string' || data.userId.length === 0) {
    return null;
  }

  return { userId: data.userId, role: typeof data.role === 'string' ? data.role : undefined };
}

// Exported for tests.
export const wsTicketKeyForTests = wsTicketKey;
