import type { FastifyReply, FastifyRequest } from 'fastify';
import { grpcDeadlinesMs } from '../../transport/grpc/deadlines.js';

import type {
  KycSubmitBody,
  KycSubmitResponse,
  KycUploadUrlBody,
  KycUploadUrlResponse,
} from './schemas.js';

import { mapKycSubmitResponse, mapKycUploadUrlResponse } from './mapper.js';

export async function createKycUploadUrlHandler(
  request: FastifyRequest<{ Body: KycUploadUrlBody }>,
): Promise<KycUploadUrlResponse> {
  const result = await request.server.grpcClients.auth.createKycUploadUrl(
    { contentType: request.body.contentType, sizeBytes: BigInt(request.body.sizeBytes) },
    grpcDeadlinesMs.authCreateKycUploadUrl,
  );

  return mapKycUploadUrlResponse(result);
}

export async function submitKycHandler(
  request: FastifyRequest<{ Body: KycSubmitBody }>,
  reply: FastifyReply,
): Promise<KycSubmitResponse> {
  // The body schema guarantees YYYY-MM-DD; the proto expects google.type.Date.
  const [year = 0, month = 0, day = 0] = request.body.dateOfBirth.split('-').map(Number);

  const result = await request.server.grpcClients.auth.submitKyc(
    {
      fullName: request.body.fullName,
      dateOfBirth: { year, month, day },
      dubaiId: request.body.dubaiId,
      documentPath: request.body.documentPath,
    },
    grpcDeadlinesMs.authSubmitKyc,
  );

  reply.code(201);

  return mapKycSubmitResponse(result);
}
