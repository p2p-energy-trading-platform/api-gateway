import type { FastifyReply, FastifyRequest } from 'fastify';
import { grpcDeadlinesMs } from '../../transport/grpc/deadlines.js';

import type {
  KycNicOcrBody,
  KycNicOcrResponse,
  KycSubmitBody,
  KycSubmitResponse,
  KycUploadUrlBody,
  KycUploadUrlResponse,
} from './schemas.js';

import { mapKycSubmitResponse, mapKycUploadUrlResponse } from './mapper.js';

export async function createKycNicOcrHandler(
  request: FastifyRequest<{ Body: KycNicOcrBody }>,
): Promise<KycNicOcrResponse> {
  const result = await request.server.grpcClients.auth.extractKycNicOcr(
    { objectKey: request.body.objectKey },
    grpcDeadlinesMs.authKycNicOcr,
  );

  const date = result.dateOfBirth;
  const dateOfBirth = (() => {
    if (
      !date ||
      !Number.isInteger(date.year) ||
      date.year < 1 ||
      date.year > 9999 ||
      !Number.isInteger(date.month) ||
      date.month < 1 ||
      date.month > 12 ||
      !Number.isInteger(date.day) ||
      date.day < 1
    ) {
      return '';
    }

    const isLeapYear = date.year % 4 === 0 && (date.year % 100 !== 0 || date.year % 400 === 0);
    const daysInMonth = [31, isLeapYear ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][
      date.month - 1
    ];

    if (daysInMonth === undefined || date.day > daysInMonth) {
      return '';
    }

    return `${String(date.year).padStart(4, '0')}-${String(date.month).padStart(2, '0')}-${String(date.day).padStart(2, '0')}`;
  })();

  return {
    fullName: result.fullName,
    dateOfBirth,
    nicNumber: result.nicNumber,
  };
}

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
      nicNumber: request.body.nicNumber,
      documentPath: request.body.documentPath,
    },
    grpcDeadlinesMs.authSubmitKyc,
  );

  reply.code(201);

  return mapKycSubmitResponse(result);
}
