import type { RegisterResponse as GrpcRegisterResponse } from '@p2p-energy-trading-platform/typescript-sdk/gen/gridx/auth/v1/auth_pb';

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
    accessToken: result.accessToken,
    refreshToken: result.refreshToken,
    expiresIn: Number(result.expiresIn),
  };
}

export function mapLoginResponse(result: {
  userId: string;
  email: string;
  accessToken: string;
  refreshToken: string;
  expiresIn: bigint;
}): LoginResponse {
  return {
    userId: result.userId,
    email: result.email,
    accessToken: result.accessToken,
    refreshToken: result.refreshToken,
    expiresIn: Number(result.expiresIn),
  };
}

export function mapMeResponse(result: MeResponse): MeResponse {
  return {
    userId: result.userId,
    email: result.email,
    name: result.name,
    status: result.status,
    role: result.role,
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
