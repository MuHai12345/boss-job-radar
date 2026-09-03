import {
  LOCAL_SERVICE_PORT_ENV,
  parseProductionPort,
} from './config.js';
import { LOCAL_SERVICE_HOST, startLocalService } from './server.js';

try {
  const port = parseProductionPort(process.env[LOCAL_SERVICE_PORT_ENV]);
  const service = await startLocalService({ port });

  console.log(
    `Boss Job Radar local service listening on http://${LOCAL_SERVICE_HOST}:${service.address.port}`,
  );

  let shutdownPromise: Promise<void> | undefined;
  const shutdown = (): void => {
    shutdownPromise ??= service.close();
    void shutdownPromise.catch((error: unknown) => {
      const message = error instanceof Error ? error.message : 'unknown error';
      console.error(`Failed to close local service: ${message}`);
      process.exitCode = 1;
    });
  };

  process.once('SIGINT', shutdown);
  process.once('SIGTERM', shutdown);
} catch (error) {
  const message = error instanceof Error ? error.message : 'unknown error';
  console.error(`Failed to start local service: ${message}`);
  process.exitCode = 1;
}
