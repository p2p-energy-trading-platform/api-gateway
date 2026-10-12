import type { CreateKycUploadUrlResponse as GrpcCreateKycUploadUrlResponse } from '@p2p-energy-trading-platform/typescript-sdk/gen/gridx/auth/v1/auth_pb';
import type { KycUploadUrlResponse } from './schemas.js';

export function mapKycUploadUrlResponse(
  result: GrpcCreateKycUploadUrlResponse,
): KycUploadUrlResponse {
  return {
    uploadUrl: result.uploadUrl,
    objectKey: result.objectKey,
    expiresIn: Number(result.expiresIn),
  };
}
