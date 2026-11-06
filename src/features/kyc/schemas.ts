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

export const kycNicOcrBodySchema = strictObject({
  objectKey: Type.String({ minLength: 1, maxLength: 512 }),
});

export const kycNicOcrResponseSchema = strictObject({
  fullName: Type.String({ maxLength: 255 }),
  dateOfBirth: Type.Union([Type.Literal(''), Type.String({ format: 'date' })]),
  nicNumber: Type.String({ maxLength: 20 }),
});

export type KycNicOcrBody = Static<typeof kycNicOcrBodySchema>;
export type KycNicOcrResponse = Static<typeof kycNicOcrResponseSchema>;

export type KycUploadUrlBody = Static<typeof kycUploadUrlBodySchema>;
export type KycUploadUrlResponse = Static<typeof kycUploadUrlResponseSchema>;

export const kycSubmitBodySchema = strictObject({
  fullName: Type.String({ minLength: 1, maxLength: 255 }),
  dateOfBirth: Type.String({ format: 'date' }),
  nicNumber: Type.String({ pattern: '^(?:\\d{12}|\\d{9}[VvXx])$', minLength: 10, maxLength: 12 }),
  documentPath: Type.String({ minLength: 1, maxLength: 512 }),
});

export const kycSubmitResponseSchema = strictObject({
  id: Type.String(),
  state: Type.Union([Type.Literal('PENDING'), Type.Literal('VERIFIED'), Type.Literal('REJECTED')]),
  rejectionReason: Type.Optional(Type.String()),
  createdAt: Type.String({ format: 'date-time' }),
  updatedAt: Type.String({ format: 'date-time' }),
});

export type KycSubmitBody = Static<typeof kycSubmitBodySchema>;
export type KycSubmitResponse = Static<typeof kycSubmitResponseSchema>;
