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
  CURRENT_SCHEMA_VERSION,
  runMigrations,
} from '../src/local-service/database/migrations';
import { createJobObservationRepository } from '../src/local-service/database/observation-repository';
import { createStructuredLlmAnalysisRepository } from '../src/local-service/database/structured-llm-analysis-repository';
import type { JobObservationInput } from '../src/shared/job-observation-types';

const JOB_URL = 'https://www.zhipin.com/job_detail/structured-llm-example.html';
const AT = '2026-09-07T12:00:00.000Z';
const JD = [
  '岗位职责：',
  '负责商品上下架与商品维护',
  '负责店铺日常运营',
  '负责活动报名与大促执行',
  '负责数据分析与转化率复盘',
  '岗位要求：',
  '接受无经验和转行候选人',
].join('\n');

const connections: SqliteDatabase.Database[] = [];
afterEach(() => {
  vi.restoreAllMocks();
  for (const database of connections.splice(0)) database.close();
});

function observation(overrides: Partial<JobObservationInput> = {}): JobObservationInput {
  return {
    capturedAt: '2026-09-07T08:00:00.000Z',
    pageType: 'job_detail',
    sourcePageUrl: JOB_URL,
    jobHrefRaw: '/job_detail/structured-llm-example.html',
    jobUrl: JOB_URL,
    title: '电商运营助理',
    companyName: '不应进入模型最小输入的公司',
    salaryText: '8-10K',
    locationText: '上海',
    experienceText: '经验不限',
    educationText: '本科',
    tags: ['电商运营'],
    recruiterActivityText: '刚刚活跃',
    publishedText: '今日发布',
    fullJdText: JD,
    rawText: '不应进入模型最小输入的原始整页文本',
    missingFields: [],
    warnings: [],
    ...overrides,
  };
}

function validOutput(): StructuredLlmAnalysisOutput {
  return {
    schemaVersion: STRUCTURED_LLM_OUTPUT_SCHEMA_VERSION,
    roleSummary: '岗位覆盖商品、店铺、活动和数据运营职责。',
    responsibilityFindings: [
      {
        kind: 'core_ops',
        statement: '包含商品维护职责。',
        evidence: [{ source: 'full_jd', excerpt: '负责商品上下架与商品维护' }],
      },
    ],
    careerSwitchInterpretation: {
      summary: '可结合已验证的上游转行结论理解该岗位。',
      supports: [],
      concerns: [],
    },
    growthInterpretation: {
      summary: '职责覆盖多个运营模块。',
      supports: [],
      concerns: [],
    },
    riskInterpretation: {
      summary: '风险解释仅基于当前输入。',
      supports: [],
      concerns: [],
    },
    ambiguities: [],
    interviewQuestions: [],
    confidence: 'high',
  };
}

function setup(seed: JobObservationInput | null = observation()) {
  const database = new SqliteDatabase(':memory:');
  connections.push(database);
  database.pragma('foreign_keys = ON');
  runMigrations(database);
  const observations = createJobObservationRepository(database);
  const structured = createStructuredLlmAnalysisRepository(database);
  let jobId: number | null = null;
  if (seed !== null) {
    const saved = observations.append(seed);
    jobId = observations.getById(saved.id)!.jobId;
  }
  return { database, observations, structured, jobId };
}

function fakeProvider(options: {
  providerId?: string;
  modelId?: string;
  output?: unknown;
  generate?: (request: StructuredLlmProviderRequest) => unknown | Promise<unknown>;
} = {}): StructuredLlmProvider & { calls: number; requests: StructuredLlmProviderRequest[] } {
  const provider = {
    providerId: options.providerId ?? 'fake-provider',
    modelId: options.modelId ?? 'fake-model-v1',
    calls: 0,
    requests: [] as StructuredLlmProviderRequest[],
    async generate(request: StructuredLlmProviderRequest): Promise<unknown> {
      provider.calls += 1;
      provider.requests.push(request);
      if (options.generate) return options.generate(request);
      return options.output ?? validOutput();
    },
  };
  return provider;
}

describe('structured LLM schema v8', () => {
  it('creates only the append-only persistence table/index and advances the schema to 8', () => {
    const { database } = setup(null);
    expect(CURRENT_SCHEMA_VERSION).toBe(8);
    expect(database.prepare("SELECT version, name FROM schema_migrations WHERE version = 8").get()).toEqual({
      version: 8,
      name: 'create_structured_llm_analyses',
    });
    expect(database.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'structured_llm_analyses'").get()).toEqual({
      name: 'structured_llm_analyses',
    });
    expect(database.prepare("SELECT name FROM sqlite_master WHERE type = 'index' AND name = 'idx_structured_llm_analyses_current'").get()).toEqual({
      name: 'idx_structured_llm_analyses_current',
    });
    expect(database.prepare('SELECT COUNT(*) AS count FROM structured_llm_analyses').get()).toEqual({ count: 0 });
  });
});

describe('structured LLM explicit analysis orchestration', () => {
  it('calls a fake provider outside SQLite transactions, persists once, and is idempotent for the same source state', async () => {
    const { database, structured, jobId } = setup();
    const provider = fakeProvider({
      generate() {
        expect(database.inTransaction).toBe(false);
        return validOutput();
      },
    });

    const first = await structured.analyzeJob(jobId!, provider, AT);
    expect(first).toMatchObject({
      id: expect.any(Number),
      jobId,
      providerId: 'fake-provider',
      modelId: 'fake-model-v1',
      analysis: { schemaVersion: STRUCTURED_LLM_OUTPUT_SCHEMA_VERSION },
      analyzedAt: AT,
    });
    expect(provider.calls).toBe(1);
    expect(database.inTransaction).toBe(false);
    expect(database.prepare('SELECT COUNT(*) AS count FROM structured_llm_analyses').get()).toEqual({ count: 1 });

    const second = await structured.analyzeJob(jobId!, provider, AT);
    expect(second).toEqual(first);
    expect(provider.calls).toBe(1);
    expect(structured.getLatestForJob(jobId!, provider.providerId, provider.modelId, AT)).toEqual(first);
  });

  it('keeps different provider/model identities independent for the same job source state', async () => {
    const { database, structured, jobId } = setup();
    const firstProvider = fakeProvider({ providerId: 'provider-a', modelId: 'model-a' });
    const secondProvider = fakeProvider({ providerId: 'provider-b', modelId: 'model-b' });

    const first = await structured.analyzeJob(jobId!, firstProvider, AT);
    const second = await structured.analyzeJob(jobId!, secondProvider, AT);

    expect(first?.source.sourceStateKey).toBe(second?.source.sourceStateKey);
    expect(first?.id).not.toBe(second?.id);
    expect(firstProvider.calls).toBe(1);
    expect(secondProvider.calls).toBe(1);
    expect(database.prepare('SELECT COUNT(*) AS count FROM structured_llm_analyses').get()).toEqual({ count: 2 });
  });

  it('does not call the provider when a complete JD source is missing', async () => {
    const { database, structured, jobId } = setup(observation({ fullJdText: null }));
    const provider = fakeProvider();

    await expect(structured.analyzeJob(jobId!, provider, AT)).resolves.toBeNull();
    expect(provider.calls).toBe(0);
    expect(database.prepare('SELECT COUNT(*) AS count FROM structured_llm_analyses').get()).toEqual({ count: 0 });
  });

  it('converts provider failures to the fixed error without persisting partial data or retrying', async () => {
    const { database, structured, jobId } = setup();
    const provider = fakeProvider({
      generate() {
        throw new Error('PRIVATE_PROVIDER_ERROR_BODY');
      },
    });

    await expect(structured.analyzeJob(jobId!, provider, AT)).rejects.toThrow('Structured LLM provider failed');
    expect(provider.calls).toBe(1);
    expect(database.prepare('SELECT COUNT(*) AS count FROM structured_llm_analyses').get()).toEqual({ count: 0 });
  });

  it('rejects invalid provider output with the validator error and persists nothing', async () => {
    const { database, structured, jobId } = setup();
    const provider = fakeProvider({ output: { roleSummary: 'not enough fields' } });

    await expect(structured.analyzeJob(jobId!, provider, AT)).rejects.toThrow('Invalid structured LLM analysis output');
    expect(provider.calls).toBe(1);
    expect(database.prepare('SELECT COUNT(*) AS count FROM structured_llm_analyses').get()).toEqual({ count: 0 });
  });

  it('rejects a source change that occurs while the provider is awaited and never stores the stale result', async () => {
    const { database, observations, structured, jobId } = setup();
    const provider = fakeProvider({
      async generate() {
        expect(database.inTransaction).toBe(false);
        observations.append(observation({
          capturedAt: '2026-09-07T13:00:00.000Z',
          title: '更新后的岗位标题',
        }));
        await Promise.resolve();
        return validOutput();
      },
    });

    await expect(structured.analyzeJob(jobId!, provider, AT)).rejects.toThrow(
      'Structured LLM source changed during analysis',
    );
    expect(provider.calls).toBe(1);
    expect(database.prepare('SELECT COUNT(*) AS count FROM structured_llm_analyses').get()).toEqual({ count: 0 });
  });

  it('appends a new result when the current source changes after a prior successful analysis', async () => {
    const { database, observations, structured, jobId } = setup();
    const provider = fakeProvider();
    const first = await structured.analyzeJob(jobId!, provider, AT);

    observations.append(observation({
      capturedAt: '2026-09-07T13:00:00.000Z',
      title: '更新后的岗位标题',
    }));
    const second = await structured.analyzeJob(jobId!, provider, '2026-09-07T14:00:00.000Z');

    expect(first?.id).not.toBe(second?.id);
    expect(first?.source.sourceStateKey).not.toBe(second?.source.sourceStateKey);
    expect(provider.calls).toBe(2);
    expect(database.prepare('SELECT COUNT(*) AS count FROM structured_llm_analyses').get()).toEqual({ count: 2 });
  });

  it('treats a local-recency bucket transition as a new semantic source state', async () => {
    const { database, structured, jobId } = setup();
    const provider = fakeProvider();

    const first = await structured.analyzeJob(jobId!, provider, '2026-09-07T12:00:00.000Z');
    const second = await structured.analyzeJob(jobId!, provider, '2026-09-09T12:00:00.000Z');

    expect(first?.source.sourceStateKey).not.toBe(second?.source.sourceStateKey);
    expect(provider.calls).toBe(2);
    expect(database.prepare('SELECT COUNT(*) AS count FROM structured_llm_analyses').get()).toEqual({ count: 2 });
  });

  it('refuses to start provider work while the caller has an active SQLite transaction', async () => {
    const { database, structured, jobId } = setup();
    const provider = fakeProvider();
    database.exec('BEGIN IMMEDIATE');
    try {
      await expect(structured.analyzeJob(jobId!, provider, AT)).rejects.toThrow(
        'Structured LLM analysis requires no active transaction',
      );
      expect(provider.calls).toBe(0);
    } finally {
      database.exec('ROLLBACK');
    }
  });
});

describe('structured LLM stored validation', () => {
  it('fails closed when the current stored JSON wrapper is malformed', async () => {
    const { database, structured, jobId } = setup();
    const provider = fakeProvider();
    await structured.analyzeJob(jobId!, provider, AT);
    database.prepare("UPDATE structured_llm_analyses SET analysis_json = '{}'").run();

    expect(() => structured.getLatestForJob(jobId!, provider.providerId, provider.modelId, AT)).toThrow(
      'Invalid stored structured LLM analysis',
    );
  });

  it('fails closed when indexed provider identity disagrees with the stored wrapper', async () => {
    const { database, structured, jobId } = setup();
    const provider = fakeProvider();
    await structured.analyzeJob(jobId!, provider, AT);
    database.prepare("UPDATE structured_llm_analyses SET model_id = 'tampered-model'").run();

    expect(() => structured.getLatestForJob(jobId!, provider.providerId, 'tampered-model', AT)).toThrow(
      'Invalid stored structured LLM analysis',
    );
  });

  it('fails closed when an indexed source observation is changed to one owned by another Job', async () => {
    const { database, observations, structured, jobId } = setup();
    const provider = fakeProvider();
    await structured.analyzeJob(jobId!, provider, AT);
    const other = observations.append(observation({
      jobUrl: 'https://www.zhipin.com/job_detail/other-job.html',
      sourcePageUrl: 'https://www.zhipin.com/job_detail/other-job.html',
      jobHrefRaw: '/job_detail/other-job.html',
      title: '另一个岗位',
    }));
    database.prepare('UPDATE structured_llm_analyses SET latest_observation_id = ?').run(other.id);

    expect(() => structured.getLatestForJob(jobId!, provider.providerId, provider.modelId, AT)).toThrow(
      'Invalid stored structured LLM analysis',
    );
  });

  it('fails closed when persisted evidence is no longer grounded in its bound JD snapshot', async () => {
    const { database, structured, jobId } = setup();
    const provider = fakeProvider();
    const persisted = await structured.analyzeJob(jobId!, provider, AT);
    const tampered = {
      ...persisted!,
      analysis: {
        ...persisted!.analysis,
        responsibilityFindings: [
          {
            kind: 'core_ops',
            statement: '伪造引用',
            evidence: [{ source: 'full_jd', excerpt: '这段文本并不存在于JD中' }],
          },
        ],
      },
    };
    database.prepare('UPDATE structured_llm_analyses SET analysis_json = ?').run(JSON.stringify(tampered));

    expect(() => structured.getLatestForJob(jobId!, provider.providerId, provider.modelId, AT)).toThrow(
      'Invalid stored structured LLM analysis',
    );
  });
});
