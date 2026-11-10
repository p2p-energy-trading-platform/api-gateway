import { KycState } from '@p2p-energy-trading-platform/typescript-sdk/gen/gridx/auth/v1/auth_pb';
import { describe, expect, it } from 'vitest';

import { mapKycState } from '../../src/common/mapper.js';

describe('mapKycState', () => {
  it.each([
    [KycState.PENDING, 'PENDING'],
    [KycState.VERIFIED, 'VERIFIED'],
    [KycState.REJECTED, 'REJECTED'],
  ] as const)('maps KYC state %s to %s', (state, expected) => {
    expect(mapKycState(state)).toBe(expected);
  });

  it('returns undefined for an unspecified state', () => {
    expect(mapKycState(KycState.UNSPECIFIED)).toBeUndefined();
  });

  it('returns undefined for an unknown state', () => {
    expect(mapKycState(999 as KycState)).toBeUndefined();
  });
});
