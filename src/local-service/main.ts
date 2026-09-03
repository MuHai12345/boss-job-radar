import { homedir } from 'node:os';

import {
  LOCAL_SERVICE_PORT_ENV,
  parseProductionPort,
} from './config.js';
import {
  ensureProductionDataDirectory,
  resolveProductionDataPaths,
} from './production-data-path.js';
import { startLocalRuntime } from './runtime.js';
import { LOCAL_SERVICE_HOST } from './server.js';
import { formatStartupError } from './startup-error.js';

const homeDirectory = homedir();
let sensitivePaths: readonly (string | undefined)[] = [
  homeDirectory,
  process.env.LOCALAPPDATA,
  process.env.XDG_DATA_HOME,
];

try {
  const port = parseProductionPort(process.env[LOCAL_SERVICE_PORT_ENV]);
  const productionDataPaths = resolveProductionDataPaths({
    environment: process.env,
    homeDirectory,
    platform: process.platform,
  });
  sensitivePaths = [
    productionDataPaths.databasePath,
    productionDataPaths.dataDirectory,
    ...sensitivePaths,
  ];
  await ensureProductionDataDirectory({
    dataDirectory: productionDataPaths.dataDirectory,
    platform: process.platform,
  });
  const runtime = await startLocalRuntime({
    databasePath: productionDataPaths.databasePath,
    port,
  });

  console.log(
    `Boss Job Radar local service listening on http://${LOCAL_SERVICE_HOST}:${runtime.address.port}`,
  );
  console.log('Local database ready');

  let shutdownPromise: Promise<void> | undefined;
  const shutdown = (): void => {
    shutdownPromise ??= runtime.close();
    void shutdownPromise.catch((error: unknown) => {
      const message = formatStartupError(error, sensitivePaths);
      console.error(`Failed to close local runtime: ${message}`);
      process.exitCode = 1;
    });
  };

  process.once('SIGINT', shutdown);
  process.once('SIGTERM', shutdown);
} catch (error) {
  const message = formatStartupError(error, sensitivePaths);
  console.error(`Failed to start local runtime: ${message}`);
  process.exitCode = 1;
}
