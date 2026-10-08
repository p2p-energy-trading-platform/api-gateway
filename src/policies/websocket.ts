export const websocketLimits = {
  // A ticket must be used within this time, and only once.
  ticketTtlSeconds: 30,
  // A ping is sent this often; a connection that did not answer the previous ping is closed.
  heartbeatIntervalMs: 30_000,
  // Larger incoming messages close the connection with 1009.
  maxMessageBytes: 16 * 1024,
  maxSubscriptionsPerConnection: 20,
  // Per user, per gateway instance.
  maxConnectionsPerUser: 5,
  // After this many invalid messages the connection is closed with 1008.
  maxInvalidMessages: 5,
  // Unsent data allowed to pile up for a slow client before it is disconnected.
  maxBufferedBytes: 1024 * 1024,
} as const;

export type WebsocketLimits = { [K in keyof typeof websocketLimits]: number };

// WebSocket close codes 
export const CloseCode = {
  NORMAL: 1000,
  GOING_AWAY: 1001,
  POLICY_VIOLATION: 1008,
  MESSAGE_TOO_BIG: 1009,
  TRY_AGAIN_LATER: 1013,
} as const;
