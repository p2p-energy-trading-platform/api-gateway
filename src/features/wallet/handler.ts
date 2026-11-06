import type { FastifyRequest } from 'fastify';

import { grpcDeadlinesMs } from '../../transport/grpc/deadlines.js';
import { mapGetWalletResponse } from './mapper.js';
import type { WalletResponse } from './schemas.js';

export async function getWalletHandler(request: FastifyRequest): Promise<WalletResponse> {
  const result = await request.server.grpcClients.wallet.getWallet(grpcDeadlinesMs.walletGetWallet);

  return mapGetWalletResponse(result);
}
