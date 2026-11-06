import type { WebsocketUser } from './connection.js';

/**
 * Resolves a client-facing topic name to an internal subscription key.
 *
 * Client-facing topics are intentionally separate from internal keys so that
 * clients cannot choose arbitrary user identifiers or internal routing keys.
 */

export const USER_SELF_TOPIC = 'user.self';

const USER_KEY_PREFIX = 'user:';

export function userTopicKey(userId: string): string {
  return `${USER_KEY_PREFIX}${userId}`;
}

export function resolveTopicKey(topic: string, user: WebsocketUser): string | null {
  if (topic === USER_SELF_TOPIC) {
    return userTopicKey(user.userId);
  }

  return null;
}

export function topicNameForKey(key: string): string {
  if (key.startsWith(USER_KEY_PREFIX)) {
    return USER_SELF_TOPIC;
  }

  return key;
}
