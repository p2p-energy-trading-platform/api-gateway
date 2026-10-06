import { emailSchema, strictObject } from '../../common/validation.js';

export const registerBodySchema = strictObject(
  {
    email: emailSchema,
    password: {
      type: 'string',
      minLength: 8,
      maxLength: 128,
    },
  },
  ['email', 'password'],
);

export const registerResponseSchema = strictObject(
  {
    userId: { type: 'string' },
    email: { type: 'string' },
    status: { type: 'string' },
    createdAt: { type: 'string' },
  },
  ['userId', 'email', 'status', 'createdAt'],
);

export interface RegisterBody {
  email: string;
  password: string;
}

export interface RegisterResponse {
  userId: string;
  email: string;
  status: string;
  createdAt: string;
}
