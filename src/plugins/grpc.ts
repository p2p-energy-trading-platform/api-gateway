import fp from 'fastify-plugin';
import type { FastifyPluginAsync } from 'fastify';
import { createGrpcTransport } from '@connectrpc/connect-node';
import { createTlsClientOptions } from '../transport/grpc/credentials.js';
import { createHeaderPropagationInterceptor } from '../transport/grpc/metadata.js';
import { AuthGrpcClient } from '../transport/grpc/clients/auth-client.js';
import { IotGrpcClient } from '../transport/grpc/clients/iot-client.js';
import { WalletGrpcClient } from '../transport/grpc/clients/wallet-client.js';

export interface GrpcClients {
  auth: AuthGrpcClient;
  iot: IotGrpcClient;
  wallet: WalletGrpcClient;
}

const grpcPlugin: FastifyPluginAsync = fp(async (fastify) => {
  const tlsOptions = createTlsClientOptions(fastify.config['grpc']['tls']);

  const authTransport = createGrpcTransport({
    baseUrl: fastify.config.grpc.authServiceUrl,
    ...(tlsOptions ? { nodeOptions: tlsOptions } : {}),
    interceptors: [
      createHeaderPropagationInterceptor(() => {
        // Retrieve current context from request store if available
        return fastify.requestContext?.get?.('tracing');
      }),
    ],
  });

  const iotTransport = createGrpcTransport({
    baseUrl: fastify.config.grpc.iotServiceUrl,
    ...(tlsOptions ? { nodeOptions: tlsOptions } : {}),
    interceptors: [
      createHeaderPropagationInterceptor(() => {
        // Retrieve current context from request store if available
        return fastify.requestContext?.get?.('tracing');
      }),
    ],
  });

  const billingTransport = createGrpcTransport({
    baseUrl: fastify.config.grpc.billingServiceUrl,
    ...(tlsOptions ? { nodeOptions: tlsOptions } : {}),
    interceptors: [
      createHeaderPropagationInterceptor(() => {
        // Retrieve current context from request store if available
        return fastify.requestContext?.get?.('tracing');
      }),
    ],
  });

  fastify.decorate('grpcClients', {
    auth: new AuthGrpcClient(authTransport, fastify.log),
    iot: new IotGrpcClient(iotTransport, fastify.log),
    wallet: new WalletGrpcClient(billingTransport, fastify.log),
  });
});

export default grpcPlugin;
