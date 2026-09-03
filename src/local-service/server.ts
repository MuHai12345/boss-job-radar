import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';

export const LOCAL_SERVICE_HOST = '127.0.0.1' as const;

const HEALTH_PATH = '/health';
const HEALTH_RESPONSE_BODY = JSON.stringify({
  status: 'ok',
  service: 'boss-job-radar-local',
});

export interface LocalServiceAddress {
  readonly family: 'IPv4';
  readonly host: typeof LOCAL_SERVICE_HOST;
  readonly port: number;
}

export interface LocalService {
  readonly address: LocalServiceAddress;
  close(): Promise<void>;
}

function handleRequest(
  request: IncomingMessage,
  response: ServerResponse,
): void {
  if (request.url !== HEALTH_PATH) {
    response.statusCode = 404;
    response.end();
    return;
  }

  if (request.method !== 'GET') {
    response.statusCode = 405;
    response.setHeader('Allow', 'GET');
    response.end();
    return;
  }

  response.statusCode = 200;
  response.setHeader('Content-Type', 'application/json; charset=utf-8');
  response.end(HEALTH_RESPONSE_BODY);
}

export async function startLocalService(options: {
  readonly port: number;
}): Promise<LocalService> {
  const server = createServer(handleRequest);

  await new Promise<void>((resolve, reject) => {
    const handleError = (error: Error): void => {
      server.off('listening', handleListening);
      reject(error);
    };
    const handleListening = (): void => {
      server.off('error', handleError);
      resolve();
    };

    server.once('error', handleError);
    server.once('listening', handleListening);
    server.listen(options.port, LOCAL_SERVICE_HOST);
  });

  const boundAddress = server.address();
  if (
    boundAddress === null ||
    typeof boundAddress === 'string' ||
    boundAddress.address !== LOCAL_SERVICE_HOST ||
    boundAddress.family !== 'IPv4'
  ) {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    throw new Error('Local service failed to bind to the IPv4 loopback address');
  }

  let closePromise: Promise<void> | undefined;
  return {
    address: {
      family: 'IPv4',
      host: LOCAL_SERVICE_HOST,
      port: boundAddress.port,
    },
    close(): Promise<void> {
      closePromise ??= new Promise<void>((resolve, reject) => {
        server.close((error) => {
          if (error) {
            reject(error);
            return;
          }
          resolve();
        });
      });
      return closePromise;
    },
  };
}
