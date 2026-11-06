import { createClient, type Client, type Transport } from '@connectrpc/connect';
import { IotService } from '@p2p-energy-trading-platform/typescript-sdk/gen/gridx/iot/v1/iot_pb';
import type { FastifyBaseLogger } from 'fastify';

import { DEFAULT_GRPC_TIMEOUT_MS } from '../deadlines.js';
import { toAppError } from '../errors.js';

type IotClient = Client<typeof IotService>;

export class IotGrpcClient {
  private readonly client: IotClient;
  private readonly log: FastifyBaseLogger;
  private readonly defaultTimeoutMs: number;

  constructor(
    transport: Transport,
    log: FastifyBaseLogger,
    defaultTimeoutMs = DEFAULT_GRPC_TIMEOUT_MS,
  ) {
    this.client = createClient(IotService, transport);
    this.log = log;
    this.defaultTimeoutMs = defaultTimeoutMs;
  }

  async listHouses(
    params: Parameters<IotClient['listHouses']>[0],
    timeoutMs = this.defaultTimeoutMs,
  ) {
    try {
      return await this.client.listHouses(params, { timeoutMs });
    } catch (err) {
      this.log.error({ err }, 'Failed to list houses');
      throw toAppError(err);
    }
  }

  async getHouse(params: Parameters<IotClient['getHouse']>[0], timeoutMs = this.defaultTimeoutMs) {
    try {
      return await this.client.getHouse(params, { timeoutMs });
    } catch (err) {
      throw toAppError(err);
    }
  }

  async getLatestReading(
    params: Parameters<IotClient['getLatestReading']>[0],
    timeoutMs = this.defaultTimeoutMs,
  ) {
    try {
      return await this.client.getLatestReading(params, { timeoutMs });
    } catch (err) {
      throw toAppError(err);
    }
  }

  async getEnergySeries(
    params: Parameters<IotClient['getEnergySeries']>[0],
    timeoutMs = this.defaultTimeoutMs,
  ) {
    try {
      return await this.client.getEnergySeries(params, { timeoutMs });
    } catch (err) {
      throw toAppError(err);
    }
  }

  async getEnergySummary(
    params: Parameters<IotClient['getEnergySummary']>[0],
    timeoutMs = this.defaultTimeoutMs,
  ) {
    try {
      return await this.client.getEnergySummary(params, { timeoutMs });
    } catch (err) {
      throw toAppError(err);
    }
  }
}
