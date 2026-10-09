export type NodeEnvironment = 'development' | 'test' | 'production';
export type TrustProxy = false | string[];
export type CookieSameSite = 'lax' | 'strict' | 'none';

export interface AppConfig {
  nodeEnv: NodeEnvironment;

  service: {
    name: string;
    version: string;
  };

  http: {
    host: string;
    port: number;
    bodyLimitBytes: number;
    requestTimeoutMs: number;
    trustProxy: TrustProxy;
  };

  logging: {
    level: string;
  };

  cors: {
    origins: string[];
  };

  cookies: {
    secure: boolean;
    sameSite: CookieSameSite;
    domain?: string | undefined;
    refreshMaxAgeSeconds: number;
  };

  redis: {
    url: string;
    connectTimeoutMs: number;
  };

  rateLimit: {
    hashSecret: string;
  };

  grpc: {
    authServiceUrl: string;
    defaultTimeoutMs: number;
    tls: {
      enabled: boolean;
      caPath?: string | undefined;
      certPath?: string | undefined;
      keyPath?: string | undefined;
    };
  };

  auth: {
    issuer: string;
    audience: string;
    jwksUri: string;
    allowedAlgorithms: string[];
    clockToleranceSeconds: number;
    jwksCacheTtlSeconds: number;
    jwksRequestTimeoutMs: number;
  };

  metrics: {
    host: string;
    port: number;
  };
}
