import { mkdtemp, rm } from 'node:fs/promises';
import { request } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  OPENAI_STRUCTURED_LLM_MODEL_IDS,
} from '../src/domain/llm/openai-structured-llm-provider';
import {
  STRUCTURED_LLM_OUTPUT_SCHEMA_VERSION,
  type StructuredLlmAnalysisOutput,
} from '../src/domain/llm/structured-llm-analysis-types';
import type {
  StructuredLlmProvider,
  StructuredLlmProviderRequest,
} from '../src/domain/llm/structured-llm-provider';
import { startLocalRuntime } from '../src/local-service/runtime';
import {
  LOCAL_SERVICE_HOST,
  startLocalService,
  type ImportBatchWriter,
  type StructuredLlmAnalysisWriter,
} from '../src/local-service/server';
import { formatStartupError } from '../src/local-service/startup-error';
import {
  BOSS_JOB_RADAR_OPENAI_API_KEY_ENV,
  BOSS_JOB_RADAR_OPENAI_MODEL_ENV,
  parseStructuredLlmRuntimeConfig,
} from '../src/local-service/structured-llm-runtime-config';
import { validateStructuredLlmAnalysisRequest } from '../src/shared/structured-llm-analysis-request';
import type { JobObservationInput } from '../src/shared/job-observation-types';

const JOB_URL = 'https://www.zhipin.com/job_detail/llm-trigger-example.html';
const MISSING_JD_URL = 'https://www.zhipin.com/job_detail/llm-trigger-missing-jd.html';
const UNKNOWN_JOB_URL = 'https://www.zhipin.com/job_detail/llm-trigger-unknown.html';
const JD = [
  '岗位职责：',
  '负责商品上下架与商品维护',
  '负责店铺日常运营',
  '负责活动报名与大促执行',
  '负责数据分析与转化率复盘',
  '岗位要求：接受无经验和转行候选人',
].join('\n');

const IMPORTS: ImportBatchWriter = {
  importBatch() {
    return { ids: [] };
  },
};

interface LocalResponse {
  readonly body: string;
  readonly statusCode: number | undefined;
}

const temporaryDirectories: string[] = [];

afterEach(async () => {
  vi.restoreAllMocks();
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) =>
      rm(directory, { force: true, recursive: true }),
    ),
  );
});

async function createTemporaryDatabasePath(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), 'boss-job-radar-llm-trigger-'));
  temporaryDirectories.push(directory);
  return join(directory, 'boss-job-radar.sqlite3');
}

function send(
  port: number,
  method: string,
  path: string,
  headers: Record<string, string> = {},
  body = '',
): Promise<LocalResponse> {
  return new Promise((resolve, reject) => {
    const client = request(
      {
        host: LOCAL_SERVICE_HOST,
        port,
        method,
        path,
        headers,
      },
      (response) => {
        const chunks: Buffer[] = [];
        response.on('data', (chunk: Buffer) => chunks.push(chunk));
        response.on('end', () => {
          resolve({
            body: Buffer.concat(chunks).toString('utf8'),
            statusCode: response.statusCode,
          });
        });
      },
    );
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
    origin: 'chrome-extension://synthetic-extension-id',
    'x-boss-job-radar-token': token,
  };
}

function observation(
  jobUrl = JOB_URL,
  overrides: Partial<JobObservationInput> = {},
): JobObservationInput {
  const capturedAt = new Date().toISOString();
  const pathname = new URL(jobUrl).pathname;
  return {
    capturedAt,
    pageType: 'job_detail',
    sourcePageUrl: jobUrl,
    jobHrefRaw: pathname,
    jobUrl,
    title: '电商运营助理',
    companyName: '本地测试公司',
    salaryText: '8-10K',
    locationText: '上海',
    experienceText: '经验不限',
    educationText: '本科',
    tags: ['电商运营'],
    recruiterActivityText: '刚刚活跃',
    publishedText: '今日发布',
    fullJdText: JD,
    rawText: '本地测试原始页面文本',
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
      summary: '可结合上游确定性结论理解转行可行性。',
      supports: [],
      concerns: [],
    },
    growthInterpretation: {
      summary: '职责覆盖多个电商运营模块。',
      supports: [],
      concerns: [],
    },
    riskInterpretation: {
      summary: '风险解释仅基于当前岗位输入。',
      supports: [],
      concerns: [],
    },
    ambiguities: [],
    interviewQuestions: [],
    confidence: 'high',
  };
}

function fakeProvider(options: {
  readonly output?: unknown;
  readonly generate?: (request: StructuredLlmProviderRequest) => unknown | Promise<unknown>;
} = {}): StructuredLlmProvider & {
  calls: number;
  requests: StructuredLlmProviderRequest[];
} {
  const provider: StructuredLlmProvider & {
    calls: number;
    requests: StructuredLlmProviderRequest[];
  } = {
    providerId: 'fake-local-provider',
    modelId: 'fake-local-model',
    calls: 0,
    requests: [],
    async generate(request): Promise<unknown> {
      provider.calls += 1;
      provider.requests.push(request);
      if (options.generate !== undefined) return options.generate(request);
      return options.output ?? validOutput();
    },
  };
  return provider;
}

describe('structured LLM runtime configuration', () => {
  it('uses product-specific environment variable names and stays disabled by default', () => {
    expect(BOSS_JOB_RADAR_OPENAI_API_KEY_ENV).toBe('BOSS_JOB_RADAR_OPENAI_API_KEY');
    expect(BOSS_JOB_RADAR_OPENAI_MODEL_ENV).toBe('BOSS_JOB_RADAR_OPENAI_MODEL');
    expect(parseStructuredLlmRuntimeConfig(undefined, undefined)).toEqual({ enabled: false });
  });

  it('requires an explicit approved model and preserves the original secret value', () => {
    expect(Object.isFrozen(OPENAI_STRUCTURED_LLM_MODEL_IDS)).toBe(true);
    const apiKey = '  sk-local-test-key  ';
    for (const modelId of ['gpt-5.6-luna', 'gpt-5.6-terra', 'gpt-5.6-sol']) {
      expect(parseStructuredLlmRuntimeConfig(apiKey, modelId)).toEqual({
        enabled: true,
        apiKey,
        modelId,
      });
    }
  });

  it('fails closed for partial, blank, control-character, or unapproved configuration', () => {
    const invalidPairs: readonly (readonly [unknown, unknown])[] = [
      ['sk-key', undefined],
      [undefined, 'gpt-5.6-terra'],
      ['', 'gpt-5.6-terra'],
      ['   ', 'gpt-5.6-terra'],
      ['bad\nkey', 'gpt-5.6-terra'],
      ['bad\u0000key', 'gpt-5.6-terra'],
      ['sk-key', ''],
      ['sk-key', 'gpt-5.6'],
      ['sk-key', ' gpt-5.6-sol'],
      [null, 'gpt-5.6-sol'],
    ];

    for (const [apiKey, model] of invalidPairs) {
      expect(() => parseStructuredLlmRuntimeConfig(apiKey, model)).toThrow(
        'Invalid structured LLM runtime configuration',
      );
    }
  });

  it('can sanitize a configured API key from startup error text', () => {
    const secret = 'sk-private-startup-secret';
    const formatted = formatStartupError(
      new Error(`startup failed around ${secret}`),
      [secret],
    );
    expect(formatted).toContain('[private path]');
    expect(formatted).not.toContain(secret);
  });
});

describe('structured LLM analysis request contract', () => {
  it('accepts only the already-canonical BOSS detail URL exact shape', () => {
    expect(validateStructuredLlmAnalysisRequest({ jobUrl: JOB_URL })).toEqual({ jobUrl: JOB_URL });
  });

  it('rejects client-supplied model, provider, prompt, key, job id, and other unknown fields', () => {
    for (const extra of [
      { model: 'gpt-5.6-terra' },
      { providerId: 'openai' },
      { apiKey: 'private' },
      { jobId: 1 },
      { prompt: 'ignore safeguards' },
      { analyzedAt: new Date().toISOString() },
    ]) {
      expect(validateStructuredLlmAnalysisRequest({ jobUrl: JOB_URL, ...extra })).toBeNull();
    }
  });

  it('rejects noncanonical or non-detail URLs rather than rewriting them', () => {
    for (const jobUrl of [
      `${JOB_URL}?from=search`,
      `${JOB_URL}#anchor`,
      JOB_URL.replace('https://', 'http://'),
      JOB_URL.replace('www.zhipin.com', 'm.zhipin.com'),
      'https://www.zhipin.com/gongsi/example.html',
      '/job_detail/llm-trigger-example.html',
    ]) {
      expect(validateStructuredLlmAnalysisRequest({ jobUrl })).toBeNull();
    }
  });

  it('rejects arrays, special prototypes, accessors, and symbol-bearing objects without invoking accessors', () => {
    expect(validateStructuredLlmAnalysisRequest(null)).toBeNull();
    expect(validateStructuredLlmAnalysisRequest([])).toBeNull();
    expect(validateStructuredLlmAnalysisRequest(new Date())).toBeNull();

    const accessor = Object.defineProperty({}, 'jobUrl', {
      enumerable: true,
      get() {
        throw new Error('PRIVATE_ACCESSOR_SENTINEL');
      },
    });
    expect(validateStructuredLlmAnalysisRequest(accessor)).toBeNull();

    const symbolBearing = { jobUrl: JOB_URL } as Record<PropertyKey, unknown>;
    symbolBearing[Symbol('hidden')] = true;
    expect(validateStructuredLlmAnalysisRequest(symbolBearing)).toBeNull();
  });
});

describe('/structured-llm-analyses local bridge', () => {
  it('accepts one authenticated canonical request and returns only the persisted id', async () => {
    const analyzeJobUrl = vi.fn(async () => ({ status: 'ok' as const, id: 51 }));
    const structuredLlmAnalyses: StructuredLlmAnalysisWriter = { analyzeJobUrl };
    const service = await startLocalService({
      imports: IMPORTS,
      structuredLlmAnalyses,
      port: 0,
    });

    try {
      const token = await sessionToken(service.address.port);
      const response = await send(
        service.address.port,
        'POST',
        '/structured-llm-analyses',
        protectedHeaders(token),
        JSON.stringify({ jobUrl: JOB_URL }),
      );
      expect(response.statusCode).toBe(200);
      expect(JSON.parse(response.body)).toEqual({ id: 51 });
      expect(analyzeJobUrl).toHaveBeenCalledOnce();
      expect(analyzeJobUrl).toHaveBeenCalledWith(JOB_URL);
      expect(response.body).not.toContain('prompt');
      expect(response.body).not.toContain('fullJdText');
    } finally {
      await service.close();
    }
  });

  it('returns the fixed not-configured, not-found, unavailable, and invalid-result contracts', async () => {
    const cases: readonly {
      readonly writer?: StructuredLlmAnalysisWriter;
      readonly statusCode: number;
      readonly body: Record<string, unknown>;
    }[] = [
      {
        statusCode: 503,
        body: { error: 'analysis_not_configured' },
      },
      {
        writer: { analyzeJobUrl: async () => ({ status: 'job_not_found' }) },
        statusCode: 404,
        body: { error: 'job_not_found' },
      },
      {
        writer: { analyzeJobUrl: async () => ({ status: 'analysis_unavailable' }) },
        statusCode: 422,
        body: { error: 'analysis_unavailable' },
      },
      {
        writer: { analyzeJobUrl: async () => ({ status: 'ok', id: 0 }) },
        statusCode: 502,
        body: { error: 'analysis_failed' },
      },
    ];

    for (const current of cases) {
      const service = await startLocalService({
        imports: IMPORTS,
        ...(current.writer === undefined ? {} : { structuredLlmAnalyses: current.writer }),
        port: 0,
      });
      try {
        const token = await sessionToken(service.address.port);
        const response = await send(
          service.address.port,
          'POST',
          '/structured-llm-analyses',
          protectedHeaders(token),
          JSON.stringify({ jobUrl: JOB_URL }),
        );
        expect(response.statusCode).toBe(current.statusCode);
        expect(JSON.parse(response.body)).toEqual(current.body);
      } finally {
        await service.close();
      }
    }
  });

  it('converts provider/repository failures to a generic 502 without exposing details', async () => {
    const privateDetail = 'PRIVATE_PROVIDER_RESPONSE_AND_KEY_SENTINEL';
    const service = await startLocalService({
      imports: IMPORTS,
      structuredLlmAnalyses: {
        async analyzeJobUrl() {
          throw new Error(privateDetail);
        },
      },
      port: 0,
    });
    try {
      const token = await sessionToken(service.address.port);
      const response = await send(
        service.address.port,
        'POST',
        '/structured-llm-analyses',
        protectedHeaders(token),
        JSON.stringify({ jobUrl: JOB_URL }),
      );
      expect(response.statusCode).toBe(502);
      expect(JSON.parse(response.body)).toEqual({ error: 'analysis_failed' });
      expect(response.body).not.toContain(privateDetail);
      expect(response.body).not.toContain(JD);
    } finally {
      await service.close();
    }
  });

  it('rejects wrong Host, non-extension Origin, missing/wrong token, media type, encoding, and method before analysis', async () => {
    const analyzeJobUrl = vi.fn(async () => ({ status: 'ok' as const, id: 1 }));
    const service = await startLocalService({
      imports: IMPORTS,
      structuredLlmAnalyses: { analyzeJobUrl },
      port: 0,
    });
    try {
      const token = await sessionToken(service.address.port);
      const body = JSON.stringify({ jobUrl: JOB_URL });

      expect((await send(service.address.port, 'POST', '/structured-llm-analyses', {
        ...protectedHeaders(token),
        host: `localhost:${service.address.port}`,
      }, body)).statusCode).toBe(403);

      expect((await send(service.address.port, 'POST', '/structured-llm-analyses', {
        ...protectedHeaders(token),
        origin: 'https://example.com',
      }, body)).statusCode).toBe(403);

      const missingToken = protectedHeaders(token);
      delete missingToken['x-boss-job-radar-token'];
      expect((await send(service.address.port, 'POST', '/structured-llm-analyses', missingToken, body)).statusCode).toBe(403);
      expect((await send(service.address.port, 'POST', '/structured-llm-analyses', protectedHeaders('0'.repeat(64)), body)).statusCode).toBe(403);

      expect((await send(service.address.port, 'POST', '/structured-llm-analyses', {
        ...protectedHeaders(token),
        'content-type': 'text/plain',
      }, body)).statusCode).toBe(415);

      expect((await send(service.address.port, 'POST', '/structured-llm-analyses', {
        ...protectedHeaders(token),
        'content-encoding': 'gzip',
      }, body)).statusCode).toBe(415);

      expect((await send(service.address.port, 'GET', '/structured-llm-analyses')).statusCode).toBe(405);
      expect(analyzeJobUrl).not.toHaveBeenCalled();
    } finally {
      await service.close();
    }
  });

  it('rejects malformed JSON, noncanonical/expanded request shapes, and oversized bodies before analysis', async () => {
    const analyzeJobUrl = vi.fn(async () => ({ status: 'ok' as const, id: 1 }));
    const service = await startLocalService({
      imports: IMPORTS,
      structuredLlmAnalyses: { analyzeJobUrl },
      port: 0,
    });
    try {
      const token = await sessionToken(service.address.port);
      const headers = protectedHeaders(token);

      expect((await send(service.address.port, 'POST', '/structured-llm-analyses', headers, '{')).statusCode).toBe(400);
      expect((await send(service.address.port, 'POST', '/structured-llm-analyses', headers, JSON.stringify({
        jobUrl: `${JOB_URL}?query=1`,
      }))).statusCode).toBe(400);
      expect((await send(service.address.port, 'POST', '/structured-llm-analyses', headers, JSON.stringify({
        jobUrl: JOB_URL,
        model: 'gpt-5.6-sol',
      }))).statusCode).toBe(400);

      const oversizedBody = JSON.stringify({
        jobUrl: JOB_URL,
        padding: 'x'.repeat(1_048_576),
      });
      expect((await send(service.address.port, 'POST', '/structured-llm-analyses', headers, oversizedBody)).statusCode).toBe(413);
      expect(analyzeJobUrl).not.toHaveBeenCalled();
    } finally {
      await service.close();
    }
  });
});

describe('structured LLM runtime explicit trigger integration', () => {
  it('keeps provider calls at zero during startup/import/link/status/opportunity work, then calls at most once for an explicit new-state request', async () => {
    const provider = fakeProvider();
    const runtime = await startLocalRuntime({
      databasePath: await createTemporaryDatabasePath(),
      port: 0,
      structuredLlmProvider: provider,
    });

    try {
      expect(provider.calls).toBe(0);

      const input = observation();
      const imported = runtime.database.imports.importBatch({
        clientImportId: '123e4567-e89b-42d3-a456-426614174000',
        source: {
          pageType: 'job_detail',
          pageUrl: JOB_URL,
          capturedAt: input.capturedAt,
          matchedCardCount: null,
          warnings: [],
        },
        observations: [input],
      });
      expect(imported.ids).toHaveLength(1);
      expect(provider.calls).toBe(0);

      const job = runtime.database.jobs.findByJobUrl(JOB_URL);
      expect(job).not.toBeNull();
      runtime.database.statusAssessments.getLatestForJob(job!.id);
      runtime.database.opportunities.getLatestForJob(job!.id);
      expect(provider.calls).toBe(0);

      runtime.database.linkChecks.append({
        jobUrl: JOB_URL,
        observedAt: new Date().toISOString(),
        status: 'available',
        markerCode: null,
      });
      expect(provider.calls).toBe(0);

      expect((await send(runtime.address.port, 'GET', '/health')).statusCode).toBe(200);
      const token = await sessionToken(runtime.address.port);
      expect(provider.calls).toBe(0);

      const first = await send(
        runtime.address.port,
        'POST',
        '/structured-llm-analyses',
        protectedHeaders(token),
        JSON.stringify({ jobUrl: JOB_URL }),
      );
      expect(first.statusCode).toBe(200);
      const firstId = (JSON.parse(first.body) as { id: number }).id;
      expect(firstId).toBeGreaterThan(0);
      expect(provider.calls).toBe(1);

      const second = await send(
        runtime.address.port,
        'POST',
        '/structured-llm-analyses',
        protectedHeaders(token),
        JSON.stringify({ jobUrl: JOB_URL }),
      );
      expect(second.statusCode).toBe(200);
      expect(JSON.parse(second.body)).toEqual({ id: firstId });
      expect(provider.calls).toBe(1);
      expect(provider.requests).toHaveLength(1);
    } finally {
      await runtime.close();
    }
  });

  it('returns not-found and missing-JD results without calling the configured provider', async () => {
    const provider = fakeProvider();
    const runtime = await startLocalRuntime({
      databasePath: await createTemporaryDatabasePath(),
      port: 0,
      structuredLlmProvider: provider,
    });

    try {
      runtime.database.observations.append(observation(MISSING_JD_URL, { fullJdText: null }));
      const token = await sessionToken(runtime.address.port);

      const notFound = await send(
        runtime.address.port,
        'POST',
        '/structured-llm-analyses',
        protectedHeaders(token),
        JSON.stringify({ jobUrl: UNKNOWN_JOB_URL }),
      );
      expect(notFound.statusCode).toBe(404);
      expect(JSON.parse(notFound.body)).toEqual({ error: 'job_not_found' });
      expect(provider.calls).toBe(0);

      const unavailable = await send(
        runtime.address.port,
        'POST',
        '/structured-llm-analyses',
        protectedHeaders(token),
        JSON.stringify({ jobUrl: MISSING_JD_URL }),
      );
      expect(unavailable.statusCode).toBe(422);
      expect(JSON.parse(unavailable.body)).toEqual({ error: 'analysis_unavailable' });
      expect(provider.calls).toBe(0);
    } finally {
      await runtime.close();
    }
  });

  it('maps invalid provider output to generic HTTP failure without persisting a result', async () => {
    const provider = fakeProvider({ output: { invalid: true } });
    const runtime = await startLocalRuntime({
      databasePath: await createTemporaryDatabasePath(),
      port: 0,
      structuredLlmProvider: provider,
    });

    try {
      runtime.database.observations.append(observation());
      const token = await sessionToken(runtime.address.port);
      const response = await send(
        runtime.address.port,
        'POST',
        '/structured-llm-analyses',
        protectedHeaders(token),
        JSON.stringify({ jobUrl: JOB_URL }),
      );
      expect(response.statusCode).toBe(502);
      expect(JSON.parse(response.body)).toEqual({ error: 'analysis_failed' });
      expect(response.body).not.toContain('Invalid structured LLM analysis output');
      expect(provider.calls).toBe(1);
      expect(
        runtime.database.structuredLlmAnalyses.getLatestForJob(
          runtime.database.jobs.findByJobUrl(JOB_URL)!.id,
          provider.providerId,
          provider.modelId,
        ),
      ).toBeNull();
    } finally {
      await runtime.close();
    }
  });

  it('keeps the endpoint unavailable while the runtime remains otherwise healthy when no provider is configured', async () => {
    const runtime = await startLocalRuntime({
      databasePath: await createTemporaryDatabasePath(),
      port: 0,
    });
    try {
      expect((await send(runtime.address.port, 'GET', '/health')).statusCode).toBe(200);
      const token = await sessionToken(runtime.address.port);
      const response = await send(
        runtime.address.port,
        'POST',
        '/structured-llm-analyses',
        protectedHeaders(token),
        JSON.stringify({ jobUrl: JOB_URL }),
      );
      expect(response.statusCode).toBe(503);
      expect(JSON.parse(response.body)).toEqual({ error: 'analysis_not_configured' });
    } finally {
      await runtime.close();
    }
  });
});
