import { create } from '@bufbuild/protobuf';
import { timestampFromDate } from '@bufbuild/protobuf/wkt';
import {
  KycState,
  KycSubmissionSchema,
  SubmitKycResponseSchema,
} from '@p2p-energy-trading-platform/typescript-sdk/gen/gridx/auth/v1/auth_pb';
import { describe, expect, it } from 'vitest';

import { AppError } from '../../../src/errors/app-error.js';
import { mapKycSubmitResponse } from '../../../src/features/kyc/mapper.js';

const CREATED_AT = timestampFromDate(new Date('2026-10-13T10:00:00Z'));
const UPDATED_AT = timestampFromDate(new Date('2026-10-13T11:00:00Z'));

function response(state: KycState = KycState.PENDING) {
  return create(SubmitKycResponseSchema, {
    submission: create(KycSubmissionSchema, {
      id: 'kyc-123',
      state,
      createdAt: CREATED_AT,
      updatedAt: UPDATED_AT,
    }),
  });
}

function expectInternalError(fn: () => unknown) {
  try {
    fn();
  } catch (err) {
    expect(err).toBeInstanceOf(AppError);
    expect((err as AppError).code).toBe('INTERNAL_ERROR');
    return;
  }

  throw new Error('expected an INTERNAL_ERROR AppError');
}

describe('mapKycSubmitResponse', () => {
  it.each([
    [KycState.PENDING, 'PENDING'],
    [KycState.VERIFIED, 'VERIFIED'],
    [KycState.REJECTED, 'REJECTED'],
  ] as const)('maps KYC state %s to %s', (state, expected) => {
    expect(mapKycSubmitResponse(response(state))).toEqual({
      id: 'kyc-123',
      state: expected,
      createdAt: '2026-10-13T10:00:00.000Z',
      updatedAt: '2026-10-13T11:00:00.000Z',
    });
  });

  it('rejects an unspecified KYC state', () => {
    expectInternalError(() => mapKycSubmitResponse(response(KycState.UNSPECIFIED)));
  });

  it('rejects a response without a submission', () => {
    expectInternalError(() => mapKycSubmitResponse(create(SubmitKycResponseSchema, {})));
  });

  it('rejects a submission without a creation timestamp', () => {
    const invalidResponse = create(SubmitKycResponseSchema, {
      submission: create(KycSubmissionSchema, {
        id: 'kyc-123',
        state: KycState.PENDING,
        updatedAt: UPDATED_AT,
      }),
    });

    expectInternalError(() => mapKycSubmitResponse(invalidResponse));
  });

  it('rejects a submission without an update timestamp', () => {
    const invalidResponse = create(SubmitKycResponseSchema, {
      submission: create(KycSubmissionSchema, {
        id: 'kyc-123',
        state: KycState.PENDING,
        createdAt: CREATED_AT,
      }),
    });

    expectInternalError(() => mapKycSubmitResponse(invalidResponse));
  });
});
