import { loadConfig } from '../src/config/env.js';

function main(): void {
  try {
    const config = loadConfig();

    console.log('[check-config] Configuration is valid.');

    console.log(
      JSON.stringify(
        {
          nodeEnv: config.nodeEnv,
          service: config.service,
          http: config.http,
          logging: config.logging,
          cors: config.cors,
        },
        null,
        2,
      ),
    );

    process.exitCode = 0;
  } catch (error) {
    console.error('[check-config] Configuration is invalid.');
    console.error(error instanceof Error ? error.message : String(error));

    process.exitCode = 1;
  }
}

main();