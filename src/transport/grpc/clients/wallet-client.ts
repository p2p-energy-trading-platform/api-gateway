import { createClient, type Client, type Transport } from '@connectrpc/connect';
import { WalletService } from '@p2p-energy-trading-platform/typescript-sdk/gen/gridx/billing/v1/wallet_pb';
import type { FastifyBaseLogger } from 'fastify';

import { DEFAULT_GRPC_TIMEOUT_MS } from '../deadlines.js';
import { toAppError } from '../errors.js';

type WalletClient = Client<typeof WalletService>;

/*
 * billing-wallet-service reads the caller from the x-gridx-user-id metadata, which the header
 * propagation interceptor sets from the verified access token.
 */
export class WalletGrpcClient {
  private readonly client: WalletClient;
  private readonly log: FastifyBaseLogger;
  private readonly defaultTimeoutMs: number;

  constructor(
    transport: Transport,
    log: FastifyBaseLogger,
    defaultTimeoutMs = DEFAULT_GRPC_TIMEOUT_MS,
  ) {
    this.client = createClient(WalletService, transport);
    this.log = log;
    this.defaultTimeoutMs = defaultTimeoutMs;
  }

  async getWallet(timeoutMs = this.defaultTimeoutMs) {
    try {
      return await this.client.getWallet({}, { timeoutMs });
    } catch (err) {
      this.log.error({ err }, 'Failed to get wallet');
      throw toAppError(err);
    }
  }
}
