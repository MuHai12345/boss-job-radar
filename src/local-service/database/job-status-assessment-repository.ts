import type SqliteDatabase from 'better-sqlite3';
import {
  assessJobStatus, JOB_STATUS_RULES_VERSION, observedRecencyBand,
  type JobStatusAssessment, type JobStatusSource, type StatusTextSource,
} from '../../domain/status/job-status-assessment.js';
import { isIsoTimestamp, validateJobLinkCheckRequest } from '../../shared/job-link-check-types.js';
import { canonicalBossJobUrl } from '../../shared/boss-url-policy.js';
import { createJobRepository } from './job-repository.js';

export interface JobStatusAssessmentRepository {
  assessJob(jobId: number, assessedAt?: string): JobStatusAssessment | null;
  getLatestForJob(jobId: number, assessedAt?: string): JobStatusAssessment | null;
  refreshAffectedByJobs(jobIds: readonly number[]): void;
  refreshAll(): void;
}

function invalidSource(): never { throw new Error('Invalid job status source.'); }

export function createJobStatusAssessmentRepository(database: SqliteDatabase.Database): JobStatusAssessmentRepository {
  // Prepare derived SQL lazily, so a derived-layer failure cannot block source capture.
  function textSource(jobId: number, column: 'recruiter_activity_text' | 'published_text'): StatusTextSource | null {
    const candidates = database.prepare(`
      SELECT id, captured_at, ${column} AS raw_text FROM job_observations
      WHERE job_id = ? AND ${column} IS NOT NULL
      ORDER BY captured_at DESC, id DESC
    `).iterate(jobId);
    for (const candidate of candidates) {
      const row = candidate as { id: number; captured_at: string; raw_text: string };
      if (typeof row.raw_text !== 'string') invalidSource();
      if (row.raw_text.trim() !== '') return { id: row.id, rawText: row.raw_text, capturedAt: row.captured_at };
    }
    return null;
  }

  function readSource(jobId: number): JobStatusSource | null {
    const job = createJobRepository(database).getById(jobId);
    if (job === null) return null;
    const latest = database.prepare('SELECT job_id FROM job_observations WHERE id = ?')
      .get(job.latestObservationId) as { job_id: number } | undefined;
    if (latest?.job_id !== jobId) invalidSource();
    const row = database.prepare(`
      SELECT id, job_url, observed_at, status, marker_code FROM job_link_checks
      WHERE job_id = ? ORDER BY observed_at DESC, id DESC LIMIT 1
    `).get(jobId) as { id: number; job_url: string; observed_at: string; status: unknown; marker_code: unknown } | undefined;
    let link: JobStatusSource['link'] = null;
    if (row !== undefined) {
      const checked = validateJobLinkCheckRequest({
        jobUrl: row.job_url, observedAt: row.observed_at, status: row.status, markerCode: row.marker_code,
      });
      if (checked === null || checked.jobUrl !== job.jobUrl || !Number.isSafeInteger(row.id) || row.id <= 0) invalidSource();
      link = { id: row.id, status: checked.status, observedAt: checked.observedAt, markerCode: checked.markerCode };
    }
    return {
      jobId, jobUrl: job.jobUrl !== null && canonicalBossJobUrl(job.jobUrl) === job.jobUrl ? job.jobUrl : null,
      latestObservationId: job.latestObservationId,
      firstSeenAt: job.firstSeenAt, lastSeenAt: job.lastSeenAt,
      recruiter: textSource(jobId, 'recruiter_activity_text'), published: textSource(jobId, 'published_text'), link,
    };
  }

  function sourceKey(source: JobStatusSource, assessedAt: string): string {
    if (!isIsoTimestamp(assessedAt)) throw new Error('Invalid assessment time.');
    return JSON.stringify([
      source.latestObservationId, source.recruiter?.id ?? null, source.published?.id ?? null,
      source.link?.id ?? null, source.jobUrl, source.firstSeenAt, source.lastSeenAt,
      observedRecencyBand(source.lastSeenAt, assessedAt),
    ]);
  }

  function readCurrent(source: JobStatusSource, assessedAt: string): JobStatusAssessment | null {
    const key = sourceKey(source, assessedAt);
    const row = database.prepare(`
      SELECT * FROM job_status_assessments
      WHERE job_id = ? AND rules_version = ? AND source_state_key = ?
    `).get(source.jobId, JOB_STATUS_RULES_VERSION, key) as {
      assessment_json: unknown; assessed_at: unknown; latest_observation_id: number;
      recruiter_activity_observation_id: number | null; published_observation_id: number | null;
      latest_link_check_id: number | null;
    } | undefined;
    if (row === undefined) return null;
    if (typeof row.assessment_json !== 'string' || !isIsoTimestamp(row.assessed_at)) invalidSource();
    // Validate the complete persisted value against deterministic source facts at its own assessment time.
    // No unchecked JSON cast, stale fallback or rewriting historical timestamps.
    const expected = assessJobStatus(source, row.assessed_at);
    const stored: unknown = JSON.parse(row.assessment_json);
    if (JSON.stringify(stored) !== JSON.stringify(expected) || sourceKey(source, row.assessed_at) !== key
      || row.latest_observation_id !== expected.latestObservationId
      || row.recruiter_activity_observation_id !== expected.recruiterActivityObservationId
      || row.published_observation_id !== expected.publishedObservationId
      || row.latest_link_check_id !== expected.latestLinkCheckId) invalidSource();
    return expected;
  }

  const assessTransaction = database.transaction((jobId: number, assessedAt: string): JobStatusAssessment | null => {
    const source = readSource(jobId);
    if (source === null) return null;
    const existing = readCurrent(source, assessedAt);
    if (existing !== null) return existing;
    const result = assessJobStatus(source, assessedAt);
    database.prepare(`
      INSERT INTO job_status_assessments (
        job_id, rules_version, latest_observation_id, recruiter_activity_observation_id,
        published_observation_id, latest_link_check_id, source_state_key, assessment_json, assessed_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(jobId, result.rulesVersion, result.latestObservationId, result.recruiterActivityObservationId,
      result.publishedObservationId, result.latestLinkCheckId, sourceKey(source, assessedAt), JSON.stringify(result), assessedAt);
    return result;
  });

  function assessJob(jobId: number, assessedAt = new Date().toISOString()): JobStatusAssessment | null {
    return assessTransaction.immediate(jobId, assessedAt);
  }
  function refreshAffectedByJobs(jobIds: readonly number[]): void {
    let failed = false;
    for (const jobId of new Set(jobIds)) {
      try { assessJob(jobId); } catch { failed = true; }
    }
    if (failed) throw new Error('Job status assessment refresh failed.');
  }
  return {
    assessJob,
    getLatestForJob(jobId, assessedAt = new Date().toISOString()) {
      const source = readSource(jobId);
      return source === null ? null : readCurrent(source, assessedAt);
    },
    refreshAffectedByJobs,
    refreshAll() {
      const rows = database.prepare('SELECT id FROM jobs ORDER BY id').all() as Array<{ id: number }>;
      refreshAffectedByJobs(rows.map((row) => row.id));
    },
  };
}
