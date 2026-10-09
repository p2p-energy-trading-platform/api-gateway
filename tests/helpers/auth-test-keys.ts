import { createSign, generateKeyPairSync, type KeyObject } from 'node:crypto';
import * as http from 'node:http';
import type { AddressInfo } from 'node:net';

interface TestKeys {
  privateKey: KeyObject;
  jwksUri: string;
  close: () => Promise<void>;
}

export async function startAuthTestKeys(): Promise<TestKeys> {
  const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const publicJwk = publicKey.export({ format: 'jwk' });
  const server = http.createServer((_request, response) => {
    response.setHeader('content-type', 'application/json');
    response.end(JSON.stringify({ keys: [{ ...publicJwk, kid: 'test-key', alg: 'RS256' }] }));
  });

  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;

  return {
    privateKey,
    jwksUri: `http://127.0.0.1:${port}/.well-known/jwks.json`,
    close: () =>
      new Promise<void>((resolve) => {
        server.close(() => resolve());
      }),
  };
}

export function createAccessToken(privateKey: KeyObject, userId: string, suffix: string): string {
  const now = Math.floor(Date.now() / 1000);
  const encode = (value: object) => Buffer.from(JSON.stringify(value)).toString('base64url');
  const unsigned = `${encode({ alg: 'RS256', kid: 'test-key', typ: 'JWT' })}.${encode({
    iss: 'gridx-auth-service',
    aud: 'gridx-api-gateway',
    sub: userId,
    typ: 'access',
    iat: now,
    exp: now + 300,
    jti: suffix,
  })}`;
  const signer = createSign('RSA-SHA256');
  signer.update(unsigned);

  return `${unsigned}.${signer.sign(privateKey).toString('base64url')}`;
}
