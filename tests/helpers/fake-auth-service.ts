import * as http2 from 'node:http2';
import type { AddressInfo } from 'node:net';

import type { ServiceImpl } from '@connectrpc/connect';
import { connectNodeAdapter } from '@connectrpc/connect-node';
import { AuthService } from '@p2p-energy-trading-platform/typescript-sdk/gen/gridx/auth/v1/auth_pb';

export interface FakeAuthService {
  // Value for config.grpc.authServiceUrl.
  url: string;
  close: () => Promise<void>;
}

/*
 * A real gRPC server on a random port that pretends to be auth-service. Methods that are not
 * implemented return UNIMPLEMENTED.
 */
export async function startFakeAuthService(
  implementation: Partial<ServiceImpl<typeof AuthService>>,
): Promise<FakeAuthService> {
  const server = http2.createServer(
    connectNodeAdapter({ routes: (router) => router.service(AuthService, implementation) }),
  );

  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));

  const { port } = server.address() as AddressInfo;

  return {
    url: `http://127.0.0.1:${port}`,
    close: () =>
      new Promise<void>((resolve) => {
        server.close(() => resolve());
      }),
  };
}
