import { Type, type Static } from 'typebox';

import { emailSchema, strictObject } from '../../common/validation.js';

export const registerBodySchema = strictObject({
  email: emailSchema,
  password: Type.String({ minLength: 8, maxLength: 128 }),
});

export const registerResponseSchema = strictObject({
  userId: Type.String(),
  email: Type.String(),
  status: Type.String(),
  createdAt: Type.String(),
});

export type RegisterBody = Static<typeof registerBodySchema>;

export type RegisterResponse = Static<typeof registerResponseSchema>;

export const loginBodySchema = strictObject({
  email: emailSchema,
  password: Type.String({ minLength: 1, maxLength: 128 }),
});

export const loginResponseSchema = strictObject({
  userId: Type.String(),
  email: Type.String(),
});

export const meResponseSchema = strictObject({
  userId: Type.String(),
  email: Type.String(),
  status: Type.String(),
  role: Type.String(),
});

export type LoginBody = Static<typeof loginBodySchema>;

export type LoginResponse = Static<typeof loginResponseSchema>;

export type MeResponse = Static<typeof meResponseSchema>;
