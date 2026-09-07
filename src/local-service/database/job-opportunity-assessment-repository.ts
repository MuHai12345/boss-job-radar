import type SqliteDatabase from 'better-sqlite3';
import { isDeepStrictEqual } from 'node:util';
import { assessJobOpportunity, jobOpportunitySourceStateKey } from '../../domain/opportunity/job-opportunity-assessment.js';
import { JOB_OPPORTUNITY_RULES_VERSION, type JobOpportunityAssessment } from '../../domain/opportunity/job-opportunity-assessment-types.js';
import { parseStoredJobOpportunityAssessment } from '../../domain/opportunity/job-opportunity-assessment-validation.js';
import { observedRecencyBand } from '../../domain/status/job-status-assessment.js';
import { isIsoTimestamp } from '../../shared/job-link-check-types.js';
import { createDeterministicAnalysisRepository } from './deterministic-analysis-repository.js';
import { createJobStatusAssessmentRepository } from './job-status-assessment-repository.js';

export interface JobOpportunityAssessmentRepository {
  assessJob(jobId: number, assessedAt?: string): JobOpportunityAssessment | null;
  getLatestForJob(jobId: number, assessedAt?: string): JobOpportunityAssessment | null;
  refreshAffectedByJobs(jobIds: readonly number[]): void;
  refreshAll(): void;
}

interface AssessmentRow {
  readonly job_id: unknown;
  readonly rules_version: unknown;
  readonly latest_observation_id: unknown;
  readonly jd_observation_id: unknown;
  readonly latest_link_check_id: unknown;
  readonly source_state_key: unknown;
  readonly growth_band: unknown;
  readonly career_switch_status: unknown;
  readonly priority_tier: unknown;
  readonly assessment_json: unknown;
  readonly assessed_at: unknown;
}

function invalidStored(): never { throw new Error('Invalid stored job opportunity assessment'); }

export function createJobOpportunityAssessmentRepository(database: SqliteDatabase.Database): JobOpportunityAssessmentRepository {
  // All derived SQL is prepared on use, never during database opening.
  function validateOwnership(result: JobOpportunityAssessment): void {
    const source = result.source;
    for (const id of new Set([
      source.latestObservationId, source.jdObservationId,
      source.recruiterActivityObservationId, source.publishedObservationId,
    ])) {
      if (id === null) continue;
      const row = database.prepare('SELECT job_id FROM job_observations WHERE id = ?').get(id) as { job_id: number } | undefined;
      if (row?.job_id !== result.jobId) invalidStored();
    }
    if (source.latestLinkCheckId !== null) {
      const row = database.prepare('SELECT job_id FROM job_link_checks WHERE id = ?')
        .get(source.latestLinkCheckId) as { job_id: number } | undefined;
      if (row?.job_id !== result.jobId) invalidStored();
    }
  }

  const assessTransaction = database.transaction((jobId: number, assessedAt: string): JobOpportunityAssessment | null => {
    const analyses = createDeterministicAnalysisRepository(database);
    const analysis = analyses.getLatestForJob(jobId) ?? analyses.analyzeJob(jobId);
    if (analysis === null) return null;
    const status = createJobStatusAssessmentRepository(database).getLatestForJob(jobId, assessedAt);
    if (status === null) throw new Error('Invalid job opportunity source');
    const result = assessJobOpportunity(analysis, status, assessedAt);
    const key = jobOpportunitySourceStateKey(result.source);
    const row = database.prepare(`
      SELECT * FROM job_opportunity_assessments
      WHERE job_id = ? AND rules_version = ? AND source_state_key = ?
    `).get(jobId, JOB_OPPORTUNITY_RULES_VERSION, key) as AssessmentRow | undefined;
    if (row !== undefined) {
      const stored = parseStoredJobOpportunityAssessment(row.assessment_json);
      if (stored.jobId !== row.job_id || stored.rulesVersion !== row.rules_version
        || stored.source.latestObservationId !== row.latest_observation_id
        || stored.source.jdObservationId !== row.jd_observation_id
        || stored.source.latestLinkCheckId !== row.latest_link_check_id
        || jobOpportunitySourceStateKey(stored.source) !== row.source_state_key
        || stored.growthValue.band !== row.growth_band
        || stored.careerSwitchValue.status !== row.career_switch_status
        || stored.priority.tier !== row.priority_tier || stored.assessedAt !== row.assessed_at
        || observedRecencyBand(status.localObservation.lastSeenAt, stored.assessedAt) !== stored.source.localObservationRecencyBand
        // Reuse confirmed upstream evidence, without scanning JD. Retain the original timestamp.
        || !isDeepStrictEqual(stored, { ...result, assessedAt: stored.assessedAt })) invalidStored();
      validateOwnership(stored);
      return stored;
    }
    const json = JSON.stringify(result);
    parseStoredJobOpportunityAssessment(json);
    validateOwnership(result);
    database.prepare(`
      INSERT INTO job_opportunity_assessments (
        job_id, rules_version, latest_observation_id, jd_observation_id, latest_link_check_id,
        source_state_key, growth_band, career_switch_status, priority_tier, assessment_json, assessed_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(jobId, result.rulesVersion, result.source.latestObservationId, result.source.jdObservationId,
      result.source.latestLinkCheckId, key, result.growthValue.band, result.careerSwitchValue.status,
      result.priority.tier, json, assessedAt);
    return result;
  });

  function assessJob(jobId: number, assessedAt = new Date().toISOString()): JobOpportunityAssessment | null {
    if (!Number.isSafeInteger(jobId) || jobId <= 0) throw new Error('Job id must be a positive safe integer');
    if (!isIsoTimestamp(assessedAt)) throw new Error('Invalid assessment time.');
    return assessTransaction.immediate(jobId, assessedAt);
  }

  function refreshAffectedByJobs(jobIds: readonly number[]): void {
    let failed = false;
    for (const jobId of new Set(jobIds)) {
      try { assessJob(jobId); } catch { failed = true; }
    }
    if (failed) throw new Error('Job opportunity assessment refresh failed.');
  }

  return {
    assessJob,
    getLatestForJob: assessJob,
    refreshAffectedByJobs,
    refreshAll() {
      const rows = database.prepare('SELECT id FROM jobs ORDER BY id').all() as Array<{ id: number }>;
      refreshAffectedByJobs(rows.map((row) => row.id));
    },
  };
}
