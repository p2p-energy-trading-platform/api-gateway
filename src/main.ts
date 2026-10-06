import { createServer, type Server } from 'node:http';

import { buildApp } from './app.js';
import { loadConfig } from './config/env.js';
import type { AppConfig } from './config/types.js';

function closeServer(server: Server | undefined): Promise<void> {
  if (server === undefined) {
    return Promise.resolve();
  }

  return new Promise((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
}

async function main(): Promise<void> {
  let config: AppConfig;

  try {
    config = loadConfig();
  } catch (error) {
    console.error('[api-gateway] Invalid configuration, refusing to start.');
    console.error(error instanceof Error ? error.message : String(error));

    process.exitCode = 1;

    return;
  }

  const app = await buildApp({
    config,
  });

  let metricsServer: Server | undefined;
  let shuttingDown = false;

  async function shutdown(signal: NodeJS.Signals): Promise<void> {
    if (shuttingDown) {
      return;
    }

    shuttingDown = true;

    app.log.info({ signal }, 'Shutdown signal received');

    try {
      await app.close();
      await closeServer(metricsServer);

      app.log.info('Application shut down cleanly');

      process.exitCode = 0;
    } catch (error) {
      app.log.error({ err: error }, 'Graceful shutdown failed');

      process.exitCode = 1;
    }
  }

  process.once('SIGTERM', () => {
    void shutdown('SIGTERM');
  });

  process.once('SIGINT', () => {
    void shutdown('SIGINT');
  });

  try {
    await app.listen({
      host: config.http.host,
      port: config.http.port,
    });
  } catch (error) {
    app.log.fatal({ err: error }, 'Application startup failed');

    process.exitCode = 1;

    return;
  }

  /*
   * Metrics are served on a separate, internal port. They reveal traffic and internals,
   * so they must never be part of the public app.
   */
  metricsServer = createServer((req, res) => {
    if (req.url !== '/metrics') {
      res.statusCode = 404;
      res.end();

      return;
    }

    app.metrics.registry.metrics().then(
      (body) => {
        res.setHeader('content-type', app.metrics.registry.contentType);
        res.end(body);
      },
      (error: unknown) => {
        app.log.error({ err: error }, 'Failed to collect metrics');
        res.statusCode = 500;
        res.end();
      },
    );
  });

  metricsServer.on('error', (error) => {
    app.log.error({ err: error }, 'Metrics server error');
  });

  metricsServer.listen(config.metrics.port, config.metrics.host, () => {
    app.log.info(
      { host: config.metrics.host, port: config.metrics.port },
      'Metrics server listening',
    );
  });
}

void main();
