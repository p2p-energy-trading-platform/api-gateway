import type { WebsocketLimits } from '../policies/websocket.js';
import { resolveTopicKey, topicNameForKey } from './authorization.js';
import type { ClientConnection } from './connection.js';
import { errorMessage, eventMessage, subscribedMessage } from './protocol.js';


export class SubscriptionManager {
  private readonly connectionsByKey = new Map<string, Set<ClientConnection>>();

  constructor(
    private readonly limits: Pick<WebsocketLimits, 'maxSubscriptionsPerConnection'>,
    // Called with +1 / -1 so metrics can track the number of subscriptions.
    private readonly onChange: (delta: number) => void = () => {},
  ) {}

  subscribe(connection: ClientConnection, topic: string, id: string): object {
    const key = resolveTopicKey(topic, connection.user);

    if (key === null) {
      return errorMessage('TOPIC_NOT_ALLOWED', 'You cannot subscribe to this topic.', id);
    }

    // Subscribing twice to the same topic is allowed and changes nothing.
    if (!connection.topics.has(topic)) {
      if (connection.topics.size >= this.limits.maxSubscriptionsPerConnection) {
        return errorMessage(
          'TOO_MANY_SUBSCRIPTIONS',
          `Subscription limit reached (${this.limits.maxSubscriptionsPerConnection}).`,
          id,
        );
      }

      connection.topics.set(topic, key);
      this.add(key, connection);
    }

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

  private add(key: string, connection: ClientConnection): void {
    const subscribers = this.connectionsByKey.get(key) ?? new Set<ClientConnection>();

    subscribers.add(connection);
    this.connectionsByKey.set(key, subscribers);
    this.onChange(1);
  }

  private remove(key: string, connection: ClientConnection): void {
    const subscribers = this.connectionsByKey.get(key);

    if (subscribers?.delete(connection)) {
      this.onChange(-1);

      if (subscribers.size === 0) {
        this.connectionsByKey.delete(key);
      }
    }
  }
}
