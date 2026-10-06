import { createClient, type Client, type Transport } from '@connectrpc/connect';
import { createGrpcTransport } from '@connectrpc/connect-node';
import { AuthService } from '@p2p-energy-trading-platform/typescript-sdk/gen/gridx/auth/v1/auth_pb';
import { DEFAULT_GRPC_TIMEOUT_MS } from '../deadlines.js';
import { toAppError } from '../errors.js';

export type AuthClient = Client<typeof AuthService>;

export function createAuthClient(target: string): AuthClient {
  const transport = createGrpcTransport({
    baseUrl: `http://${target}`,
  });

  return createClient(AuthService, transport);
}

export class AuthGrpcClient {
  private readonly client: AuthClient;
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

}
