import {
  KycState,
  type GetUserResponse,
  type RegisterResponse as GrpcRegisterResponse,
} from '@p2p-energy-trading-platform/typescript-sdk/gen/gridx/auth/v1/auth_pb';

import type { RegisterResponse } from './schemas.js';
import type { LoginResponse, MeResponse } from './schemas.js';
import { timestampDate } from '@bufbuild/protobuf/wkt';

export function mapRegisterResponse(result: GrpcRegisterResponse): RegisterResponse {
  return {
    userId: result.userId,
    email: result.email,
    status: result.status,
    createdAt: result.createdAtTime
      ? timestampDate(result.createdAtTime).toISOString()
      : new Date().toISOString(),
  };
}

export function mapLoginResponse(result: { userId: string; email: string }): LoginResponse {
  return { userId: result.userId, email: result.email };
}

function mapKycStatus(state: KycState): MeResponse['kycStatus'] {
  switch (state) {
    case KycState.PENDING:
      return 'pending';
    case KycState.VERIFIED:
      return 'verified';
    case KycState.REJECTED:
      return 'rejected';
    case KycState.UNSPECIFIED:
    default:
      // Treat an unspecified KYC state as no KYC submission.
      return 'none';
  }
}

export function mapMeResponse(result: GetUserResponse): MeResponse {
  return {
    userId: result.userId,
    email: result.email,
    name: result.name,
    status: result.status,
    role: result.role,
    kycStatus: mapKycStatus(result.kycState),
  };
}

export interface ProfileView {
  userId: string;
  email: string;
  name: string;
  status: string;
  createdAt: string;
}

export function mapProfileResponse(profile: ProfileView | undefined): ProfileView {
  if (profile === undefined) {
    throw new Error('Auth Service returned an empty profile');
  }

  return {
    userId: profile.userId,
    email: profile.email,
    name: profile.name,
    status: profile.status,
    createdAt: profile.createdAt,
  };
}
