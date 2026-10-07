import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';

import { exportJWK, generateKeyPair, SignJWT, type JWTPayload } from 'jose';

export const TEST_ISSUER = 'http://auth-service.test';
export const TEST_AUDIENCE = 'gridx-api';

export interface TestKey {
  kid: string;
  privateKey: CryptoKey;
}

export interface FakeJwks {
  // Value for config.auth.jwksUri.
  url: string;
  key: TestKey;
  requestCount: () => number;
  // Makes the endpoint answer 500, to simulate auth-service being broken.
  fail: (value: boolean) => void;
  close: () => Promise<void>;
}

export async function createTestKey(kid: string): Promise<TestKey & { publicJwk: object }> {
  const { privateKey, publicKey } = await generateKeyPair('EdDSA', { extractable: true });
  const jwk = await exportJWK(publicKey);

  return { kid, privateKey, publicJwk: { ...jwk, kid, alg: 'EdDSA', use: 'sig' } };
}

/*
 * Serves a JWKS like auth-service's /.well-known/jwks.json, with one Ed25519 key.
 */
export async function startFakeJwks(): Promise<FakeJwks> {
  const key = await createTestKey('test-key-1');
  let requests = 0;
  let failing = false;

  const server: Server = createServer((_req, res) => {
    requests += 1;

    if (failing) {
      res.statusCode = 500;
      res.end();
      return;
    }

    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify({ keys: [key.publicJwk] }));
  });

  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));

  const { port } = server.address() as AddressInfo;

  return {
    url: `http://127.0.0.1:${port}/.well-known/jwks.json`,
    key,
    requestCount: () => requests,
    fail: (value) => {
      failing = value;
    },
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
}

export interface TokenOptions {
  claims?: JWTPayload;
  // null leaves the "sub" claim out.
  subject?: string | null;
  issuer?: string;
  audience?: string;
  issuedAt?: number;
  expiresInSeconds?: number;
}

// Signs an access token the same way auth-service does (src/infrastructure/crypto/jwt-signer.ts).
export async function signAccessToken(key: TestKey, options: TokenOptions = {}): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const issuedAt = options.issuedAt ?? now;

  const jwt = new SignJWT({ typ: 'access', ver: 1, role: 'prosumer', ...options.claims })
    .setProtectedHeader({ alg: 'EdDSA', kid: key.kid, typ: 'JWT' })
    .setIssuer(options.issuer ?? TEST_ISSUER)
    .setAudience(options.audience ?? TEST_AUDIENCE)
    .setIssuedAt(issuedAt)
    .setExpirationTime(issuedAt + (options.expiresInSeconds ?? 900));

  if (options.subject !== null) {
    jwt.setSubject(options.subject ?? 'user-123');
  }

  return jwt.sign(key.privateKey);
}
