import { mkdtemp, rm } from 'node:fs/promises';
import { request } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

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
  return send(
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
  const runtime = await startLocalRuntime({
    databasePath: await databasePath(),
    port: 0,
    structuredLlmProvider: provider,
    onStructuredLlmDiagnostic: onDiagnostic ?? ((event) => events.push(event)),
  });
  runtimes.push(runtime);
  return runtime;
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
  it('maps provider failure to provider_failed and preserves the generic 502 contract', async () => {
    const events: StructuredLlmAnalysisDiagnosticEvent[] = [];
    const provider = fakeProvider({ generate() { throw new Error('PRIVATE_PROVIDER_DETAIL'); } });
    const runtime = await start(provider, events);
    seed(runtime);

    expectGeneric502(await analyze(runtime));
    expect(provider.calls).toBe(1);
    expect(events).toEqual([{ scope: 'analysis', stage: 'provider_failed' }]);
  });

  it('maps structured output rejection to output_validation_failed without exposing output', async () => {
    const events: StructuredLlmAnalysisDiagnosticEvent[] = [];
    const provider = fakeProvider({ output: { roleSummary: 'PRIVATE_INVALID_OUTPUT' } });
    const runtime = await start(provider, events);
    seed(runtime);

    expectGeneric502(await analyze(runtime));
    expect(provider.calls).toBe(1);
    expect(events).toEqual([{ scope: 'analysis', stage: 'output_validation_failed' }]);
    expect(JSON.stringify(events)).not.toContain('PRIVATE_INVALID_OUTPUT');
  });

  it('maps a corrupted authoritative source to invalid_source before any provider call', async () => {
    const events: StructuredLlmAnalysisDiagnosticEvent[] = [];
    const provider = fakeProvider();
    const runtime = await start(provider, events);
    const jobId = seed(runtime);
    expect(runtime.database.analyses.analyzeJob(jobId)).not.toBeNull();
    runtime.database.raw.prepare("UPDATE deterministic_job_analyses SET analysis_json = '{}'").run();

    expectGeneric502(await analyze(runtime));
    expect(provider.calls).toBe(0);
    expect(events).toEqual([{ scope: 'analysis', stage: 'invalid_source' }]);
  });

  it('maps a source mutation during provider await to source_changed and persists no stale analysis', async () => {
    const events: StructuredLlmAnalysisDiagnosticEvent[] = [];
    let runtime: LocalRuntime;
    const provider = fakeProvider({
      async generate() {
        runtime.database.observations.append(observation({
          capturedAt: new Date(Date.now() + 1_000).toISOString(),
          title: '更新后的岗位标题',
        }));
        await Promise.resolve();
        return validOutput();
      },
    });
    runtime = await start(provider, events);
    seed(runtime);

    expectGeneric502(await analyze(runtime));
    expect(provider.calls).toBe(1);
    expect(events).toEqual([{ scope: 'analysis', stage: 'source_changed' }]);
    expect(runtime.database.raw.prepare('SELECT COUNT(*) AS count FROM structured_llm_analyses').get()).toEqual({ count: 0 });
  });

  it('maps a corrupted cached analysis to stored_analysis_invalid without a second provider call', async () => {
    const events: StructuredLlmAnalysisDiagnosticEvent[] = [];
    const provider = fakeProvider();
    const runtime = await start(provider, events);
    seed(runtime);

    const first = await analyze(runtime);
    expect(first.statusCode).toBe(200);
    expect(provider.calls).toBe(1);
    runtime.database.raw.prepare("UPDATE structured_llm_analyses SET analysis_json = '{}'").run();
    events.length = 0;

    expectGeneric502(await analyze(runtime));
    expect(provider.calls).toBe(1);
    expect(events).toEqual([{ scope: 'analysis', stage: 'stored_analysis_invalid' }]);
  });

  it('maps unknown persistence failures to internal_or_persistence and leaks no SQLite detail', async () => {
    const events: StructuredLlmAnalysisDiagnosticEvent[] = [];
    const provider = fakeProvider();
    const runtime = await start(provider, events);
    seed(runtime);
    runtime.database.raw.exec(`
      CREATE TRIGGER fail_structured_llm_insert
      BEFORE INSERT ON structured_llm_analyses
      BEGIN
        SELECT RAISE(ABORT, 'PRIVATE_SQLITE_DIAGNOSTIC_SENTINEL');
      END;
    `);

    expectGeneric502(await analyze(runtime));
    expect(provider.calls).toBe(1);
    expect(events).toEqual([{ scope: 'analysis', stage: 'internal_or_persistence' }]);
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
    expect(events).toEqual([]);
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
