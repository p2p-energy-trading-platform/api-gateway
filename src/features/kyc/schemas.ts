import { Type, type Static } from 'typebox';

import { strictObject } from '../../common/validation.js';

export const kycUploadUrlBodySchema = strictObject({
  contentType: Type.Union([
    Type.Literal('image/jpeg'),
    Type.Literal('image/png'),
    Type.Literal('application/pdf'),
  ]),
  sizeBytes: Type.Integer({ minimum: 1, maximum: 10 * 1024 * 1024 }),
});

export const kycUploadUrlResponseSchema = strictObject({
  uploadUrl: Type.String({ format: 'uri' }),
  objectKey: Type.String(),
  expiresIn: Type.Number({ minimum: 1 }),
});

export type KycUploadUrlBody = Static<typeof kycUploadUrlBodySchema>;
export type KycUploadUrlResponse = Static<typeof kycUploadUrlResponseSchema>;
