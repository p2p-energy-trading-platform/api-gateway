import type { WebsocketLimits } from '../policies/websocket.js';
import { resolveTopicKey, topicNameForKey } from './authorization.js';
import type { ClientConnection } from './connection.js';
import { errorMessage, eventMessage, subscribedMessage } from './protocol.js';
import type { TopicProvider } from './topics.js';

type Resolution = { key: string; provider?: TopicProvider } | 'not-allowed' | 'unavailable';

export class SubscriptionManager {
  private readonly connectionsByKey = new Map<string, Set<ClientConnection>>();
  private readonly providers: TopicProvider[] = [];
  // The provider behind each active key, so its hooks can be called.
  private readonly providerByKey = new Map<string, TopicProvider>();

  constructor(
    private readonly limits: Pick<WebsocketLimits, 'maxSubscriptionsPerConnection'>,
    // Called with +1 / -1 so metrics can track the number of subscriptions.
    private readonly onChange: (delta: number) => void = () => {},
    // Called when a provider's onActive or onIdle hook throws.
    private readonly onHookError: (error: unknown) => void = () => {},
  ) {}

  registerTopicProvider(provider: TopicProvider): void {
    this.providers.push(provider);
  }

  /*
   * Resolves to the reply for the client, or null when the connection closed while the topic was
   * being checked (nothing is subscribed and there is nobody to reply to).
   */
  async subscribe(connection: ClientConnection, topic: string, id: string): Promise<object | null> {
    // Subscribing twice to the same topic is allowed and changes nothing.
    if (connection.topics.has(topic)) {
      return subscribedMessage('subscribed', id, topic);
    }

    if (connection.topics.size >= this.limits.maxSubscriptionsPerConnection) {
      return errorMessage(
        'TOO_MANY_SUBSCRIPTIONS',
        `Subscription limit reached (${this.limits.maxSubscriptionsPerConnection}).`,
        id,
      );
    }

    const resolution = await this.resolve(topic, connection);

    if (!connection.isOpen) {
      return null;
    }

    if (resolution === 'unavailable') {
      return errorMessage(
        'TOPIC_UNAVAILABLE',
        'This topic is unavailable right now. Try again later.',
        id,
      );
    }

    if (resolution === 'not-allowed') {
      return errorMessage('TOPIC_NOT_ALLOWED', 'You cannot subscribe to this topic.', id);
    }

    connection.topics.set(topic, resolution.key);
    this.add(resolution.key, connection, resolution.provider);

    return subscribedMessage('subscribed', id, topic);
  }

  // Unsubscribing from a topic that is not subscribed is allowed and changes nothing.
  unsubscribe(connection: ClientConnection, topic: string, id: string): object {
    const key = connection.topics.get(topic);

    if (key !== undefined) {
      connection.topics.delete(topic);
      this.remove(key, connection);
    }

    return subscribedMessage('unsubscribed', id, topic);
  }

  removeAll(connection: ClientConnection): void {
    for (const key of connection.topics.values()) {
      this.remove(key, connection);
    }

    connection.topics.clear();
  }

  // Sends an event to every local connection subscribed to the key. Returns how many received it.
  publish(key: string, event: string, payload: unknown): number {
    const subscribers = this.connectionsByKey.get(key);

    if (subscribers === undefined) {
      return 0;
    }

    const message = eventMessage(topicNameForKey(key), event, payload);
    let delivered = 0;

    for (const connection of subscribers) {
      if (connection.send(message)) {
        delivered += 1;
      }
    }

    return delivered;
  }

  private async resolve(topic: string, connection: ClientConnection): Promise<Resolution> {
    // Built-in topics such as user.self keep their synchronous path.
    const builtIn = resolveTopicKey(topic, connection.user);

    if (builtIn !== null) {
      return { key: builtIn };
    }

    const provider = this.providers.find((candidate) => candidate.matches(topic));

    if (provider === undefined) {
      return 'not-allowed';
    }

    try {
      const key = await provider.authorize(topic, connection.user);

      return key === null ? 'not-allowed' : { key, provider };
    } catch {
      return 'unavailable';
    }
  }

  private add(key: string, connection: ClientConnection, provider?: TopicProvider): void {
    let subscribers = this.connectionsByKey.get(key);

    if (subscribers === undefined) {
      subscribers = new Set<ClientConnection>();
      this.connectionsByKey.set(key, subscribers);

      if (provider !== undefined) {
        this.providerByKey.set(key, provider);
        this.callHook(() => provider.onActive?.(key));
      }
    }

    subscribers.add(connection);
    this.onChange(1);
  }

  private remove(key: string, connection: ClientConnection): void {
    const subscribers = this.connectionsByKey.get(key);

    if (subscribers?.delete(connection)) {
      this.onChange(-1);

      if (subscribers.size === 0) {
        this.connectionsByKey.delete(key);

        const provider = this.providerByKey.get(key);

        if (provider !== undefined) {
          this.providerByKey.delete(key);
          this.callHook(() => provider.onIdle?.(key));
        }
      }
    }
  }

  private callHook(hook: () => void): void {
    try {
      hook();
    } catch (error) {
      this.onHookError(error);
    }
  }
}
