import { timestampDate } from '@bufbuild/protobuf/wkt';
import {
  KycState,
  type CreateKycUploadUrlResponse as GrpcCreateKycUploadUrlResponse,
  type SubmitKycResponse as GrpcSubmitKycResponse,
  type GetKycSubmissionResponse as GrpcGetKycSubmissionResponse,
} from '@p2p-energy-trading-platform/typescript-sdk/gen/gridx/auth/v1/auth_pb';

import { AppError } from '../../errors/app-error.js';
import type {
  KycSubmissionViewResponse,
  KycSubmitResponse,
  KycUploadUrlResponse,
} from './schemas.js';

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

export function mapKycSubmissionViewResponse(
  result: GrpcGetKycSubmissionResponse,
): KycSubmissionViewResponse | null {
  const submission = result.submission;
  const state = submission ? KYC_STATE_NAMES[submission.state] : undefined;

  if (!submission) return null;
  if (!state || !submission.createdAt || !submission.updatedAt || !submission.dateOfBirth) {
    throw new AppError('INTERNAL_ERROR');
  }

  const { year, month, day } = submission.dateOfBirth;
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    !Number.isInteger(year) || year < 1 || year > 9999 ||
    !Number.isInteger(month) || month < 1 || month > 12 ||
    !Number.isInteger(day) || day < 1 || day > 31 ||
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    throw new AppError('INTERNAL_ERROR');
  }

  return {
    id: submission.id,
    fullName: submission.fullName,
    dateOfBirth: `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`,
    nicNumber: submission.nicNumber,
    state,
    ...(submission.rejectionReason ? { rejectionReason: submission.rejectionReason } : {}),
    createdAt: timestampDate(submission.createdAt).toISOString(),
    updatedAt: timestampDate(submission.updatedAt).toISOString(),
  };
}
