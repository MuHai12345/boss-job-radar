import { mkdtemp, rm } from 'node:fs/promises';
import { readFileSync, readdirSync } from 'node:fs';
import { request } from 'node:http';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import SqliteDatabase from 'better-sqlite3';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  STRUCTURED_LLM_OUTPUT_SCHEMA_VERSION,
  type StructuredLlmAnalysisOutput,
} from '../src/domain/llm/structured-llm-analysis-types';
import type {
  StructuredLlmProvider,
  StructuredLlmProviderRequest,
} from '../src/domain/llm/structured-llm-provider';
import {
  startLocalRuntime,
  type LocalRuntime,
  type StructuredLlmAnalysisDiagnosticEvent,
} from '../src/local-service/runtime';
import { LOCAL_SERVICE_HOST } from '../src/local-service/server';
import type { JobObservationInput } from '../src/shared/job-observation-types';
import { createLave8StructuredLlmProvider } from '../src/domain/llm/lave8-structured-llm-provider';

const JOB_URL = 'https://www.zhipin.com/job_detail/runtime-diagnostics.html';
const JD = [
  '岗位职责：',
  '负责商品上下架与商品维护',
  '负责店铺日常运营',
  '负责活动报名与大促执行',
  '负责数据分析与转化率复盘',
  '岗位要求：接受无经验和转行候选人',
].join('\n');

const temporaryDirectories: string[] = [];
const runtimes: LocalRuntime[] = [];
const runtimePaths = new WeakMap<LocalRuntime, string>();

afterEach(async () => {
  vi.restoreAllMocks();
  for (const runtime of runtimes.splice(0)) await runtime.close();
  await Promise.all(temporaryDirectories.splice(0).map((directory) =>
    rm(directory, { recursive: true, force: true })));
});

async function databasePath(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), 'boss-job-radar-llm-diagnostics-'));
  temporaryDirectories.push(directory);
  return join(directory, 'boss-job-radar.sqlite3');
}

interface LocalResponse {
  readonly statusCode: number | undefined;
  readonly body: string;
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
        statusCode: response.statusCode,
        body: Buffer.concat(chunks).toString('utf8'),
      }));
    });
    client.on('error', reject);
    client.end(body);
  });
}

async function analyze(runtime: LocalRuntime, jobUrl = JOB_URL): Promise<LocalResponse> {
  const session = await send(runtime.address.port, 'GET', '/bridge/session');
  expect(session.statusCode).toBe(200);
  const token = (JSON.parse(session.body) as { token: string }).token;
  const response = await send(
    runtime.address.port,
    'POST',
    '/structured-llm-analyses',
    {
      'content-type': 'application/json; charset=utf-8',
      origin: 'chrome-extension://synthetic-extension-id',
      'x-boss-job-radar-token': token,
    },
    JSON.stringify({ jobUrl }),
  );
  const directory = join(dirname(runtimePaths.get(runtime)!), 'safe-diagnostics');
  const logs = readdirSync(directory).filter(name => name.endsWith('.log'));
  expect(logs.length).toBeGreaterThan(0);
  for (const log of logs) {
    const text = readFileSync(join(directory, log), 'utf8');
    const events = text.trim().split('\n').map(line => JSON.parse(line) as Record<string, unknown>);
    const attemptId = events[0]!.attemptId;
    expect(new Set(events.map(event => event.attemptId)).size).toBe(1);
    expect(events.filter(event => event.event === 'request_accepted')).toHaveLength(1);
    expect(events.filter(event => event.event === 'result')).toHaveLength(1);
    for (const event of events) expect(event.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
    const summaryText = readFileSync(join(directory, `safe-evidence-attempt-${String(attemptId)}.json`), 'utf8');
    const summary = JSON.parse(summaryText) as Record<string, unknown>;
    expect(summary.outcome).toBe(events.at(-1)!.outcome);
    expect(summary.finishedAt).toBe(events.at(-1)!.timestamp);
    if (summary.outcome === 'ok') expect(summary.analysisId).toBeGreaterThan(0);
    else expect(summary).not.toHaveProperty('analysisId');
    for (const event of events.filter(event => event.scope === 'analysis')) {
      expect(summary.stage).toBe(event.stage);
      if (event.stage === 'output_validation_failed') expect(summary.validationReason).toBe(event.validationReason);
    }
    expect(text + summaryText).not.toContain(JD);
    expect(text + summaryText).not.toMatch(/PRIVATE_|zhipin\.com|诊断测试公司|Authorization|Cookie|Session/);
    expect(text + summaryText).not.toContain(directory);
  }
  return response;
}

function observation(overrides: Partial<JobObservationInput> = {}): JobObservationInput {
  const capturedAt = new Date().toISOString();
  return {
    capturedAt,
    pageType: 'job_detail',
    sourcePageUrl: JOB_URL,
    jobHrefRaw: '/job_detail/runtime-diagnostics.html',
    jobUrl: JOB_URL,
    title: '电商运营助理',
    companyName: '诊断测试公司',
    salaryText: '8-10K',
    locationText: '上海',
    experienceText: '经验不限',
    educationText: '本科',
    tags: ['电商运营'],
    recruiterActivityText: '刚刚活跃',
    publishedText: '今日发布',
    fullJdText: JD,
    rawText: '诊断测试原始页面文本',
    missingFields: [],
    warnings: [],
    ...overrides,
  };
}

function validOutput(): StructuredLlmAnalysisOutput {
  return {
    schemaVersion: STRUCTURED_LLM_OUTPUT_SCHEMA_VERSION,
    roleSummary: '岗位覆盖商品、店铺、活动和数据运营职责。',
    responsibilityFindings: [{
      kind: 'core_ops',
      statement: '包含商品维护职责。',
      evidence: [{ source: 'full_jd', excerpt: '负责商品上下架与商品维护' }],
    }],
    careerSwitchInterpretation: { summary: '可结合上游确定性结论理解转行可行性。', supports: [], concerns: [] },
    growthInterpretation: { summary: '职责覆盖多个电商运营模块。', supports: [], concerns: [] },
    riskInterpretation: { summary: '风险解释仅基于当前岗位输入。', supports: [], concerns: [] },
    ambiguities: [],
    interviewQuestions: [],
    confidence: 'high',
  };
}

function fakeProvider(options: {
  readonly generate?: (request: StructuredLlmProviderRequest) => unknown | Promise<unknown>;
  readonly output?: unknown;
} = {}): StructuredLlmProvider & { calls: number } {
  const provider: StructuredLlmProvider & { calls: number } = {
    providerId: 'fake-diagnostic-provider',
    modelId: 'fake-diagnostic-model',
    calls: 0,
    async generate(request): Promise<unknown> {
      provider.calls += 1;
      if (options.generate) return options.generate(request);
      return options.output ?? validOutput();
    },
  };
  return provider;
}

async function start(
  provider: StructuredLlmProvider,
  events: StructuredLlmAnalysisDiagnosticEvent[],
  onDiagnostic?: (event: StructuredLlmAnalysisDiagnosticEvent) => void,
): Promise<LocalRuntime> {
  const path = await databasePath();
  const runtime = await startLocalRuntime({
    databasePath: path,
    port: 0,
    structuredLlmProvider: provider,
    onStructuredLlmDiagnostic: onDiagnostic ?? ((event) => events.push(event)),
  });
  runtimePaths.set(runtime, path);
  runtimes.push(runtime);
  return runtime;
}

function inspect<T>(runtime: LocalRuntime, operation: (database: SqliteDatabase.Database) => T): T {
  const path = runtimePaths.get(runtime);
  if (!path) throw new Error('Runtime database path is unavailable.');
  const database = new SqliteDatabase(path);
  try { return operation(database); }
  finally { database.close(); }
}

function seed(runtime: LocalRuntime, input = observation()): number {
  const saved = runtime.database.observations.append(input);
  return runtime.database.observations.getById(saved.id)!.jobId;
}

function expectGeneric502(response: LocalResponse): void {
  expect(response.statusCode).toBe(502);
  expect(JSON.parse(response.body)).toEqual({ error: 'analysis_failed' });
  expect(response.body).not.toContain('PRIVATE_');
  expect(response.body).not.toContain(JD);
}

describe('structured LLM runtime fixed failure-stage diagnostics', () => {
  it.each([true, false])('correlates localhost, Lave8 and strict validator events with pre-fetch evidence (valid=%s)', async valid => {
    const events: StructuredLlmAnalysisDiagnosticEvent[] = [];
    const fetchImpl = vi.fn(async () => {
      const directory = join(dirname(runtimePaths.get(runtime)!), 'safe-diagnostics');
      const log = readdirSync(directory).find(name => name.endsWith('.log'))!;
      expect(readFileSync(join(directory, log), 'utf8')).toContain('request_accepted');
      return new Response(JSON.stringify({ status: 'completed', output: [{ type: 'message', role: 'assistant', status: 'completed', content: [{ type: 'output_text', text: JSON.stringify(valid ? validOutput() : { roleSummary: 'PRIVATE_INVALID_OUTPUT' }) }] }] }));
    });
    const runtime = await start(createLave8StructuredLlmProvider({ apiKey: 'PRIVATE_FAKE_KEY', modelId: 'gpt-5.6-sol', fetchImpl }), events);
    seed(runtime);
    const response = await analyze(runtime);
    if (valid) expect(response.statusCode).toBe(200);
    else expectGeneric502(response);
    expect(fetchImpl).toHaveBeenCalledOnce();
    const directory = join(dirname(runtimePaths.get(runtime)!), 'safe-diagnostics');
    const log = readdirSync(directory).find(name => name.endsWith('.log'))!;
    const records = readFileSync(join(directory, log), 'utf8').trim().split('\n').map(line => JSON.parse(line) as Record<string, unknown>);
    expect(new Set(records.map(event => event.attemptId)).size).toBe(1);
    expect(records.map(event => event.event ?? event.stage)).toEqual(['created', 'request_accepted', 'request_started', 'http_response', 'response_accepted', ...(valid ? [] : ['output_validation_failed']), 'result']);
    const summaryName = readdirSync(directory).find(name => name.endsWith('.json'))!;
    const summary = JSON.parse(readFileSync(join(directory, summaryName), 'utf8'));
    expect(summary).toMatchObject({ provider: 'lave8', model: 'gpt-5.6-sol', providerTimeoutMs: 90_000, responseAccepted: true,
      ...(valid ? { outcome: 'ok', analysisId: JSON.parse(response.body).id } : { stage: 'output_validation_failed', validationReason: 'unexpected_object_shape' }),
    });
    if (valid) expect(summary).not.toHaveProperty('validationReason');
  });
  it('maps provider failure to provider_failed and preserves the generic 502 contract', async () => {
    const events: StructuredLlmAnalysisDiagnosticEvent[] = [];
    const provider = fakeProvider({ generate() { throw new Error('PRIVATE_PROVIDER_DETAIL'); } });
    const runtime = await start(provider, events);
    seed(runtime);

    expectGeneric502(await analyze(runtime));
    expect(provider.calls).toBe(1);
    expect(events).toMatchObject([{ scope: 'analysis', stage: 'provider_failed' }]);
  });

  it('maps structured output rejection to a fixed validation reason without exposing output', async () => {
    const events: StructuredLlmAnalysisDiagnosticEvent[] = [];
    const provider = fakeProvider({ output: { roleSummary: 'PRIVATE_INVALID_OUTPUT' } });
    const runtime = await start(provider, events);
    seed(runtime);

    expectGeneric502(await analyze(runtime));
    expect(provider.calls).toBe(1);
    expect(events).toMatchObject([{
      scope: 'analysis',
      stage: 'output_validation_failed',
      validationReason: 'unexpected_object_shape',
    }]);
    expect(JSON.stringify(events)).not.toContain('PRIVATE_INVALID_OUTPUT');
    expect(JSON.stringify(events)).not.toContain(JD);
  });

  it('reports exact-JD grounding failure by fixed enum only', async () => {
    const events: StructuredLlmAnalysisDiagnosticEvent[] = [];
    const output = validOutput();
    const provider = fakeProvider({
      output: {
        ...output,
        responsibilityFindings: [{
          ...output.responsibilityFindings[0],
          evidence: [{ source: 'full_jd', excerpt: 'PRIVATE_PARAPHRASED_EXCERPT' }],
        }],
      },
    });
    const runtime = await start(provider, events);
    seed(runtime);

    expectGeneric502(await analyze(runtime));
    expect(provider.calls).toBe(1);
    expect(events).toMatchObject([{
      scope: 'analysis',
      stage: 'output_validation_failed',
      validationReason: 'full_jd_excerpt_not_exact',
    }]);
    expect(JSON.stringify(events)).not.toContain('PRIVATE_PARAPHRASED_EXCERPT');
  });

  it('reports disallowed structured evidence code by fixed enum only', async () => {
    const events: StructuredLlmAnalysisDiagnosticEvent[] = [];
    const output = validOutput();
    const provider = fakeProvider({
      output: {
        ...output,
        riskInterpretation: {
          ...output.riskInterpretation,
          concerns: [{ source: 'opportunity', code: 'PRIVATE_INVENTED_CODE' }],
        },
      },
    });
    const runtime = await start(provider, events);
    seed(runtime);

    expectGeneric502(await analyze(runtime));
    expect(provider.calls).toBe(1);
    expect(events).toMatchObject([{
      scope: 'analysis',
      stage: 'output_validation_failed',
      validationReason: 'structured_evidence_code_not_allowed',
    }]);
    expect(JSON.stringify(events)).not.toContain('PRIVATE_INVENTED_CODE');
  });

  it('maps a corrupted authoritative source to invalid_source before any provider call', async () => {
    const events: StructuredLlmAnalysisDiagnosticEvent[] = [];
    const provider = fakeProvider();
    const runtime = await start(provider, events);
    const jobId = seed(runtime);
    expect(runtime.database.analyses.analyzeJob(jobId)).not.toBeNull();
    inspect(runtime, (database) => database.prepare("UPDATE deterministic_job_analyses SET analysis_json = '{}'").run());

    expectGeneric502(await analyze(runtime));
    expect(provider.calls).toBe(0);
    expect(events).toMatchObject([{ scope: 'analysis', stage: 'invalid_source' }]);
  });

  it('maps a source mutation during provider await to source_changed and persists no stale analysis', async () => {
    const events: StructuredLlmAnalysisDiagnosticEvent[] = [];
    const runtimeHolder: { current: LocalRuntime | null } = { current: null };
    const provider = fakeProvider({
      async generate() {
        runtimeHolder.current!.database.observations.append(observation({
          capturedAt: new Date(Date.now() + 1_000).toISOString(),
          title: '更新后的岗位标题',
        }));
        await Promise.resolve();
        return validOutput();
      },
    });
    const runtime = await start(provider, events);
    runtimeHolder.current = runtime;
    seed(runtime);

    expectGeneric502(await analyze(runtime));
    expect(provider.calls).toBe(1);
    expect(events).toMatchObject([{ scope: 'analysis', stage: 'source_changed' }]);
    expect(inspect(runtime, (database) => database.prepare('SELECT COUNT(*) AS count FROM structured_llm_analyses').get())).toEqual({ count: 0 });
  });

  it('maps a corrupted cached analysis to stored_analysis_invalid without a second provider call', async () => {
    const events: StructuredLlmAnalysisDiagnosticEvent[] = [];
    const provider = fakeProvider();
    const runtime = await start(provider, events);
    seed(runtime);

    const first = await analyze(runtime);
    expect(first.statusCode).toBe(200);
    expect(provider.calls).toBe(1);
    inspect(runtime, (database) => database.prepare("UPDATE structured_llm_analyses SET analysis_json = '{}'").run());
    events.length = 0;

    expectGeneric502(await analyze(runtime));
    expect(provider.calls).toBe(1);
    expect(events).toMatchObject([{ scope: 'analysis', stage: 'stored_analysis_invalid' }]);
  });

  it('maps unknown persistence failures to internal_or_persistence and leaks no SQLite detail', async () => {
    const events: StructuredLlmAnalysisDiagnosticEvent[] = [];
    const provider = fakeProvider();
    const runtime = await start(provider, events);
    seed(runtime);
    inspect(runtime, (database) => database.exec(`
      CREATE TRIGGER fail_structured_llm_insert
      BEFORE INSERT ON structured_llm_analyses
      BEGIN
        SELECT RAISE(ABORT, 'PRIVATE_SQLITE_DIAGNOSTIC_SENTINEL');
      END;
    `));

    expectGeneric502(await analyze(runtime));
    expect(provider.calls).toBe(1);
    expect(events).toMatchObject([{ scope: 'analysis', stage: 'internal_or_persistence' }]);
    expect(JSON.stringify(events)).not.toContain('PRIVATE_SQLITE_DIAGNOSTIC_SENTINEL');
  });

  it('does not emit failure diagnostics for normal job_not_found or analysis_unavailable results', async () => {
    const events: StructuredLlmAnalysisDiagnosticEvent[] = [];
    const provider = fakeProvider();
    const runtime = await start(provider, events);

    const missing = await analyze(runtime);
    expect(missing.statusCode).toBe(404);
    expect(JSON.parse(missing.body)).toEqual({ error: 'job_not_found' });

    seed(runtime, observation({ fullJdText: null }));
    const unavailable = await analyze(runtime);
    expect(unavailable.statusCode).toBe(422);
    expect(JSON.parse(unavailable.body)).toEqual({ error: 'analysis_unavailable' });
    expect(provider.calls).toBe(0);
    expect(events).toMatchObject([]);
  });

  it('ignores a diagnostic callback failure and rethrows the original provider failure to the generic HTTP boundary', async () => {
    const provider = fakeProvider({ generate() { throw new Error('PRIVATE_PROVIDER_DETAIL'); } });
    const runtime = await start(provider, [], () => {
      throw new Error('PRIVATE_DIAGNOSTIC_OBSERVER_FAILURE');
    });
    seed(runtime);

    expectGeneric502(await analyze(runtime));
    expect(provider.calls).toBe(1);
    const health = await send(runtime.address.port, 'GET', '/health');
    expect(health.statusCode).toBe(200);
    expect(JSON.parse(health.body)).toEqual({ service: 'boss-job-radar-local', status: 'ok' });
  });
});
