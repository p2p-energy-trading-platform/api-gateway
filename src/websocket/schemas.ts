import { Type, type Static } from 'typebox';

import { strictObject } from '../common/validation.js';


const messageId = Type.String({ minLength: 1, maxLength: 64 });
const topic = Type.String({ minLength: 1, maxLength: 100 });
const emptyPayload = Type.Optional(strictObject({}));

export const subscribeMessageSchema = strictObject({
  type: Type.Literal('subscribe'),
  id: messageId,
  topic,
  payload: emptyPayload,
});

export const unsubscribeMessageSchema = strictObject({
  type: Type.Literal('unsubscribe'),
  id: messageId,
  topic,
  payload: emptyPayload,
});

export const clientMessageSchema = Type.Union([subscribeMessageSchema, unsubscribeMessageSchema]);

export type ClientMessage = Static<typeof clientMessageSchema>;

export const CLIENT_MESSAGE_TYPES = ['subscribe', 'unsubscribe'];
