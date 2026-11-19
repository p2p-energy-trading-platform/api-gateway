import { randomUUID } from 'node:crypto';
import * as http2 from 'node:http2';
import type { AddressInfo } from 'node:net';

import { Code, ConnectError, type ServiceImpl } from '@connectrpc/connect';
import { connectNodeAdapter } from '@connectrpc/connect-node';
import { DeviceRegistrationService } from '@p2p-energy-trading-platform/typescript-sdk/gen/gridx/iot/v1/iot_pb';
import type { FastifyInstance } from 'fastify';
import { afterEach, describe, expect, it } from 'vitest';

import { buildApp } from '../../src/app.js';
import {
  signAccessToken,
  startFakeJwks,
  TEST_AUDIENCE,
  TEST_ISSUER,
  type FakeJwks,
} from '../helpers/fake-jwks.js';
import { testConfig } from '../helpers/test-config.js';

const USER_ID = 'registration-user-1';

type RegistrationImplementation = Partial<ServiceImpl<typeof DeviceRegistrationService>>;

/*
 * A real gRPC server pretending to be iot-ingestion-dispatch's DeviceRegistrationService.
 */
async function startFakeRegistrationService(implementation: RegistrationImplementation) {
  const server = http2.createServer(
    connectNodeAdapter({
      routes: (router) => router.service(DeviceRegistrationService, implementation),
    }),
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

/*
 * POST /api/v1/registration/claim against a fake registration service.
 * Needs Redis, like other tests that register the infrastructure plugins.
 */
describe('meter claim', () => {
  let app: FastifyInstance | undefined;
  let fake: Awaited<ReturnType<typeof startFakeRegistrationService>> | undefined;
  let jwks: FakeJwks | undefined;
  let claimedFor: string | undefined;

  async function setup(initiateMeterClaim: RegistrationImplementation['initiateMeterClaim']) {
    jwks = await startFakeJwks();
    fake = await startFakeRegistrationService({ initiateMeterClaim });
    app = await buildApp({
      config: {
        ...testConfig,
        auth: {
          ...testConfig.auth,
          issuer: TEST_ISSUER,
          audience: TEST_AUDIENCE,
          jwksUri: jwks.url,
        },
        grpc: { ...testConfig.grpc, iotServiceUrl: fake.url },
        // Fresh rate-limit keys for every test.
        rateLimit: { hashSecret: randomUUID() },
      },
      registerInfrastructure: true,
    });
    return app;
  }

  async function claim(instance: FastifyInstance) {
    const token = await signAccessToken(jwks!.key, { subject: USER_ID });
    return instance.inject({
      method: 'POST',
      url: '/api/v1/registration/claim',
      headers: { authorization: `Bearer ${token}` },
      payload: { meter_id: 'SM-2' },
    });
  }

  afterEach(async () => {
    await app?.close();
    await fake?.close();
    await jwks?.close();
    app = undefined;
    fake = undefined;
    jwks = undefined;
    claimedFor = undefined;
  });

  it('claims the meter for the signed-in user', async () => {
    const instance = await setup(async (req) => {
      claimedFor = req.userReference;
      return { registrationId: 'reg-1', status: 'PENDING', message: 'Link request created' };
    });

    const response = await claim(instance);

    expect(response.statusCode).toBe(200);
    expect(claimedFor).toBe(USER_ID);
  });

  it('answers 409 when the account already has a smart meter', async () => {
    const instance = await setup(async () => {
      throw new ConnectError('a smart meter is already registered', Code.AlreadyExists);
    });

    const response = await claim(instance);

    expect(response.statusCode).toBe(409);
    expect(response.json().error.code).toBe('CONFLICT');
  });
});
