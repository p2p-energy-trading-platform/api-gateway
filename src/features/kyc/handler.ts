import type { FastifyRequest } from 'fastify';
import { grpcDeadlinesMs } from '../../transport/grpc/deadlines.js';

import type { KycUploadUrlBody, KycUploadUrlResponse } from './schemas.js';

import { mapKycUploadUrlResponse } from './mapper.js';

export async function createKycUploadUrlHandler(
  request: FastifyRequest<{ Body: KycUploadUrlBody }>,
): Promise<KycUploadUrlResponse> {
  const result = await request.server.grpcClients.auth.createKycUploadUrl(
    { contentType: request.body.contentType, sizeBytes: BigInt(request.body.sizeBytes) },
    grpcDeadlinesMs.authCreateKycUploadUrl,
  );

  return mapKycUploadUrlResponse(result);
}
