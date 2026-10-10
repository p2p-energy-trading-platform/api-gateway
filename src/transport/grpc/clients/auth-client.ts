import { createClient, type Client, type Transport } from '@connectrpc/connect';
import { AuthService } from '@p2p-energy-trading-platform/typescript-sdk/gen/gridx/auth/v1/auth_pb';
import { DEFAULT_GRPC_TIMEOUT_MS } from '../deadlines.js';
import { toAppError } from '../errors.js';
import type { FastifyBaseLogger } from 'fastify';

export class AuthGrpcClient {
  private readonly client: Client<typeof AuthService>;
  private log: FastifyBaseLogger;
  private readonly defaultTimeoutMs: number;

  constructor(
    transport: Transport,
    log: FastifyBaseLogger,
    defaultTimeoutMs = DEFAULT_GRPC_TIMEOUT_MS,
  ) {
    this.client = createClient(AuthService, transport);
    this.log = log;
    this.defaultTimeoutMs = defaultTimeoutMs;
  }

  async verifyEmail(
    params: Parameters<Client<typeof AuthService>['verifyEmail']>[0],
    timeoutMs = this.defaultTimeoutMs,
  ) {
    try {
      return await this.client.verifyEmail(params, { timeoutMs });
    } catch (err) {
      throw toAppError(err);
    }
  }

  async resendOtp(
    params: Parameters<Client<typeof AuthService>['resendOtp']>[0],
    timeoutMs = this.defaultTimeoutMs,
  ) {
    try {
      return await this.client.resendOtp(params, { timeoutMs });
    } catch (err) {
      throw toAppError(err);
    }
  }

  async login(
    params: Parameters<Client<typeof AuthService>['login']>[0],
    timeoutMs = this.defaultTimeoutMs,
  ) {
    try {
      return await this.client.login(params, { timeoutMs });
    } catch (err) {
      this.log.error({ err: err }, 'Failed to login');
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
      this.log.error({ err: err }, 'Failed to register');
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
      this.log.error({ err: err }, 'Failed to refresh token');
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
      this.log.error({ err: err }, 'Failed to logout');
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
      this.log.error({ err: err }, 'Failed to get user');
      throw toAppError(err);
    }
  }

  async getProfile(
    params: Parameters<Client<typeof AuthService>['getProfile']>[0],
    timeoutMs = this.defaultTimeoutMs,
  ) {
    try {
      return await this.client.getProfile(params, { timeoutMs });
    } catch (err) {
      throw toAppError(err);
    }
  }

  async updateProfile(
    params: Parameters<Client<typeof AuthService>['updateProfile']>[0],
    timeoutMs = this.defaultTimeoutMs,
  ) {
    try {
      return await this.client.updateProfile(params, { timeoutMs });
    } catch (err) {
      throw toAppError(err);
    }
  }

  async changePassword(
    params: Parameters<Client<typeof AuthService>['changePassword']>[0],
    timeoutMs = this.defaultTimeoutMs,
  ) {
    try {
      return await this.client.changePassword(params, { timeoutMs });
    } catch (err) {
      throw toAppError(err);
    }
  }

  async requestEmailChange(
    params: Parameters<Client<typeof AuthService>['requestEmailChange']>[0],
    timeoutMs = this.defaultTimeoutMs,
  ) {
    try {
      return await this.client.requestEmailChange(params, { timeoutMs });
    } catch (err) {
      throw toAppError(err);
    }
  }

  async verifyEmailChange(
    params: Parameters<Client<typeof AuthService>['verifyEmailChange']>[0],
    timeoutMs = this.defaultTimeoutMs,
  ) {
    try {
      return await this.client.verifyEmailChange(params, { timeoutMs });
    } catch (err) {
      throw toAppError(err);
    }
  }

  async requestPasswordReset(
    params: Parameters<Client<typeof AuthService>['requestPasswordReset']>[0],
    timeoutMs = this.defaultTimeoutMs,
  ) {
    try {
      return await this.client.requestPasswordReset(params, { timeoutMs });
    } catch (err) {
      throw toAppError(err);
    }
  }

  async resetPassword(
    params: Parameters<Client<typeof AuthService>['resetPassword']>[0],
    timeoutMs = this.defaultTimeoutMs,
  ) {
    try {
      return await this.client.resetPassword(params, { timeoutMs });
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
      this.log.error({ err: err }, 'Failed to check permission');
      throw toAppError(err);
    }
  }
}
