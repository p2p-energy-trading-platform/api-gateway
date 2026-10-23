import { randomUUID } from 'node:crypto';

import { create } from '@bufbuild/protobuf';
import { timestampFromDate } from '@bufbuild/protobuf/wkt';
import { Code, ConnectError, type ServiceImpl } from '@connectrpc/connect';
import {
  type AuthService,
  KycState,
  KycSubmissionSchema,
} from '@p2p-energy-trading-platform/typescript-sdk/gen/gridx/auth/v1/auth_pb';
import type { FastifyInstance } from 'fastify';
import { afterEach, describe, expect, it } from 'vitest';

import { buildApp } from '../../src/app.js';
import { startFakeAuthService, type FakeAuthService } from '../helpers/fake-auth-service.js';
import {
  signAccessToken,
  startFakeJwks,
  TEST_AUDIENCE,
  TEST_ISSUER,
  type FakeJwks,
} from '../helpers/fake-jwks.js';
import { testConfig } from '../helpers/test-config.js';

const OCR_URL = '/api/v1/kyc/extract-nic-ocr';
const UPLOAD_URL = '/api/v1/kyc/upload-url';
const SUBMIT_URL = '/api/v1/kyc';
const USER_ID = 'kyc-user-1';
const OBJECT_KEY = `kyc/${USER_ID}/3f1c2b9e-8d4a-4c5e-9b1a-2e7f6d5c4b3a.jpg`;

const VALID_UPLOAD_BODY = { contentType: 'image/jpeg', sizeBytes: 2048 };
const VALID_SUBMIT_BODY = {
  fullName: 'Jane Doe',
  dateOfBirth: '1998-04-12',
  nicNumber: '199812345678',
  documentPath: OBJECT_KEY,
};

interface ReceivedCall {
  userId: string | null;
  request: Record<string, unknown>;
}

type KycImplementation = Pick<
  ServiceImpl<typeof AuthService>,
  'createKycUploadUrl' | 'extractKycNicOcr' | 'submitKyc'
>;

function submission(state: KycState = KycState.PENDING, rejectionReason = '') {
  return create(KycSubmissionSchema, {
    id: 'kyc-123',
    userId: USER_ID,
    fullName: VALID_SUBMIT_BODY.fullName,
    dateOfBirth: { year: 1998, month: 4, day: 12 },
    nicNumber: VALID_SUBMIT_BODY.nicNumber,
    documentPath: OBJECT_KEY,
    state,
    rejectionReason,
    createdAt: timestampFromDate(new Date('2026-10-13T10:00:00Z')),
    updatedAt: timestampFromDate(new Date('2026-10-13T10:00:00Z')),
  });
}

/*
 * POST /api/v1/kyc/upload-url and POST /api/v1/kyc against a fake auth-service.
 * Needs Redis, like other tests that register the infrastructure plugins.
 */
describe('KYC routes', () => {
  let app: FastifyInstance | undefined;
  let fake: FakeAuthService | undefined;
  let jwks: FakeJwks | undefined;
  let received: ReceivedCall[] = [];

  async function setup(implementation: Partial<KycImplementation> = {}) {
    received = [];
    jwks = await startFakeJwks();
    fake = await startFakeAuthService({
      extractKycNicOcr: async (req, context) => {
        received.push({
          userId: context.requestHeader.get('x-gridx-user-id'),
          request: { objectKey: req.objectKey },
        });

        if (implementation.extractKycNicOcr) {
          return implementation.extractKycNicOcr(req, context);
        }

        return {
          fullName: 'Jane Doe',
          dateOfBirth: { year: 1998, month: 4, day: 12 },
          nicNumber: '199812345678',
        };
      },
      createKycUploadUrl: async (req, context) => {
        received.push({
          userId: context.requestHeader.get('x-gridx-user-id'),
          request: { contentType: req.contentType, sizeBytes: req.sizeBytes },
        });

        if (implementation.createKycUploadUrl) {
          return implementation.createKycUploadUrl(req, context);
        }

        return {
          uploadUrl: `http://localhost:9000/gridx-kyc/${OBJECT_KEY}?X-Amz-Signature=abc`,
          objectKey: OBJECT_KEY,
          expiresIn: 300n,
        };
      },
      submitKyc: async (req, context) => {
        received.push({
          userId: context.requestHeader.get('x-gridx-user-id'),
          request: {
            fullName: req.fullName,
            dateOfBirth: req.dateOfBirth
              ? {
                  year: req.dateOfBirth.year,
                  month: req.dateOfBirth.month,
                  day: req.dateOfBirth.day,
                }
              : undefined,
            nicNumber: req.nicNumber,
            documentPath: req.documentPath,
          },
        });

        if (implementation.submitKyc) {
          return implementation.submitKyc(req, context);
        }

        return { submission: submission() };
      },
    });

    app = await buildApp({
      config: {
        ...testConfig,
        auth: {
          ...testConfig.auth,
          issuer: TEST_ISSUER,
          audience: TEST_AUDIENCE,
          jwksUri: jwks.url,
        },
        grpc: { ...testConfig.grpc, authServiceUrl: fake.url },
        // Fresh rate-limit keys for every test.
        rateLimit: { hashSecret: randomUUID() },
      },
      registerInfrastructure: true,
    });

    return app;
  }

  async function authHeaders() {
    if (jwks === undefined) {
      throw new Error('Test JWKS is not initialized');
    }

    return { authorization: `Bearer ${await signAccessToken(jwks.key, { subject: USER_ID })}` };
  }

  afterEach(async () => {
    await app?.close();
    await fake?.close();
    await jwks?.close();
    app = undefined;
    fake = undefined;
    jwks = undefined;
  });

  describe('POST /api/v1/kyc/extract-nic-ocr', () => {
    it('returns OCR suggestions for the authenticated user document', async () => {
      const instance = await setup();

      const response = await instance.inject({
        method: 'POST',
        url: OCR_URL,
        headers: await authHeaders(),
        payload: { objectKey: OBJECT_KEY },
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({
        fullName: 'Jane Doe',
        dateOfBirth: '1998-04-12',
        nicNumber: '199812345678',
      });
      expect(received).toEqual([{ userId: USER_ID, request: { objectKey: OBJECT_KEY } }]);
    });

    it('returns 401 without an access token', async () => {
      const instance = await setup();

      const response = await instance.inject({
        method: 'POST',
        url: OCR_URL,
        payload: { objectKey: OBJECT_KEY },
      });

      expect(response.statusCode).toBe(401);
      expect(received).toHaveLength(0);
    });

    it.each([
      ['day beyond the end of February', { year: 1998, month: 2, day: 31 }],
      ['29 February in a non-leap year', { year: 2023, month: 2, day: 29 }],
      ['month outside the calendar', { year: 1998, month: 13, day: 1 }],
      ['day zero', { year: 1998, month: 4, day: 0 }],
    ])('returns an empty date for OCR output with %s', async (_case, dateOfBirth) => {
      const instance = await setup({
        extractKycNicOcr: () => ({
          fullName: 'Jane Doe',
          dateOfBirth,
          nicNumber: '199812345678',
        }),
      });

      const response = await instance.inject({
        method: 'POST',
        url: OCR_URL,
        headers: await authHeaders(),
        payload: { objectKey: OBJECT_KEY },
      });

      expect(response.statusCode).toBe(200);
      expect(response.json().dateOfBirth).toBe('');
    });

    it('returns 400 for an invalid body without calling auth-service', async () => {
      const instance = await setup();

      const response = await instance.inject({
        method: 'POST',
        url: OCR_URL,
        headers: await authHeaders(),
        payload: { objectKey: OBJECT_KEY, userId: 'someone-else' },
      });

      expect(response.statusCode).toBe(400);
      expect(response.json().error.code).toBe('VALIDATION_ERROR');
      expect(received).toHaveLength(0);
    });
  });

  describe('POST /api/v1/kyc/upload-url', () => {
    it('returns a presigned upload URL and forwards the authenticated user', async () => {
      const instance = await setup();

      const response = await instance.inject({
        method: 'POST',
        url: UPLOAD_URL,
        headers: await authHeaders(),
        payload: VALID_UPLOAD_BODY,
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({
        uploadUrl: `http://localhost:9000/gridx-kyc/${OBJECT_KEY}?X-Amz-Signature=abc`,
        objectKey: OBJECT_KEY,
        expiresIn: 300,
      });
      expect(received).toEqual([
        { userId: USER_ID, request: { contentType: 'image/jpeg', sizeBytes: 2048n } },
      ]);
    });

    it('returns 401 without an access token', async () => {
      const instance = await setup();

      const response = await instance.inject({
        method: 'POST',
        url: UPLOAD_URL,
        payload: VALID_UPLOAD_BODY,
      });

      expect(response.statusCode).toBe(401);
      expect(received).toHaveLength(0);
    });

    it.each([
      ['an unsupported content type', { ...VALID_UPLOAD_BODY, contentType: 'text/html' }],
      ['a fractional size', { ...VALID_UPLOAD_BODY, sizeBytes: 1.5 }],
      ['an empty file', { ...VALID_UPLOAD_BODY, sizeBytes: 0 }],
      ['a file over 10 MB', { ...VALID_UPLOAD_BODY, sizeBytes: 10 * 1024 * 1024 + 1 }],
      ['an unknown field', { ...VALID_UPLOAD_BODY, fileName: 'id.jpg' }],
    ])('returns 400 for %s without calling auth-service', async (_case, payload) => {
      const instance = await setup();

      const response = await instance.inject({
        method: 'POST',
        url: UPLOAD_URL,
        headers: await authHeaders(),
        payload,
      });

      expect(response.statusCode).toBe(400);
      expect(response.json().error.code).toBe('VALIDATION_ERROR');
      expect(received).toHaveLength(0);
    });

    it('returns 409 when auth-service refuses because KYC is already verified', async () => {
      const instance = await setup({
        createKycUploadUrl: () => {
          throw new ConnectError('Invalid onboarding state transition', Code.AlreadyExists);
        },
      });

      const response = await instance.inject({
        method: 'POST',
        url: UPLOAD_URL,
        headers: await authHeaders(),
        payload: VALID_UPLOAD_BODY,
      });

      expect(response.statusCode).toBe(409);
      expect(response.json().error.code).toBe('CONFLICT');
    });
  });

  describe('POST /api/v1/kyc', () => {
    it('submits KYC for the authenticated user and returns the pending submission', async () => {
      const instance = await setup();

      const response = await instance.inject({
        method: 'POST',
        url: SUBMIT_URL,
        headers: await authHeaders(),
        payload: VALID_SUBMIT_BODY,
      });

      expect(response.statusCode).toBe(201);
      expect(response.json()).toEqual({
        id: 'kyc-123',
        state: 'PENDING',
        createdAt: '2026-10-13T10:00:00.000Z',
        updatedAt: '2026-10-13T10:00:00.000Z',
      });
      expect(received).toEqual([
        {
          userId: USER_ID,
          request: {
            fullName: 'Jane Doe',
            dateOfBirth: { year: 1998, month: 4, day: 12 },
            nicNumber: '199812345678',
            documentPath: OBJECT_KEY,
          },
        },
      ]);
    });

    it('includes the rejection reason when auth-service returns one', async () => {
      const instance = await setup({
        submitKyc: () => ({ submission: submission(KycState.REJECTED, 'Document unreadable') }),
      });

      const response = await instance.inject({
        method: 'POST',
        url: SUBMIT_URL,
        headers: await authHeaders(),
        payload: VALID_SUBMIT_BODY,
      });

      expect(response.statusCode).toBe(201);
      expect(response.json()).toMatchObject({
        state: 'REJECTED',
        rejectionReason: 'Document unreadable',
      });
    });

    it('returns 401 without an access token', async () => {
      const instance = await setup();

      const response = await instance.inject({
        method: 'POST',
        url: SUBMIT_URL,
        payload: VALID_SUBMIT_BODY,
      });

      expect(response.statusCode).toBe(401);
      expect(received).toHaveLength(0);
    });

    it.each([
      ['a missing document', { ...VALID_SUBMIT_BODY, documentPath: undefined }],
      ['an empty full name', { ...VALID_SUBMIT_BODY, fullName: '' }],
      ['a full name over 255 characters', { ...VALID_SUBMIT_BODY, fullName: 'x'.repeat(256) }],
      ['a badly formatted date', { ...VALID_SUBMIT_BODY, dateOfBirth: '12/04/1998' }],
      ['an unknown field', { ...VALID_SUBMIT_BODY, userId: 'someone-else' }],
    ])('returns 400 for %s without calling auth-service', async (_case, payload) => {
      const instance = await setup();

      const response = await instance.inject({
        method: 'POST',
        url: SUBMIT_URL,
        headers: await authHeaders(),
        payload,
      });

      expect(response.statusCode).toBe(400);
      expect(response.json().error.code).toBe('VALIDATION_ERROR');
      expect(received).toHaveLength(0);
    });

    it('returns 400 when auth-service rejects the document', async () => {
      const instance = await setup({
        submitKyc: () => {
          throw new ConnectError('ID document is invalid', Code.InvalidArgument);
        },
      });

      const response = await instance.inject({
        method: 'POST',
        url: SUBMIT_URL,
        headers: await authHeaders(),
        payload: VALID_SUBMIT_BODY,
      });

      expect(response.statusCode).toBe(400);
      expect(response.json().error.code).toBe('VALIDATION_ERROR');
    });

    it('returns 409 when KYC is already verified', async () => {
      const instance = await setup({
        submitKyc: () => {
          throw new ConnectError('Invalid onboarding state transition', Code.AlreadyExists);
        },
      });

      const response = await instance.inject({
        method: 'POST',
        url: SUBMIT_URL,
        headers: await authHeaders(),
        payload: VALID_SUBMIT_BODY,
      });

      expect(response.statusCode).toBe(409);
      expect(response.json().error.code).toBe('CONFLICT');
    });

    it('returns 500 when auth-service returns no submission', async () => {
      const instance = await setup({ submitKyc: () => ({}) });

      const response = await instance.inject({
        method: 'POST',
        url: SUBMIT_URL,
        headers: await authHeaders(),
        payload: VALID_SUBMIT_BODY,
      });

      expect(response.statusCode).toBe(500);
      expect(response.json().error.code).toBe('INTERNAL_ERROR');
    });
  });
});
