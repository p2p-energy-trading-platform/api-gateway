import { createClient, type Client, type Transport } from '@connectrpc/connect';
import { AuthService } from '@p2p-energy-trading-platform/typescript-sdk/gen/gridx/auth/v1/auth_pb';
import { DEFAULT_GRPC_TIMEOUT_MS } from '../deadlines.js';
import { toAppError } from '../errors.js';

export class AuthGrpcClient {
  private readonly client: Client<typeof AuthService>;
  private readonly defaultTimeoutMs: number;

  constructor(transport: Transport, defaultTimeoutMs = DEFAULT_GRPC_TIMEOUT_MS) {
    this.client = createClient(AuthService, transport);
    this.defaultTimeoutMs = defaultTimeoutMs;
  }

  async login(
    params: Parameters<Client<typeof AuthService>['login']>[0],
    timeoutMs = this.defaultTimeoutMs,
  ) {
    try {
      return await this.client.login(params, { timeoutMs });
    } catch (err) {
      throw toAppError(err);
    }
  }

  async register(
    params: Parameters<Client<typeof AuthService>['register']>[0],
    timeoutMs = this.defaultTimeoutMs,
  ) {
    try {
      return await this.client.register(params, { timeoutMs });
    } catch (err) {
      throw toAppError(err);
    }
  }

  async refreshToken(
    params: Parameters<Client<typeof AuthService>['refreshToken']>[0],
    timeoutMs = this.defaultTimeoutMs,
  ) {
    try {
      return await this.client.refreshToken(params, { timeoutMs });
    } catch (err) {
      throw toAppError(err);
    }
  }

  async logout(
    params: Parameters<Client<typeof AuthService>['logout']>[0],
    timeoutMs = this.defaultTimeoutMs,
  ) {
    try {
      return await this.client.logout(params, { timeoutMs });
    } catch (err) {
      throw toAppError(err);
    }
  }

  async getUser(
    params: Parameters<Client<typeof AuthService>['getUser']>[0],
    timeoutMs = this.defaultTimeoutMs,
  ) {
    try {
      return await this.client.getUser(params, { timeoutMs });
    } catch (err) {
      throw toAppError(err);
    }
  }

  async checkPermission(
    params: Parameters<Client<typeof AuthService>['checkPermission']>[0],
    timeoutMs = this.defaultTimeoutMs,
  ) {
    try {
      return await this.client.checkPermission(params, { timeoutMs });
    } catch (err) {
      throw toAppError(err);
    }
  }
}
