import type { RegisterResponse } from './schemas.js';

interface RegisterResult {
  userId: string;
  email: string;
  status: string;
  createdAt: string;
}

export function mapRegisterResponse(result: RegisterResult): RegisterResponse {
  return {
    userId: result.userId,
    email: result.email,
    status: result.status,
    createdAt: result.createdAt,
  };
}
