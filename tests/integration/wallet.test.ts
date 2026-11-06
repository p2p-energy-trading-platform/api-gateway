import { randomUUID } from 'node:crypto';

import { create } from '@bufbuild/protobuf';
import { timestampFromDate } from '@bufbuild/protobuf/wkt';
import { Code, ConnectError, type ServiceImpl } from '@connectrpc/connect';
import {
  GetWalletResponseSchema,
  type WalletService,
  WalletStatus,
} from '@p2p-energy-trading-platform/typescript-sdk/gen/gridx/billing/v1/wallet_pb';
import type { FastifyInstance } from 'fastify';
import { afterEach, describe, expect, it } from 'vitest';

import { buildApp } from '../../src/app.js';
import { startFakeWalletService, type FakeWalletService } from '../helpers/fake-wallet-service.js';
import {
  signAccessToken,
  startFakeJwks,
  TEST_AUDIENCE,
  TEST_ISSUER,
  type FakeJwks,
} from '../helpers/fake-jwks.js';
import { testConfig } from '../helpers/test-config.js';

const USER_ID = '3f1c8a52-6d0e-4f7a-9b21-5e8d7c6a4b10';
const ROUTE = '/api/v1/wallet';
const UPDATED_AT = '2026-11-02T10:00:00.000Z';

function walletResponse(status = WalletStatus.ACTIVE) {
  return create(GetWalletResponseSchema, {
    wallet: {
      walletId: 'wallet-1',
      userId: USER_ID,
      available: 700n,
      reserved: 300n,
      total: 1000n,
      status,
      updatedAt: timestampFromDate(new Date(UPDATED_AT)),
    },
  });
}

describe('wallet routes', () => {
  let app: FastifyInstance | undefined;
  let fake: FakeWalletService | undefined;
  let jwks: FakeJwks | undefined;

  async function startApp(
    getWallet: NonNullable<Partial<ServiceImpl<typeof WalletService>>['getWallet']>,
  ): Promise<FastifyInstance> {
    jwks = await startFakeJwks();
    fake = await startFakeWalletService({ getWallet });

    app = await buildApp({
      config: {
        ...testConfig,
        auth: {
          ...testConfig.auth,
          issuer: TEST_ISSUER,
          audience: TEST_AUDIENCE,
          jwksUri: jwks.url,
        },
        grpc: { ...testConfig.grpc, billingServiceUrl: fake.url },
        // Fresh rate-limit keys for every test.
        rateLimit: { hashSecret: randomUUID() },
      },
      registerInfrastructure: true,
    });

    return app;
  }

  async function getWalletAsUser(instance: FastifyInstance, url = ROUTE) {
    const token = await signAccessToken(jwks!.key, { subject: USER_ID });

    return instance.inject({ method: 'GET', url, headers: { authorization: `Bearer ${token}` } });
  }

  afterEach(async () => {
    await app?.close();
    await fake?.close();
    await jwks?.close();
    app = undefined;
    fake = undefined;
    jwks = undefined;
  });

  it('returns the wallet of the authenticated user', async () => {
    const instance = await startApp(async () => walletResponse());

    const response = await getWalletAsUser(instance);

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      walletId: 'wallet-1',
      userId: USER_ID,
      available: 700,
      reserved: 300,
      total: 1000,
      status: 'active',
      updatedAt: UPDATED_AT,
    });
  });

  it('tells billing who the caller is from the verified token', async () => {
    let forwardedUserId: string | null = null;
    const instance = await startApp(async (_req, ctx) => {
      forwardedUserId = ctx.requestHeader.get('x-gridx-user-id');
      return walletResponse();
    });

    await getWalletAsUser(instance);

    expect(forwardedUserId).toBe(USER_ID);
  });

  it('reports a frozen account', async () => {
    const instance = await startApp(async () => walletResponse(WalletStatus.FROZEN));

    const response = await getWalletAsUser(instance);

    expect(response.statusCode).toBe(200);
    expect(response.json().status).toBe('frozen');
  });

  it('requires an access token and never calls billing without one', async () => {
    let calls = 0;
    const instance = await startApp(async () => {
      calls += 1;
      return walletResponse();
    });

    const response = await instance.inject({ method: 'GET', url: ROUTE });

    expect(response.statusCode).toBe(401);
    expect(calls).toBe(0);
  });

  it('rejects unknown query parameters', async () => {
    const instance = await startApp(async () => walletResponse());

    const response = await getWalletAsUser(instance, `${ROUTE}?userId=someone-else`);

    expect(response.statusCode).toBe(400);
  });

  it.each([
    [Code.Unavailable, 503],
    [Code.DeadlineExceeded, 504],
    [Code.Internal, 500],
    [Code.Unauthenticated, 401],
  ])('maps gRPC code %s to HTTP %s', async (code, status) => {
    const instance = await startApp(async () => {
      throw new ConnectError('postgres://user:secret@db failed', code);
    });

    const response = await getWalletAsUser(instance);

    expect(response.statusCode).toBe(status);
    if (status >= 500) {
      expect(response.body).not.toContain('secret');
    }
  });

  it('returns 500 rather than a rounded balance when an amount is too large', async () => {
    const instance = await startApp(async () =>
      create(GetWalletResponseSchema, {
        wallet: {
          ...walletResponse().wallet,
          available: BigInt(Number.MAX_SAFE_INTEGER) + 1n,
        },
      }),
    );

    const response = await getWalletAsUser(instance);

    expect(response.statusCode).toBe(500);
  });
});
