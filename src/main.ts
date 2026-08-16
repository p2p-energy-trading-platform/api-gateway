import { buildApp } from './app.js';
import { loadConfig } from './config/env.js';

async function main(): Promise<void> {
  const config = loadConfig();

  const app = await buildApp({
    config,
  });

  let shuttingDown = false;

  async function shutdown(signal: NodeJS.Signals): Promise<void> {
    if (shuttingDown) {
      return;
    }

    shuttingDown = true;

    app.log.info({ signal }, 'Shutdown signal received');

    try {
      await app.close();

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
  }
}

void main();
