import { timestampDate } from '@bufbuild/protobuf/wkt';
import {
  KycState,
  type CreateKycUploadUrlResponse as GrpcCreateKycUploadUrlResponse,
  type SubmitKycResponse as GrpcSubmitKycResponse,
} from '@p2p-energy-trading-platform/typescript-sdk/gen/gridx/auth/v1/auth_pb';

import { AppError } from '../../errors/app-error.js';
import type { KycSubmitResponse, KycUploadUrlResponse } from './schemas.js';

const KYC_STATE_NAMES: Partial<Record<KycState, KycSubmitResponse['state']>> = {
  [KycState.PENDING]: 'PENDING',
  [KycState.VERIFIED]: 'VERIFIED',
  [KycState.REJECTED]: 'REJECTED',
};

export function mapKycUploadUrlResponse(
  result: GrpcCreateKycUploadUrlResponse,
): KycUploadUrlResponse {
  return {
    uploadUrl: result.uploadUrl,
    objectKey: result.objectKey,
    expiresIn: Number(result.expiresIn),
  };
}

export function mapKycSubmitResponse(result: GrpcSubmitKycResponse): KycSubmitResponse {
  const submission = result.submission;
  const state = submission ? KYC_STATE_NAMES[submission.state] : undefined;

  // auth-service always returns a full submission; anything else is an upstream bug.
  if (!submission || !state || !submission.createdAt || !submission.updatedAt) {
    throw new AppError('INTERNAL_ERROR');
  }

  return {
    id: submission.id,
    state,
    ...(submission.rejectionReason ? { rejectionReason: submission.rejectionReason } : {}),
    createdAt: timestampDate(submission.createdAt).toISOString(),
    updatedAt: timestampDate(submission.updatedAt).toISOString(),
  };
}
