import { Compile } from 'typebox/compile';

import { CLIENT_MESSAGE_TYPES, clientMessageSchema, type ClientMessage } from './schemas.js';

export const PROTOCOL_VERSION = 1;

const clientMessageValidator = Compile(clientMessageSchema);

export type ProtocolErrorCode = 'INVALID_MESSAGE' | 'TOPIC_NOT_ALLOWED' | 'TOO_MANY_SUBSCRIPTIONS';

export type ParseResult =
  | { ok: true; message: ClientMessage }
  | { ok: false; id: string | undefined; message: string };

// The client's message ID, if it can be read safely, so error replies can point to it.
function readMessageId(value: unknown): string | undefined {
  if (typeof value !== 'object' || value === null) {
    return undefined;
  }

  const id = (value as Record<string, unknown>)['id'];

  return typeof id === 'string' && id.length > 0 && id.length <= 64 ? id : undefined;
}

export function parseClientMessage(raw: string): ParseResult {
  let value: unknown;

  try {
    value = JSON.parse(raw);
  } catch {
    return { ok: false, id: undefined, message: 'Messages must be JSON.' };
  }

  if (clientMessageValidator.Check(value)) {
    return { ok: true, message: value };
  }

  const id = readMessageId(value);
  const type =
    typeof value === 'object' && value !== null
      ? (value as Record<string, unknown>)['type']
      : undefined;

  if (typeof type !== 'string' || !CLIENT_MESSAGE_TYPES.includes(type)) {
    return { ok: false, id, message: 'Unknown message type.' };
  }

  return { ok: false, id, message: 'Invalid message.' };
}

function timestamp(): string {
  return new Date().toISOString();
}

export function subscribedMessage(type: 'subscribed' | 'unsubscribed', id: string, topic: string) {
  return { type, id, topic, version: PROTOCOL_VERSION, timestamp: timestamp() };
}

export function errorMessage(code: ProtocolErrorCode, message: string, id?: string) {
  return {
    type: 'error',
    ...(id === undefined ? {} : { id }),
    code,
    message,
    timestamp: timestamp(),
  };
}

export function eventMessage(topic: string, event: string, payload: unknown) {
  return {
    type: 'event',
    topic,
    event,
    version: PROTOCOL_VERSION,
    timestamp: timestamp(),
    payload,
  };
}
