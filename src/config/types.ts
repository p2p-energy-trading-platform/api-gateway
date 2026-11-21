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

  iotLive: {
    // Each StreamHouseLive stream to the IoT service is reopened after this long.
    streamTimeoutMs: number;
    // An unwatched house's stream stays open this long in case a client comes back.
    idleGraceMs: number;
  };

  websocket: {
    // Connections are closed with 4001 after about this long, so clients reauthenticate.
    maxConnectionAgeMs: number;
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
    iotServiceUrl: string;
    billingServiceUrl: string;
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

  googleOAuth?:
    | {
        clientId: string;
        redirectUri: string;
        frontendBaseUrl: string;
        mobileRedirectUri?: string;
      }
    | undefined;
}
