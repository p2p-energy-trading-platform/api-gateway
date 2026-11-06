import * as http2 from 'node:http2';
import type { AddressInfo } from 'node:net';

import type { ServiceImpl } from '@connectrpc/connect';
import { connectNodeAdapter } from '@connectrpc/connect-node';
import { WalletService } from '@p2p-energy-trading-platform/typescript-sdk/gen/gridx/billing/v1/wallet_pb';

export interface FakeWalletService {
  // Value for config.grpc.billingServiceUrl.
  url: string;
  close: () => Promise<void>;
}

/*
 * A real gRPC server on a random port that pretends to be billing-wallet-service. Methods that
 * are not implemented return UNIMPLEMENTED.
 */
export async function startFakeWalletService(
  implementation: Partial<ServiceImpl<typeof WalletService>>,
): Promise<FakeWalletService> {
  const server = http2.createServer(
    connectNodeAdapter({ routes: (router) => router.service(WalletService, implementation) }),
  );
  const sessions = new Set<http2.ServerHttp2Session>();

  server.on('session', (session) => {
    sessions.add(session);
    session.once('close', () => sessions.delete(session));
  });

  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));

  const { port } = server.address() as AddressInfo;

  return {
    url: `http://127.0.0.1:${port}`,
    close: () =>
      new Promise<void>((resolve) => {
        server.close(() => resolve());

        for (const session of sessions) {
          session.destroy();
        }
      }),
  };
}
