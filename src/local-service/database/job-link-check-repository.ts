import type SqliteDatabase from 'better-sqlite3';
import { canonicalCheckableJobUrl, validateJobLinkCheckRequest, type JobLinkCheckRequest } from '../../shared/job-link-check-types.js';
import { refreshJobStatusSafely } from '../job-status-refresh.js';
import { createJobStatusAssessmentRepository } from './job-status-assessment-repository.js';

export interface JobLinkCheckRepository {
  append(request: JobLinkCheckRequest): { id: number } | null;
  appendAvailableForObservations(observationIds: readonly number[]): void;
}

export function createJobLinkCheckRepository(database: SqliteDatabase.Database): JobLinkCheckRepository {
  const appendTransaction = database.transaction((request: JobLinkCheckRequest, observationId: number | null): { id: number; jobId: number } | null => {
    const value = validateJobLinkCheckRequest(request);
    if (value === null) throw new Error('Invalid job link check.');
    const job = database.prepare('SELECT id FROM jobs WHERE job_url = ?').get(value.jobUrl) as { id: number } | undefined;
    if (job === undefined) return null;
    if (observationId !== null) {
      const existing = database.prepare('SELECT id FROM job_link_checks WHERE source_observation_id = ?')
        .get(observationId) as { id: number } | undefined;
      if (existing !== undefined) return { id: existing.id, jobId: job.id };
    }
    const inserted = database.prepare(`
      INSERT INTO job_link_checks (job_id, job_url, observed_at, status, marker_code, source_observation_id, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(job.id, value.jobUrl, value.observedAt, value.status, value.markerCode, observationId, new Date().toISOString());
    const id = Number(inserted.lastInsertRowid);
    if (!Number.isSafeInteger(id) || id <= 0) throw new Error('Invalid job link check id.');
    return { id, jobId: job.id };
  });

  return {
    append(request) {
      const result = appendTransaction.immediate(request, null);
      if (result === null) return null;
      // The link fact is committed before touching the derived assessment.
      refreshJobStatusSafely(() => createJobStatusAssessmentRepository(database).assessJob(result.jobId));
      return { id: result.id };
    },
    appendAvailableForObservations(observationIds) {
      let failed = false;
      for (const id of observationIds) {
        try {
          const row = database.prepare(`
            SELECT job_url, source_page_url, captured_at, title, full_jd_text FROM job_observations
            WHERE id = ? AND page_type = 'job_detail' AND import_run_id IS NOT NULL
          `).get(id) as { job_url: string | null; source_page_url: string; captured_at: string; title: string | null; full_jd_text: string | null } | undefined;
          // Only saved structured detail evidence, never search cards or empty detail shells.
          if (row === undefined || row.job_url === null || (!row.title?.trim() && !row.full_jd_text?.trim())
            || canonicalCheckableJobUrl(row.job_url) !== row.job_url
            || canonicalCheckableJobUrl(row.source_page_url) !== row.job_url) continue;
          appendTransaction.immediate({ jobUrl: row.job_url, observedAt: row.captured_at, status: 'available', markerCode: null }, id);
        } catch { failed = true; }
      }
      if (failed) throw new Error('Job status assessment refresh failed.');
    },
  };
}
