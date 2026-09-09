import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { emitAttemptDiagnostic, runAnalysisAttempt, type AttemptEvidenceStore, type DiagnosticMetadata } from './analysis-attempt-context.js';

import type { ImportRequest } from '../shared/import-request-types.js';
import { validateStructuredLlmAnalysisRequest } from '../shared/structured-llm-analysis-request.js';
import { validateJobLinkCheckRequest, type JobLinkCheckRequest } from '../shared/job-link-check-types.js';
import { ImportConflictError } from './database/import-repository.js';
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
  validateImportRequest,
} from './http/observation-ingestion.js';

export const LOCAL_SERVICE_HOST = '127.0.0.1' as const;

const HEALTH_PATH = '/health';
const BRIDGE_SESSION_PATH = '/bridge/session';
const OBSERVATIONS_PATH = '/observations';
const JOB_LINK_CHECKS_PATH = '/job-link-checks';
const STRUCTURED_LLM_ANALYSES_PATH = '/structured-llm-analyses';
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

export interface ImportBatchWriter {
  importBatch(request: ImportRequest): { ids: number[] };
}

export interface JobLinkCheckWriter {
  append(request: JobLinkCheckRequest): { id: number } | null;
}

export interface StructuredLlmAnalysisWriter {
  analyzeJobUrl(jobUrl: string): Promise<
    | { readonly status: 'ok'; readonly id: number }
    | { readonly status: 'job_not_found' }
    | { readonly status: 'analysis_unavailable' }
  >;
}

export type AnalysisHttpDiagnosticEvent = DiagnosticMetadata & {
  readonly scope: 'analysis_http';
  readonly ordinal: number;
} & (
  | { readonly event: 'request_accepted' }
  | { readonly event: 'result'; readonly outcome: 'ok' | 'job_not_found' | 'analysis_unavailable' | 'analysis_failed'; readonly analysisId?: number }
);

// Process-local ordering aid; persisted in safe evidence, never a request identity.
let analysisHttpOrdinal = 0;

function emitAnalysisHttpDiagnosticSafely(
  callback: ((event: AnalysisHttpDiagnosticEvent) => void) | undefined,
  event: AnalysisHttpDiagnosticEvent,
): void {
  emitAttemptDiagnostic(event, callback);
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

async function handleProtectedWriteRequest(
  request: IncomingMessage,
  response: ServerResponse,
  token: string,
  imports: ImportBatchWriter,
  linkChecks: JobLinkCheckWriter | undefined,
  structuredLlmAnalyses: StructuredLlmAnalysisWriter | undefined,
  onAnalysisHttpDiagnostic: ((event: AnalysisHttpDiagnosticEvent) => void) | undefined,
  attemptEvidence: AttemptEvidenceStore | undefined,
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

  if (request.url === STRUCTURED_LLM_ANALYSES_PATH) {
    const analysisRequest = validateStructuredLlmAnalysisRequest(body);
    if (analysisRequest === null) {
      sendJson(response, 400, { error: 'invalid_request' });
      return;
    }
    if (structuredLlmAnalyses === undefined) {
      sendJson(response, 503, { error: 'analysis_not_configured' });
      return;
    }
    await runAnalysisAttempt(attemptEvidence, async () => {
      const ordinal = ++analysisHttpOrdinal;
      emitAnalysisHttpDiagnosticSafely(onAnalysisHttpDiagnostic, { scope: 'analysis_http', event: 'request_accepted', ordinal });
      let outcome: Extract<AnalysisHttpDiagnosticEvent, { event: 'result' }>['outcome'] = 'analysis_failed';
      let analysisId: number | undefined;
      try {
        const result = await structuredLlmAnalyses.analyzeJobUrl(analysisRequest.jobUrl);
        if (result.status === 'job_not_found') {
          outcome = 'job_not_found';
          sendJson(response, 404, { error: 'job_not_found' });
        } else if (result.status === 'analysis_unavailable') {
          outcome = 'analysis_unavailable';
          sendJson(response, 422, { error: 'analysis_unavailable' });
        } else if (result.status === 'ok' && Number.isSafeInteger(result.id) && result.id > 0) {
          outcome = 'ok';
          analysisId = result.id;
          sendJson(response, 200, { id: result.id });
        } else {
          sendJson(response, 502, { error: 'analysis_failed' });
        }
      } catch {
        outcome = 'analysis_failed';
        sendJson(response, 502, { error: 'analysis_failed' });
      } finally {
        emitAnalysisHttpDiagnosticSafely(onAnalysisHttpDiagnostic, { scope: 'analysis_http', event: 'result', ordinal, outcome, ...(outcome === 'ok' ? { analysisId } : {}) });
      }
    });
    return;
  }

  if (request.url === JOB_LINK_CHECKS_PATH) {
    const linkRequest = validateJobLinkCheckRequest(body);
    if (linkRequest === null) {
      sendJson(response, 400, { error: 'invalid_request' });
      return;
    }
    try {
      if (linkChecks === undefined) throw new Error('Link check storage unavailable.');
      const result = linkChecks.append(linkRequest);
      if (result === null) sendJson(response, 404, { error: 'job_not_found' });
      else sendJson(response, 201, { id: result.id });
    } catch {
      sendJson(response, 500, { error: 'internal_error' });
    }
    return;
  }

  const importRequest = validateImportRequest(body);
  if (importRequest === null) {
    sendJson(response, 400, { error: 'invalid_request' });
    return;
  }

  try {
    const result = imports.importBatch(importRequest);
    sendJson(response, 201, { ids: result.ids });
  } catch (error) {
    if (error instanceof ImportConflictError) {
      sendJson(response, 409, { error: 'import_conflict' });
      return;
    }
    sendJson(response, 500, { error: 'internal_error' });
  }
}

async function handleRequest(
  request: IncomingMessage,
  response: ServerResponse,
  token: string,
  imports: ImportBatchWriter,
  linkChecks: JobLinkCheckWriter | undefined,
  structuredLlmAnalyses: StructuredLlmAnalysisWriter | undefined,
  onAnalysisHttpDiagnostic: ((event: AnalysisHttpDiagnosticEvent) => void) | undefined,
  attemptEvidence: AttemptEvidenceStore | undefined,
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
    sendJson(response, 200, { protocolVersion: 2, token });
    return;
  }

  if (request.url === OBSERVATIONS_PATH || request.url === JOB_LINK_CHECKS_PATH
    || request.url === STRUCTURED_LLM_ANALYSES_PATH) {
    await handleProtectedWriteRequest(
      request,
      response,
      token,
      imports,
      linkChecks,
      structuredLlmAnalyses,
      onAnalysisHttpDiagnostic,
      attemptEvidence,
    );
    return;
  }

  response.statusCode = 404;
  response.end();
}

export async function startLocalService(options: {
  readonly attemptEvidence?: AttemptEvidenceStore;
  readonly imports: ImportBatchWriter;
  readonly linkChecks?: JobLinkCheckWriter;
  readonly structuredLlmAnalyses?: StructuredLlmAnalysisWriter;
  readonly onAnalysisHttpDiagnostic?: (event: AnalysisHttpDiagnosticEvent) => void;
  readonly port: number;
}): Promise<LocalService> {
  const token = createBridgeSessionToken();
  const server = createServer((request, response) => {
    void handleRequest(
      request,
      response,
      token,
      options.imports,
      options.linkChecks,
      options.structuredLlmAnalyses,
      options.onAnalysisHttpDiagnostic,
      options.attemptEvidence,
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
