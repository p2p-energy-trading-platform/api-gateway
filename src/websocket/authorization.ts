import type { WebsocketUser } from './connection.js';

/*
 * Topic rules. A client asks for a topic NAME; the gateway turns it into an internal KEY.
 *
 * - "user.self" always means the verified user's own events. The user ID comes from the ticket,
 *   so a client cannot even ask for another user's events.
 * - "market.summary" is shared by every logged-in user.
 * - Anything else is refused with the same answer, so clients cannot discover which topics exist.
 */
export const USER_SELF_TOPIC = 'user.self';
export const MARKET_SUMMARY_TOPIC = 'market.summary';

const USER_KEY_PREFIX = 'user:';

export function userTopicKey(userId: string): string {
  return `${USER_KEY_PREFIX}${userId}`;
}

export function resolveTopicKey(topic: string, user: WebsocketUser): string | null {
  if (topic === USER_SELF_TOPIC) {
    return userTopicKey(user.userId);
  }

  if (topic === MARKET_SUMMARY_TOPIC) {
    return MARKET_SUMMARY_TOPIC;
  }

  return null;
}

export function topicNameForKey(key: string): string {
  return key.startsWith(USER_KEY_PREFIX) ? USER_SELF_TOPIC : key;
}
