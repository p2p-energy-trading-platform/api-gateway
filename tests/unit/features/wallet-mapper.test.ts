import { create } from '@bufbuild/protobuf';
import { timestampFromDate } from '@bufbuild/protobuf/wkt';
import {
  GetWalletResponseSchema,
  WalletStatus,
} from '@p2p-energy-trading-platform/typescript-sdk/gen/gridx/billing/v1/wallet_pb';
import { describe, expect, it } from 'vitest';

import { AppError } from '../../../src/errors/app-error.js';
import { mapGetWalletResponse } from '../../../src/features/wallet/mapper.js';

const UPDATED_AT = '2026-11-02T10:00:00.000Z';

function response(overrides: Record<string, unknown> = {}) {
  return create(GetWalletResponseSchema, {
    wallet: {
      walletId: 'wallet-1',
      userId: 'user-1',
      available: 700n,
      reserved: 300n,
      total: 1000n,
      status: WalletStatus.ACTIVE,
      updatedAt: timestampFromDate(new Date(UPDATED_AT)),
      ...overrides,
    },
  });
}

describe('mapGetWalletResponse', () => {
  it('maps a wallet, keeping amounts in minor units', () => {
    expect(mapGetWalletResponse(response())).toEqual({
      walletId: 'wallet-1',
      userId: 'user-1',
      available: 700,
      reserved: 300,
      total: 1000,
      status: 'active',
      updatedAt: UPDATED_AT,
    });
  });

  it.each([
    [WalletStatus.ACTIVE, 'active'],
    [WalletStatus.FROZEN, 'frozen'],
    [WalletStatus.CLOSED, 'closed'],
  ])('maps status %s to %s', (status, expected) => {
    expect(mapGetWalletResponse(response({ status })).status).toBe(expected);
  });

  it('maps the largest amount a JSON number holds exactly', () => {
    const largest = BigInt(Number.MAX_SAFE_INTEGER);

    expect(mapGetWalletResponse(response({ available: largest })).available).toBe(
      Number.MAX_SAFE_INTEGER,
    );
  });

  it('refuses an amount a JSON number cannot hold exactly, rather than rounding it', () => {
    const tooLarge = BigInt(Number.MAX_SAFE_INTEGER) + 1n;

    expect(() => mapGetWalletResponse(response({ available: tooLarge }))).toThrow(AppError);
    expect(() => mapGetWalletResponse(response({ reserved: tooLarge }))).toThrow(AppError);
    expect(() => mapGetWalletResponse(response({ total: tooLarge }))).toThrow(AppError);
  });

  it('treats a missing wallet as an upstream bug', () => {
    expect(() => mapGetWalletResponse(create(GetWalletResponseSchema, {}))).toThrow(AppError);
  });

  it('treats an unspecified status as an upstream bug', () => {
    expect(() => mapGetWalletResponse(response({ status: WalletStatus.UNSPECIFIED }))).toThrow(
      AppError,
    );
  });

  it('treats a missing timestamp as an upstream bug', () => {
    expect(() => mapGetWalletResponse(response({ updatedAt: undefined }))).toThrow(AppError);
  });
});
