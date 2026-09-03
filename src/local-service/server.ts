import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';

import type { JobObservationInput } from './database/observation-repository.js';
import {
  createBridgeSessionToken,
  hasAllowedExtensionOrigin,
  hasExpectedLoopbackHost,
  hasSupportedContentEncoding,
  hasSupportedJsonContentType,
  hasValidBridgeToken,
} from './http/bridge-security.js';
import {
  decodeJsonBody,
  readLimitedRequestBody,
  validateObservationBatch,
} from './http/observation-ingestion.js';

export const LOCAL_SERVICE_HOST = '127.0.0.1' as const;

const HEALTH_PATH = '/health';
const BRIDGE_SESSION_PATH = '/bridge/session';
const OBSERVATIONS_PATH = '/observations';
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

export interface ObservationAppender {
  appendMany(inputs: readonly JobObservationInput[]): { ids: number[] };
}

function sendJson(
  response: ServerResponse,
  statusCode: number,
  body: unknown,
): void {
  response.statusCode = statusCode;
  response.setHeader('Content-Type', 'application/json; charset=utf-8');
  response.end(JSON.stringify(body));
}

function rejectWithoutReadingBody(
  request: IncomingMessage,
  response: ServerResponse,
  statusCode: number,
  error: string,
): void {
  request.resume();
  sendJson(response, statusCode, { error });
}

function handleHealthRequest(
  request: IncomingMessage,
  response: ServerResponse,
): void {
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

async function handleObservationRequest(
  request: IncomingMessage,
  response: ServerResponse,
  token: string,
  observations: ObservationAppender,
): Promise<void> {
  if (!hasExpectedLoopbackHost(request)) {
    rejectWithoutReadingBody(request, response, 403, 'forbidden');
    return;
  }

  if (request.method !== 'POST') {
    response.statusCode = 405;
    response.setHeader('Allow', 'POST');
    response.end();
    return;
  }

  if (!hasAllowedExtensionOrigin(request.headers.origin)) {
    rejectWithoutReadingBody(request, response, 403, 'forbidden');
    return;
  }

  const receivedToken = request.headers['x-boss-job-radar-token'];
  if (
    typeof receivedToken !== 'string' ||
    !hasValidBridgeToken(receivedToken, token)
  ) {
    rejectWithoutReadingBody(request, response, 403, 'forbidden');
    return;
  }

  if (
    !hasSupportedJsonContentType(request.headers['content-type']) ||
    !hasSupportedContentEncoding(request.headers['content-encoding'])
  ) {
    rejectWithoutReadingBody(
      request,
      response,
      415,
      'unsupported_media_type',
    );
    return;
  }

  const bodyResult = await readLimitedRequestBody(request);
  if (bodyResult.status === 'too_large') {
    sendJson(response, 413, { error: 'payload_too_large' });
    return;
  }

  let body: unknown;
  try {
    body = decodeJsonBody(bodyResult.body);
  } catch {
    sendJson(response, 400, { error: 'invalid_request' });
    return;
  }

  const inputs = validateObservationBatch(body);
  if (inputs === null) {
    sendJson(response, 400, { error: 'invalid_request' });
    return;
  }

  try {
    const result = observations.appendMany(inputs);
    sendJson(response, 201, { ids: result.ids });
  } catch {
    sendJson(response, 500, { error: 'internal_error' });
  }
}

async function handleRequest(
  request: IncomingMessage,
  response: ServerResponse,
  token: string,
  observations: ObservationAppender,
): Promise<void> {
  if (request.url === HEALTH_PATH) {
    handleHealthRequest(request, response);
    return;
  }

  if (request.url === BRIDGE_SESSION_PATH) {
    if (!hasExpectedLoopbackHost(request)) {
      sendJson(response, 403, { error: 'forbidden' });
      return;
    }

    if (request.method !== 'GET') {
      response.statusCode = 405;
      response.setHeader('Allow', 'GET');
      response.end();
      return;
    }

    response.setHeader('Cache-Control', 'no-store');
    sendJson(response, 200, { protocolVersion: 1, token });
    return;
  }

  if (request.url === OBSERVATIONS_PATH) {
    await handleObservationRequest(
      request,
      response,
      token,
      observations,
    );
    return;
  }

  response.statusCode = 404;
  response.end();
}

export async function startLocalService(options: {
  readonly observations: ObservationAppender;
  readonly port: number;
}): Promise<LocalService> {
  const token = createBridgeSessionToken();
  const server = createServer((request, response) => {
    void handleRequest(
      request,
      response,
      token,
      options.observations,
    ).catch(() => {
      if (!response.headersSent) {
        sendJson(response, 500, { error: 'internal_error' });
      } else if (!response.writableEnded) {
        response.end();
      }
    });
  });

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
