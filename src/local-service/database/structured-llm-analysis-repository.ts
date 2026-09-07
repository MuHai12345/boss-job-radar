import type SqliteDatabase from 'better-sqlite3';
import { isDeepStrictEqual } from 'node:util';
import {
  STRUCTURED_LLM_OUTPUT_SCHEMA_VERSION, STRUCTURED_LLM_PROMPT_VERSION,
  type PersistedStructuredLlmAnalysis, type StructuredLlmAnalysisOutput,
  type StructuredLlmJobInputSnapshot,
} from '../../domain/llm/structured-llm-analysis-types.js';
import { parseStructuredLlmAnalysisOutput, structuredLlmExactObject } from '../../domain/llm/structured-llm-analysis-validation.js';
import { buildStructuredLlmJobInputSnapshot, structuredLlmSourceStateKey } from '../../domain/llm/structured-llm-input.js';
import { buildStructuredLlmPrompt } from '../../domain/llm/structured-llm-prompt.js';
import { validateStructuredLlmProviderIdentity, type StructuredLlmProvider } from '../../domain/llm/structured-llm-provider.js';
import { isIsoTimestamp } from '../../shared/job-link-check-types.js';
import { observedRecencyBand } from '../../domain/status/job-status-assessment.js';
import { createDeterministicAnalysisRepository } from './deterministic-analysis-repository.js';
import { createJobOpportunityAssessmentRepository } from './job-opportunity-assessment-repository.js';
import { createJobStatusAssessmentRepository } from './job-status-assessment-repository.js';
import { createJobRepository } from './job-repository.js';
import { createJobObservationRepository } from './observation-repository.js';

export interface StructuredLlmAnalysisRepository {
  analyzeJob(jobId: number, provider: StructuredLlmProvider, analyzedAt?: string): Promise<PersistedStructuredLlmAnalysis | null>;
  getLatestForJob(jobId: number, providerId: string, modelId: string, analyzedAt?: string): PersistedStructuredLlmAnalysis | null;
}

interface AnalysisRow {
  readonly id: unknown;
  readonly job_id: unknown;
  readonly prompt_version: unknown;
  readonly output_schema_version: unknown;
  readonly provider_id: unknown;
  readonly model_id: unknown;
  readonly latest_observation_id: unknown;
  readonly jd_observation_id: unknown;
  readonly source_state_key: unknown;
  readonly analysis_json: unknown;
  readonly analyzed_at: unknown;
}

function invalidStored(): never { throw new Error('Invalid stored structured LLM analysis'); }
function sourceChanged(): never { throw new Error('Structured LLM source changed during analysis'); }
function positiveId(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0;
}
function validateArguments(jobId: number, analyzedAt: string | undefined): void {
  if (!positiveId(jobId)) throw new Error('Job id must be a positive safe integer');
  if (analyzedAt !== undefined && !isIsoTimestamp(analyzedAt)) throw new Error('Invalid structured LLM analysis time');
}

export function createStructuredLlmAnalysisRepository(database: SqliteDatabase.Database): StructuredLlmAnalysisRepository {
  // Creating the repository performs no source reads, materialization, or provider calls.
  function snapshot(jobId: number, at: string): StructuredLlmJobInputSnapshot | null {
    try {
      const job = createJobRepository(database).getById(jobId);
      if (job === null) return null;
      const analyses = createDeterministicAnalysisRepository(database);
      const deterministic = analyses.getLatestForJob(jobId) ?? analyses.analyzeJob(jobId);
      if (deterministic === null) throw new Error();
      const status = createJobStatusAssessmentRepository(database).getLatestForJob(jobId, at);
      const opportunity = createJobOpportunityAssessmentRepository(database).getLatestForJob(jobId, at);
      if (status === null || opportunity === null) throw new Error();
      const observations = createJobObservationRepository(database);
      const latest = observations.getById(job.latestObservationId);
      if (latest === null || latest.jobId !== jobId) throw new Error();
      if (deterministic.source.jdObservationId === null) return null;
      const jd = observations.getById(deterministic.source.jdObservationId);
      if (jd === null || jd.jobId !== jobId) throw new Error();
      if (jd.fullJdText === null || jd.fullJdText.trim() === '') return null;
      return buildStructuredLlmJobInputSnapshot(jobId, latest, jd, deterministic, status, opportunity);
    } catch {
      throw new Error('Invalid structured LLM source');
    }
  }

  function readStored(
    row: AnalysisRow, input: StructuredLlmJobInputSnapshot, providerId: string, modelId: string,
  ): PersistedStructuredLlmAnalysis {
    try {
      if (typeof row.analysis_json !== 'string') invalidStored();
      const parsed: unknown = JSON.parse(row.analysis_json);
      const wrapper = structuredLlmExactObject(parsed, [
        'id', 'jobId', 'promptVersion', 'outputSchemaVersion', 'providerId', 'modelId', 'source', 'analysis', 'analyzedAt',
      ]);
      const source = structuredLlmExactObject(wrapper.source, ['latestObservationId', 'jdObservationId', 'sourceStateKey']);
      const key = structuredLlmSourceStateKey(input);
      if (!positiveId(wrapper.id) || wrapper.id !== row.id
        || wrapper.jobId !== input.jobId || wrapper.jobId !== row.job_id
        || wrapper.promptVersion !== STRUCTURED_LLM_PROMPT_VERSION || wrapper.promptVersion !== row.prompt_version
        || wrapper.outputSchemaVersion !== STRUCTURED_LLM_OUTPUT_SCHEMA_VERSION || wrapper.outputSchemaVersion !== row.output_schema_version
        || validateStructuredLlmProviderIdentity(wrapper.providerId) !== providerId || wrapper.providerId !== row.provider_id
        || validateStructuredLlmProviderIdentity(wrapper.modelId) !== modelId || wrapper.modelId !== row.model_id
        || source.latestObservationId !== input.latestObservationId || source.latestObservationId !== row.latest_observation_id
        || source.jdObservationId !== input.jdObservationId || source.jdObservationId !== row.jd_observation_id
        || source.sourceStateKey !== key || source.sourceStateKey !== row.source_state_key
        || !isIsoTimestamp(wrapper.analyzedAt) || wrapper.analyzedAt !== row.analyzed_at) invalidStored();
      if (observedRecencyBand(input.status.localObservation.lastSeenAt, wrapper.analyzedAt)
        !== input.status.localObservation.recencyBand) invalidStored();
      for (const id of new Set([input.latestObservationId, input.jdObservationId])) {
        const owner = database.prepare('SELECT job_id FROM job_observations WHERE id = ?').get(id) as { job_id: unknown } | undefined;
        if (owner?.job_id !== input.jobId) invalidStored();
      }
      const result: PersistedStructuredLlmAnalysis = {
        id: wrapper.id, jobId: input.jobId,
        promptVersion: STRUCTURED_LLM_PROMPT_VERSION, outputSchemaVersion: STRUCTURED_LLM_OUTPUT_SCHEMA_VERSION,
        providerId, modelId,
        source: { latestObservationId: input.latestObservationId, jdObservationId: input.jdObservationId, sourceStateKey: key },
        analysis: parseStructuredLlmAnalysisOutput(wrapper.analysis, input), analyzedAt: wrapper.analyzedAt,
      };
      if (!isDeepStrictEqual(parsed, result)) invalidStored();
      return result;
    } catch {
      return invalidStored();
    }
  }

  function current(input: StructuredLlmJobInputSnapshot, providerId: string, modelId: string): PersistedStructuredLlmAnalysis | null {
    const row = database.prepare(`
      SELECT * FROM structured_llm_analyses
      WHERE job_id = ? AND prompt_version = ? AND output_schema_version = ?
        AND provider_id = ? AND model_id = ? AND source_state_key = ?
    `).get(input.jobId, STRUCTURED_LLM_PROMPT_VERSION, STRUCTURED_LLM_OUTPUT_SCHEMA_VERSION,
      providerId, modelId, structuredLlmSourceStateKey(input)) as AnalysisRow | undefined;
    return row === undefined ? null : readStored(row, input, providerId, modelId);
  }

  const readTransaction = database.transaction((jobId: number, providerId: string, modelId: string, at: string) => {
    const input = snapshot(jobId, at);
    return { input, existing: input === null ? null : current(input, providerId, modelId) };
  });

  function unchanged(input: StructuredLlmJobInputSnapshot, at: string): StructuredLlmJobInputSnapshot {
    let latest: StructuredLlmJobInputSnapshot | null;
    try { latest = snapshot(input.jobId, at); } catch { return sourceChanged(); }
    if (latest === null || structuredLlmSourceStateKey(latest) !== structuredLlmSourceStateKey(input)) sourceChanged();
    return latest;
  }

  const rereadTransaction = database.transaction(unchanged);
  const saveTransaction = database.transaction((
    input: StructuredLlmJobInputSnapshot, providerId: string, modelId: string,
    analysis: StructuredLlmAnalysisOutput, analyzedAt: string,
  ): PersistedStructuredLlmAnalysis => {
    // Recheck under the write lock as well, closing the gap between reread and INSERT.
    const latest = unchanged(input, analyzedAt);
    const existing = current(latest, providerId, modelId);
    if (existing !== null) return existing;
    const next = database.prepare(`
      SELECT COALESCE((SELECT seq FROM sqlite_sequence WHERE name = 'structured_llm_analyses'), 0) + 1 AS id
    `).get() as { id: unknown };
    if (!positiveId(next.id)) throw new Error('Invalid structured LLM analysis id');
    const result: PersistedStructuredLlmAnalysis = {
      id: next.id, jobId: input.jobId,
      promptVersion: STRUCTURED_LLM_PROMPT_VERSION, outputSchemaVersion: STRUCTURED_LLM_OUTPUT_SCHEMA_VERSION,
      providerId, modelId,
      source: {
        latestObservationId: input.latestObservationId, jdObservationId: input.jdObservationId,
        sourceStateKey: structuredLlmSourceStateKey(input),
      },
      analysis, analyzedAt,
    };
    // The ID is allocated under the short transaction so the wrapper is inserted once, never updated.
    database.prepare(`
      INSERT INTO structured_llm_analyses (
        id, job_id, prompt_version, output_schema_version, provider_id, model_id,
        latest_observation_id, jd_observation_id, source_state_key, analysis_json, analyzed_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(result.id, result.jobId, result.promptVersion, result.outputSchemaVersion, providerId, modelId,
      result.source.latestObservationId, result.source.jdObservationId, result.source.sourceStateKey,
      JSON.stringify(result), analyzedAt);
    return result;
  });

  return {
    getLatestForJob(jobId, providerId, modelId, analyzedAt) {
      validateArguments(jobId, analyzedAt);
      validateStructuredLlmProviderIdentity(providerId);
      validateStructuredLlmProviderIdentity(modelId);
      return readTransaction.immediate(jobId, providerId, modelId, analyzedAt ?? new Date().toISOString()).existing;
    },
    async analyzeJob(jobId, provider, analyzedAt) {
      validateArguments(jobId, analyzedAt);
      const providerId = validateStructuredLlmProviderIdentity(provider.providerId);
      const modelId = validateStructuredLlmProviderIdentity(provider.modelId);
      // An outer caller-owned transaction would also remain open across await.
      if (database.inTransaction) throw new Error('Structured LLM analysis requires no active transaction');
      const { input, existing } = readTransaction.immediate(jobId, providerId, modelId, analyzedAt ?? new Date().toISOString());
      if (input === null) return null;
      if (existing !== null) return existing;
      const request = buildStructuredLlmPrompt(input);
      let output: unknown;
      try { output = await provider.generate(request); } catch {
        throw new Error('Structured LLM provider failed');
      }
      const analysis = parseStructuredLlmAnalysisOutput(output, input);
      if (database.inTransaction) throw new Error('Structured LLM analysis requires no active transaction');
      rereadTransaction.immediate(input, analyzedAt ?? new Date().toISOString());
      return saveTransaction.immediate(input, providerId, modelId, analysis, analyzedAt ?? new Date().toISOString());
    },
  };
}
