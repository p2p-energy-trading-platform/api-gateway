import type { RegisterResponse as GrpcRegisterResponse } from '@p2p-energy-trading-platform/typescript-sdk/gen/gridx/auth/v1/auth_pb';

import type { RegisterResponse } from './schemas.js';
import type { LoginResponse, MeResponse } from './schemas.js';

export function mapRegisterResponse(result: GrpcRegisterResponse): RegisterResponse {
  return {
    userId: result.userId,
    email: result.email,
    status: result.status,
    createdAt: result.createdAt,
  };
}

export function mapLoginResponse(result: { userId: string; email: string }): LoginResponse {
  return { userId: result.userId, email: result.email };
}

export function mapMeResponse(result: MeResponse): MeResponse {
  return {
    userId: result.userId,
    email: result.email,
    status: result.status,
    role: result.role,
  };
}
