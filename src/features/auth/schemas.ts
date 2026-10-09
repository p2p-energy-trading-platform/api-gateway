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

export const loginBodySchema = strictObject(
  {
    email: emailSchema,
    password: {
      type: 'string',
      minLength: 1,
      maxLength: 128,
    },
  },
  ['email', 'password'],
);

export const loginResponseSchema = strictObject(
  {
    userId: { type: 'string' },
    email: { type: 'string' },
  },
  ['userId', 'email'],
);

export const meResponseSchema = strictObject(
  {
    userId: { type: 'string' },
    email: { type: 'string' },
    status: { type: 'string' },
    role: { type: 'string' },
  },
  ['userId', 'email', 'status', 'role'],
);

export interface LoginBody {
  email: string;
  password: string;
}

export interface LoginResponse {
  userId: string;
  email: string;
}

export interface MeResponse {
  userId: string;
  email: string;
  status: string;
  role: string;
}
