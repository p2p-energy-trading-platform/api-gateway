export type NodeEnvironment = 'development' | 'test' | 'production';

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
  };

  logging: {
    level: string;
  };

  cors: {
    origins: string[];
  };

  redis: {
    url: string;
    connectTimeoutMs: number;
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
}
