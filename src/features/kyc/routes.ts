import type { TypeBoxTypeProvider } from '@fastify/type-provider-typebox';
import type { FastifyInstance } from 'fastify';

import { createKycNicOcrHandler, createKycUploadUrlHandler, submitKycHandler } from './handler.js';
import {
  kycNicOcrBodySchema,
  kycNicOcrResponseSchema,
  kycSubmitBodySchema,
  kycSubmitResponseSchema,
  kycUploadUrlBodySchema,
  kycUploadUrlResponseSchema,
} from './schemas.js';

export async function registerKycRoutes(app: FastifyInstance): Promise<void> {
  const router = app.withTypeProvider<TypeBoxTypeProvider>();

  router.post(
    '/api/v1/kyc/extract-nic-ocr',
    {
      config: {
        rateLimit: 'auth-kyc-nic-ocr',
        auth: 'required',
      },
      schema: {
        body: kycNicOcrBodySchema,
        response: {
          200: kycNicOcrResponseSchema,
        },
      },
    },
    createKycNicOcrHandler,
  );

  router.post(
    '/api/v1/kyc/upload-url',
    {
      config: {
        rateLimit: 'auth-kyc-upload-url',
        auth: 'required',
      },
      schema: {
        body: kycUploadUrlBodySchema,
        response: {
          200: kycUploadUrlResponseSchema,
        },
      },
    },
    createKycUploadUrlHandler,
  );

  router.post(
    '/api/v1/kyc',
    {
      config: {
        rateLimit: 'auth-kyc-submit',
        auth: 'required',
      },
      schema: {
        body: kycSubmitBodySchema,
        response: {
          201: kycSubmitResponseSchema,
        },
      },
    },
    submitKycHandler,
  );
}
