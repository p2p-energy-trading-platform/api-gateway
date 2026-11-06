import { timestampDate } from '@bufbuild/protobuf/wkt';
import {
  WalletStatus,
  type GetWalletResponse as GrpcGetWalletResponse,
} from '@p2p-energy-trading-platform/typescript-sdk/gen/gridx/billing/v1/wallet_pb';

import { AppError } from '../../errors/app-error.js';
import type { WalletResponse } from './schemas.js';

const WALLET_STATUS_NAMES: Partial<Record<WalletStatus, WalletResponse['status']>> = {
  [WalletStatus.ACTIVE]: 'active',
  [WalletStatus.FROZEN]: 'frozen',
  [WalletStatus.CLOSED]: 'closed',
};

// billing-wallet-service always sets these; anything else is an upstream bug.
function required<T>(value: T | undefined): T {
  if (value === undefined) {
    throw new AppError('INTERNAL_ERROR');
  }
  return value;
}

// Fails rather than returning a silently rounded balance.
function safeAmount(amount: bigint): number {
  const value = Number(amount);

  if (!Number.isSafeInteger(value)) {
    throw new AppError('INTERNAL_ERROR');
  }
  return value;
}

export function mapGetWalletResponse(result: GrpcGetWalletResponse): WalletResponse {
  const wallet = required(result.wallet);

  return {
    walletId: wallet.walletId,
    userId: wallet.userId,
    available: safeAmount(wallet.available),
    reserved: safeAmount(wallet.reserved),
    total: safeAmount(wallet.total),
    status: required(WALLET_STATUS_NAMES[wallet.status]),
    updatedAt: timestampDate(required(wallet.updatedAt)).toISOString(),
  };
}
