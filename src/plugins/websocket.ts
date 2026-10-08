import fastifyWebsocket from '@fastify/websocket';
import fp from 'fastify-plugin';
import type { FastifyPluginAsync } from 'fastify';
import { Type, type Static } from 'typebox';
import type { RawData, WebSocket } from 'ws';

import { strictObject } from '../common/validation.js';
import type { AppConfig } from '../config/types.js';
import { AppError } from '../errors/app-error.js';
import { CloseCode, websocketLimits, type WebsocketLimits } from '../policies/websocket.js';
import { consumeWsTicket } from '../transport/redis/ws-tickets.js';
import { ClientConnection, type WebsocketUser } from '../websocket/connection.js';
import { startHeartbeat } from '../websocket/heartbeat.js';
import { errorMessage, parseClientMessage, type ParseResult } from '../websocket/protocol.js';
import { SubscriptionManager } from '../websocket/subscriptions.js';

declare module 'fastify' {
  interface FastifyInstance {
    realtime: {
      // Sends an event to every local connection subscribed to the topic key.
      publish(topicKey: string, event: string, payload: unknown): number;
      connectionCount(): number;
      limits: WebsocketLimits;
    };
  }

  interface FastifyRequest {
    websocketUser: WebsocketUser | null;
  }
}

export interface WebsocketPluginOptions {
  config: AppConfig;
  limits?: Partial<WebsocketLimits>;
}

const wsQuerySchema = strictObject({
  // 32 random bytes in base64url.
  ticket: Type.String({ pattern: '^[A-Za-z0-9_-]{43}$' }),
});

type WsQuery = Static<typeof wsQuerySchema>;

function toText(data: RawData): string {
  if (Array.isArray(data)) {
    return Buffer.concat(data).toString('utf8');
  }

  return Buffer.from(data as ArrayBuffer).toString('utf8');
}

const websocketPlugin: FastifyPluginAsync<WebsocketPluginOptions> = async (app, options) => {
  const { config } = options;
  const limits: WebsocketLimits = { ...websocketLimits, ...options.limits };

  const connections = new Set<ClientConnection>();
  const connectionsPerUser = new Map<string, number>();
  const subscriptions = new SubscriptionManager(limits, (delta) =>
    app.metrics.wsSubscriptions.inc(delta),
  );

  // Registered before @fastify/websocket, so it runs first: clients get 1001 ("server going
  // away, reconnect") instead of a close without a reason.
  app.addHook('preClose', async () => {
    for (const connection of connections) {
      connection.close(CloseCode.GOING_AWAY, 'Server shutting down');
    }
  });

  await app.register(fastifyWebsocket, {
    // Larger messages close the connection with 1009.
    options: { maxPayload: limits.maxMessageBytes },
  });

  app.decorateRequest('websocketUser', null);

  app.decorate('realtime', {
    publish: (topicKey: string, event: string, payload: unknown) =>
      subscriptions.publish(topicKey, event, payload),
    connectionCount: () => connections.size,
    limits,
  });

  const stopHeartbeat = startHeartbeat(() => connections, limits.heartbeatIntervalMs);
  app.addHook('onClose', async () => stopHeartbeat());

  function releaseConnectionSlot(userId: string): void {
    const open = (connectionsPerUser.get(userId) ?? 1) - 1;

    if (open <= 0) {
      connectionsPerUser.delete(userId);
    } else {
      connectionsPerUser.set(userId, open);
    }
  }

  function handleMessage(connection: ClientConnection, data: RawData, isBinary: boolean): void {
    const result: ParseResult = isBinary
      ? { ok: false, id: undefined, message: 'Messages must be JSON.' }
      : parseClientMessage(toText(data));

    if (!result.ok) {
      connection.invalidMessages += 1;
      connection.send(errorMessage('INVALID_MESSAGE', result.message, result.id));

      if (connection.invalidMessages >= limits.maxInvalidMessages) {
        connection.close(CloseCode.POLICY_VIOLATION, 'Too many invalid messages');
      }

      return;
    }

    const { message } = result;
    const reply =
      message.type === 'subscribe'
        ? subscriptions.subscribe(connection, message.topic, message.id)
        : subscriptions.unsubscribe(connection, message.topic, message.id);

    connection.send(reply);
  }

  app.get<{ Querystring: WsQuery }>(
    '/api/v1/ws',
    {
      websocket: true,
      // The access token is checked when the ticket is created, so the upgrade itself is public;
      // the ticket below is what authenticates it.
      config: { auth: 'public', rateLimit: 'websocket-connect' },
      schema: { querystring: wsQuerySchema },
      preHandler: async (request) => {
        if (!request.ws) {
          throw new AppError('NOT_FOUND', 'Route not found.');
        }

        let user: WebsocketUser | null;

        try {
          user = await consumeWsTicket(app.redis, config.nodeEnv, request.query.ticket);
        } catch (error) {
          request.log.error({ err: error }, 'Could not read WebSocket ticket');

          throw new AppError('UPSTREAM_UNAVAILABLE');
        }

        if (user === null) {
          throw new AppError('UNAUTHENTICATED', 'Invalid or expired WebSocket ticket.');
        }

        const open = connectionsPerUser.get(user.userId) ?? 0;

        if (open >= limits.maxConnectionsPerUser) {
          throw new AppError('RATE_LIMITED', 'Too many open WebSocket connections.');
        }

        connectionsPerUser.set(user.userId, open + 1);
        request.websocketUser = user;
      },
    },
    (socket: WebSocket, request) => {
      const user = request.websocketUser as WebsocketUser;
      const connection = new ClientConnection(request.id, user, socket, limits);

      connections.add(connection);
      app.metrics.wsConnections.inc();
      request.log.info({ userId: user.userId }, 'WebSocket connected');

      socket.on('pong', () => {
        connection.isAlive = true;
      });

      socket.on('message', (data, isBinary) => {
        handleMessage(connection, data, isBinary);
      });

      socket.on('close', (code) => {
        connections.delete(connection);
        subscriptions.removeAll(connection);
        releaseConnectionSlot(user.userId);
        app.metrics.wsConnections.dec();
        app.metrics.wsCloses.inc({ code: String(code) });
        request.log.info({ userId: user.userId, code }, 'WebSocket closed');
      });
    },
  );
};

export default fp(websocketPlugin, {
  name: 'websocket',
  dependencies: ['redis', 'authentication', 'observability'],
});
