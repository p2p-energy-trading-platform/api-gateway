import type { RegisterResponse as GrpcRegisterResponse } from '@p2p-energy-trading-platform/typescript-sdk/gen/gridx/auth/v1/auth_pb';

import type { RegisterResponse } from './schemas.js';

export function mapRegisterResponse(result: GrpcRegisterResponse): RegisterResponse {
  return {
    userId: result.userId,
    email: result.email,
    status: result.status,
    createdAt: result.createdAt,
  };
}
