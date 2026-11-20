import type { WebsocketUser } from './connection.js';

/**
 * Lets a feature offer its own WebSocket topics without changing the plugin.
 * Register providers with `app.realtime.registerTopicProvider()`.
 */
export interface TopicProvider {
  /** True if this provider handles the client-facing topic. */
  matches(topic: string): boolean;
  /**
   * Resolves to the internal key if the user may subscribe, otherwise null.
   * Rejects when the check cannot run; the client gets TOPIC_UNAVAILABLE.
   */
  authorize(topic: string, user: WebsocketUser): Promise<string | null>;
  /** Called when a key gets its first subscriber on this instance. */
  onActive?(key: string): void;
  /** Called when the last subscriber of a key on this instance leaves. */
  onIdle?(key: string): void;
}
