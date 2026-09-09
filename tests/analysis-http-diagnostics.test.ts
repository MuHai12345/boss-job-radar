import { request } from 'node:http';
import { mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createAttemptEvidenceStore } from '../src/local-service/attempt-evidence';
import { createRuntimeIdentity } from '../src/local-service/runtime-identity';

import { describe, expect, it, vi } from 'vitest';

import {
  LOCAL_SERVICE_HOST,
  startLocalService,
  type AnalysisHttpDiagnosticEvent,
  type ImportBatchWriter,
  type StructuredLlmAnalysisWriter,
} from '../src/local-service/server';

const IMPORTS: ImportBatchWriter = {
  importBatch() {
    return { ids: [] };
  },
};

const URLS = {
  ok: 'https://www.zhipin.com/job_detail/http-diagnostic-ok.html',
  missing: 'https://www.zhipin.com/job_detail/http-diagnostic-missing.html',
  unavailable: 'https://www.zhipin.com/job_detail/http-diagnostic-unavailable.html',
  invalidResult: 'https://www.zhipin.com/job_detail/http-diagnostic-invalid-result.html',
  throws: 'https://www.zhipin.com/job_detail/http-diagnostic-throws.html',
} as const;

interface LocalResponse {
  readonly body: string;
  readonly statusCode: number | undefined;
}

function send(
  port: number,
  method: string,
  path: string,
  headers: Record<string, string> = {},
  body = '',
): Promise<LocalResponse> {
  return new Promise((resolve, reject) => {
    const client = request({ host: LOCAL_SERVICE_HOST, port, method, path, headers }, (response) => {
      const chunks: Buffer[] = [];
      response.on('data', (chunk: Buffer) => chunks.push(chunk));
      response.on('end', () => resolve({
        body: Buffer.concat(chunks).toString('utf8'),
        statusCode: response.statusCode,
      }));
    });
    client.on('error', reject);
    client.end(body);
  });
}

async function sessionToken(port: number): Promise<string> {
  const response = await send(port, 'GET', '/bridge/session');
  expect(response.statusCode).toBe(200);
  return (JSON.parse(response.body) as { token: string }).token;
}

function protectedHeaders(token: string): Record<string, string> {
  return {
    'content-type': 'application/json; charset=utf-8',
    origin: 'chrome-extension://analysis-http-diagnostics',
    'x-boss-job-radar-token': token,
  };
}

function writer(): StructuredLlmAnalysisWriter {
  return {
    async analyzeJobUrl(jobUrl) {
      if (jobUrl === URLS.ok) return { status: 'ok', id: 91 };
      if (jobUrl === URLS.missing) return { status: 'job_not_found' };
      if (jobUrl === URLS.unavailable) return { status: 'analysis_unavailable' };
      if (jobUrl === URLS.invalidResult) return { status: 'ok', id: 0 };
      if (jobUrl === URLS.throws) throw new Error('PRIVATE_PROVIDER_OR_DATABASE_DETAIL');
      throw new Error('unexpected test URL');
    },
  };
}

async function postAnalysis(port: number, token: string, jobUrl: string): Promise<LocalResponse> {
  return send(
    port,
    'POST',
    '/structured-llm-analyses',
    protectedHeaders(token),
    JSON.stringify({ jobUrl }),
  );
}

describe('analysis HTTP safe request diagnostics', () => {
  it('keeps writing the same attempt after the client disconnects at its deadline', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'bjr-client-deadline-'));
    let release!: () => void;
    const providerWait = new Promise<void>(resolve => { release = resolve; });
    let accepted!: () => void;
    const started = new Promise<void>(resolve => { accepted = resolve; });
    let finished!: () => void;
    const ended = new Promise<void>(resolve => { finished = resolve; });
    const analyzeJobUrl = vi.fn(async () => { accepted(); await providerWait; return { status: 'ok' as const, id: 42 }; });
    const service = await startLocalService({ imports: IMPORTS, port: 0, structuredLlmAnalyses: { analyzeJobUrl },
      attemptEvidence: createAttemptEvidenceStore(directory, createRuntimeIdentity()),
      onAnalysisHttpDiagnostic(event) { if (event.event === 'result') finished(); },
    });
    try {
      const token = await sessionToken(service.address.port);
      const client = request({ host: LOCAL_SERVICE_HOST, port: service.address.port, method: 'POST', path: '/structured-llm-analyses', headers: protectedHeaders(token) });
      client.on('error', () => undefined);
      client.end(JSON.stringify({ jobUrl: URLS.ok }));
      await started;
      const log = readdirSync(directory).find(name => name.endsWith('.log'))!;
      expect(readFileSync(join(directory, log), 'utf8')).toContain('request_accepted');
      client.destroy();
      release();
      await ended;
      expect(analyzeJobUrl).toHaveBeenCalledOnce();
      const records = readFileSync(join(directory, log), 'utf8').trim().split('\n').map(line => JSON.parse(line) as Record<string, unknown>);
      expect(new Set(records.map(event => event.attemptId)).size).toBe(1);
      expect(records.at(-1)).toMatchObject({ event: 'result', outcome: 'ok', analysisId: 42 });
    } finally { release(); await service.close(); rmSync(directory, { recursive: true, force: true }); }
  });
  it('emits one accepted/result pair per valid writer invocation with a matching process-local ordinal', async () => {
    const events: AnalysisHttpDiagnosticEvent[] = [];
    const service = await startLocalService({
      imports: IMPORTS,
      structuredLlmAnalyses: writer(),
      onAnalysisHttpDiagnostic(event) {
        events.push(event);
      },
      port: 0,
    });

    try {
      const token = await sessionToken(service.address.port);
      const cases = [
        [URLS.ok, 200, 'ok'],
        [URLS.missing, 404, 'job_not_found'],
        [URLS.unavailable, 422, 'analysis_unavailable'],
        [URLS.invalidResult, 502, 'analysis_failed'],
        [URLS.throws, 502, 'analysis_failed'],
      ] as const;

      for (const [jobUrl, status] of cases) {
        expect((await postAnalysis(service.address.port, token, jobUrl)).statusCode).toBe(status);
      }

      expect(events).toHaveLength(cases.length * 2);
      const acceptedOrdinals: number[] = [];
      const attemptIds = new Set<string>();
      for (let index = 0; index < cases.length; index += 1) {
        const accepted = events[index * 2];
        const result = events[index * 2 + 1];
        const expectedOutcome = cases[index]![2];
        expect(accepted).toMatchObject({ scope: 'analysis_http', event: 'request_accepted' });
        expect(result).toMatchObject({ scope: 'analysis_http', event: 'result', outcome: expectedOutcome });
        expect(accepted!.ordinal).toBeGreaterThan(0);
        expect(result!.ordinal).toBe(accepted!.ordinal);
        expect(accepted!.attemptId).toMatch(/^[0-9a-f-]{36}$/);
        expect(result!.attemptId).toBe(accepted!.attemptId);
        expect(accepted!.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
        expect(result!.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
        attemptIds.add(accepted!.attemptId!);
        acceptedOrdinals.push(accepted!.ordinal);
      }
      expect(attemptIds.size).toBe(cases.length);
      for (let index = 1; index < acceptedOrdinals.length; index += 1) {
        expect(acceptedOrdinals[index]!).toBeGreaterThan(acceptedOrdinals[index - 1]!);
      }

      const serialized = JSON.stringify(events);
      expect(serialized).not.toContain('zhipin.com');
      expect(serialized).not.toContain('PRIVATE_PROVIDER_OR_DATABASE_DETAIL');
      expect(serialized).not.toContain(token);
    } finally {
      await service.close();
    }
  });

  it('does not emit an accepted request for rejected, unauthenticated, malformed, or unconfigured requests', async () => {
    const events: AnalysisHttpDiagnosticEvent[] = [];
    const analyzeJobUrl = vi.fn(async () => ({ status: 'ok' as const, id: 1 }));
    const service = await startLocalService({
      imports: IMPORTS,
      structuredLlmAnalyses: { analyzeJobUrl },
      onAnalysisHttpDiagnostic: (event) => events.push(event),
      port: 0,
    });

    try {
      const token = await sessionToken(service.address.port);
      const invalidShape = await send(
        service.address.port,
        'POST',
        '/structured-llm-analyses',
        protectedHeaders(token),
        JSON.stringify({ jobUrl: URLS.ok, model: 'PRIVATE_MODEL' }),
      );
      expect(invalidShape.statusCode).toBe(400);

      const wrongOrigin = await send(
        service.address.port,
        'POST',
        '/structured-llm-analyses',
        { ...protectedHeaders(token), origin: 'https://example.com' },
        JSON.stringify({ jobUrl: URLS.ok }),
      );
      expect(wrongOrigin.statusCode).toBe(403);
      expect(events).toEqual([]);
      expect(analyzeJobUrl).not.toHaveBeenCalled();
    } finally {
      await service.close();
    }

    const unconfiguredEvents: AnalysisHttpDiagnosticEvent[] = [];
    const unconfigured = await startLocalService({
      imports: IMPORTS,
      onAnalysisHttpDiagnostic: (event) => unconfiguredEvents.push(event),
      port: 0,
    });
    try {
      const token = await sessionToken(unconfigured.address.port);
      expect((await postAnalysis(unconfigured.address.port, token, URLS.ok)).statusCode).toBe(503);
      expect(unconfiguredEvents).toEqual([]);
    } finally {
      await unconfigured.close();
    }
  });

  it('isolates diagnostic callback failures from the writer and HTTP result', async () => {
    const analyzeJobUrl = vi.fn(async () => ({ status: 'ok' as const, id: 77 }));
    const service = await startLocalService({
      imports: IMPORTS,
      structuredLlmAnalyses: { analyzeJobUrl },
      onAnalysisHttpDiagnostic() {
        throw new Error('PRIVATE_DIAGNOSTIC_CALLBACK_FAILURE');
      },
      port: 0,
    });

    try {
      const token = await sessionToken(service.address.port);
      const response = await postAnalysis(service.address.port, token, URLS.ok);
      expect(response.statusCode).toBe(200);
      expect(JSON.parse(response.body)).toEqual({ id: 77 });
      expect(analyzeJobUrl).toHaveBeenCalledOnce();
    } finally {
      await service.close();
    }
  });
});
