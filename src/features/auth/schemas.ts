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
