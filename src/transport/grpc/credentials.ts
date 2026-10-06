import { readFileSync } from 'node:fs';
import type { SecureClientSessionOptions } from 'node:http2';
import type { AppConfig } from '../../config/types.js';

export function createTlsClientOptions(tlsConfig: AppConfig['grpc']['tls']): SecureClientSessionOptions | undefined {
  if (!tlsConfig.enabled) {
    return undefined;
  }

  const options: SecureClientSessionOptions = {};

  if (tlsConfig.caPath) {
    options.ca = readFileSync(tlsConfig.caPath);
  }

  if (tlsConfig.certPath && tlsConfig.keyPath) {
    options.cert = readFileSync(tlsConfig.certPath);
    options.key = readFileSync(tlsConfig.keyPath);
  }

  return options;
}