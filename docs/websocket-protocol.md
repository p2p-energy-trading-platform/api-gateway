# WebSocket protocol

The gateway pushes live events to clients over one WebSocket per browser tab or app.
Clients subscribe to **topics**; the gateway checks each subscription and forwards
only the events the user may see. Delivery is best effort: events are not stored or
replayed, so clients refetch current state over REST after every `subscribed` reply.

## Connecting

1. Get a ticket with your access token:

   ```http
   POST /api/v1/ws/ticket
   Authorization: Bearer <access token>
   ```

   ```json
   { "ticket": "<43 characters>", "expiresIn": 30 }
   ```

   A ticket is single use and expires after 30 seconds.

2. Open the socket within 30 seconds:

   ```text
   GET /api/v1/ws?ticket=<ticket>
   ```

| Refusal | Status |
|---|---|
| Missing or badly formed ticket | 400 |
| Unknown, used or expired ticket | 401 |
| `Origin` header not in `CORS_ORIGINS` (checked first; the ticket is not used up) | 403 |
| More than 5 open connections for the user on one gateway instance | 429 |
| More than 20 connection attempts per minute | 429 |
| Redis unavailable | 503 |

Clients that send no `Origin` header, such as mobile apps, are allowed; the ticket
still authenticates them.

## Messages

Every message is a JSON text frame of at most 16 KB.

### Client to gateway

```json
{ "type": "subscribe", "id": "c1", "topic": "user.self" }
{ "type": "unsubscribe", "id": "c2", "topic": "user.self" }
```

| Field | Rules |
|---|---|
| `type` | `subscribe` or `unsubscribe` |
| `id` | 1–64 characters, chosen by the client; echoed in the reply |
| `topic` | 1–120 characters |
| `payload` | Optional; must be `{}` when sent |

Messages on one connection are handled one at a time, in order, so replies arrive in
the order the messages were sent. Subscribing to a topic twice, or unsubscribing from
a topic that is not subscribed, succeeds and changes nothing.

### Gateway to client

```json
{ "type": "subscribed", "id": "c1", "topic": "user.self", "version": 1, "timestamp": "2026-11-20T09:30:00.000Z" }
{ "type": "unsubscribed", "id": "c2", "topic": "user.self", "version": 1, "timestamp": "…" }
{ "type": "event", "topic": "user.self", "event": "order.filled", "version": 1, "timestamp": "…", "payload": { } }
{ "type": "error", "id": "c1", "code": "TOPIC_NOT_ALLOWED", "message": "You cannot subscribe to this topic.", "timestamp": "…" }
```

`version` is the protocol version, currently `1`. Ignore fields you do not know.

## Topics

| Topic | Who may subscribe | Events |
|---|---|---|
| `user.self` | Any signed-in user; always means the user on the ticket | Reserved for user events; nothing publishes yet |
| `iot.house.<houseId>` | The house's owner (an approved meter registration), checked with the IoT service on every subscribe | `reading`, `status`, `stream-state` (below) |

### `iot.house.<houseId>` events

```json
{ "type": "event", "topic": "iot.house.grid01-house0003", "event": "reading", "version": 1, "timestamp": "…",
  "payload": { "meterId": "SM-784", "measuredAt": "2026-11-20T09:30:05.000Z", "seq": 4182,
               "solarKw": 1.42, "consumptionKw": 0.86, "netKw": 0.31,
               "storageAssets": [{ "assetId": "bat-1", "assetType": "bess", "socPct": 63, "powerKw": 0.25, "capacityKwh": 5.16 }] } }

{ "type": "event", "topic": "iot.house.grid01-house0003", "event": "status", "version": 1, "timestamp": "…",
  "payload": { "meterStatus": "online", "lastHeartbeatAt": "2026-11-20T09:30:00.000Z" } }

{ "type": "event", "topic": "iot.house.grid01-house0003", "event": "stream-state", "version": 1, "timestamp": "…",
  "payload": { "state": "interrupted" } }
```

| Event | Payload | Notes |
|---|---|---|
| `reading` | Exactly the `GET /api/v1/iot/houses/{houseId}/latest-reading` response | About every 5 s. Ignore a reading older than the one you hold (compare `measuredAt`, then `seq`). |
| `status` | `meterStatus` (`online` or `offline`) and, when online, `lastHeartbeatAt` | Sent when the meter comes online or goes offline. |
| `stream-state` | `state`: `interrupted` or `live` | The gateway lost its feed from the IoT service and is retrying (`interrupted`), or has it back (`live`). Show data as possibly stale meanwhile. |

After `subscribed`, and after `stream-state` `live`, refetch the latest reading and the
house over REST: events are not replayed. The first events after subscribing may repeat
the current status and reading.

Features add topics by registering a topic provider (see below). An unknown topic and
a topic the user may not see get the same `TOPIC_NOT_ALLOWED` reply, so clients
cannot probe which resources exist.

## Errors

| Code | Meaning | Client action |
|---|---|---|
| `INVALID_MESSAGE` | Not JSON, an unknown type, or a field breaks the rules. `id` is included when it could be read. | Fix the message. After 5 invalid messages the connection is closed with 1008. |
| `TOPIC_NOT_ALLOWED` | Unknown topic, or the user may not subscribe to it | Do not retry |
| `TOPIC_UNAVAILABLE` | The permission check could not run (a backend service is down) | Retry later with backoff |
| `TOO_MANY_SUBSCRIPTIONS` | 20 topics are already subscribed on this connection | Unsubscribe from something first |

## Close codes

| Code | Meaning | Client action |
|---|---|---|
| 1000 | Normal close | Reconnect only if still needed |
| 1001 | Gateway shutting down | Reconnect with backoff |
| 1006 | Connection lost (no close frame) | Reconnect with backoff |
| 1008 | Policy: too many invalid messages, or too slow to read (over 1 MB waiting) | Reconnect with a longer backoff |
| 1009 | Message over 16 KB | Do not resend it; report the bug |
| 4001 | Reauthenticate: the connection reached its maximum age | Reconnect at once with a new ticket |

The maximum age is `WS_MAX_CONNECTION_AGE_MS` (default 15 minutes, the access-token
lifetime) with ±10% jitter. A new ticket needs a valid access token, so a logged-out
user, or one who lost access to a topic, stops receiving events within one token lifetime.

## Reconnecting

1. Get a new ticket. If that fails with 401, refresh the access token first.
2. Reconnect with exponential backoff and jitter (for example 1 s doubling to 30 s),
   except after 4001, which reconnects at once.
3. Subscribe to the same topics again.
4. After each `subscribed` reply, refetch that topic's current state over REST, since
   events sent while disconnected are not replayed.

The gateway pings every 30 seconds and terminates connections that did not answer the
previous ping. Browsers answer pings automatically.

## Adding a topic (gateway developers)

Register a `TopicProvider` (`src/websocket/topics.ts`) from your feature's routes:

```ts
app.realtime.registerTopicProvider({
  matches: (topic) => topic.startsWith('example.'),
  // Resolve to the internal key if the user may subscribe, otherwise null.
  // Throw (reject) if the check cannot run; the client gets TOPIC_UNAVAILABLE.
  authorize: async (topic, user) => ((await mayRead(user.userId, topic)) ? topic : null),
  // Optional: the key got its first subscriber on this instance / lost its last one.
  onActive: (key) => startFeed(key),
  onIdle: (key) => stopFeed(key),
});

app.realtime.publish(key, 'example.updated', payload);
```

`publish` reaches only the connections on the same gateway instance, so each instance
runs its own feed for the keys its clients watch (`onActive` / `onIdle`). Hooks must
not throw; errors are logged and do not affect the subscription.
