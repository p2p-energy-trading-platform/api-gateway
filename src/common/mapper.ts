import { KycState } from '@p2p-energy-trading-platform/typescript-sdk/gen/gridx/auth/v1/auth_pb';

export type MappedKycState = 'PENDING' | 'VERIFIED' | 'REJECTED';

export function mapKycState(state: KycState): MappedKycState | undefined {
  switch (state) {
    case KycState.PENDING:
      return 'PENDING';
    case KycState.VERIFIED:
      return 'VERIFIED';
    case KycState.REJECTED:
      return 'REJECTED';
    case KycState.UNSPECIFIED:
    default:
      return undefined;
  }
}
