import type SqliteDatabase from 'better-sqlite3';
import { analyzeDeterministicJob } from '../../domain/analysis/deterministic-job-analysis.js';
import { DETERMINISTIC_RULES_VERSION, type DeterministicJobAnalysis } from '../../domain/analysis/deterministic-job-analysis-types.js';
import { parseStoredDeterministicAnalysis } from '../../domain/analysis/deterministic-job-analysis-validation.js';
import { createJobObservationRepository } from './observation-repository.js';

export interface DeterministicAnalysisRepository {
  analyzeJob(jobId: number): DeterministicJobAnalysis | null;
  getLatestForJob(jobId: number): DeterministicJobAnalysis | null;
  refreshAll(): void;
}

interface AnalysisRow {
  readonly job_id: number;
  readonly latest_observation_id: number;
  readonly jd_observation_id: number | null;
  readonly rules_version: string;
  readonly job_nature_status: string;
  readonly experience_status: string;
  readonly hard_minimum_years: number | null;
  readonly analysis_json: unknown;
}

function validateJobId(jobId: number): void {
  if (!Number.isSafeInteger(jobId) || jobId <= 0) throw new Error('Job id must be a positive safe integer');
}

function readAnalysis(row: AnalysisRow): DeterministicJobAnalysis {
  const result = parseStoredDeterministicAnalysis(row.analysis_json);
  if (result.jobId !== row.job_id || result.source.latestObservationId !== row.latest_observation_id
    || result.source.jdObservationId !== row.jd_observation_id || result.rulesVersion !== row.rules_version
    || result.jobNature.status !== row.job_nature_status || result.experience.status !== row.experience_status
    || result.experience.hardMinimumYears !== row.hard_minimum_years) {
    throw new Error('Invalid stored deterministic analysis');
  }
  return result;
}

export function createDeterministicAnalysisRepository(database: SqliteDatabase.Database): DeterministicAnalysisRepository {
  // Prepare SQL lazily: analysis initialization cannot prevent the capture DB opening.
  function getLatestForJob(jobId: number): DeterministicJobAnalysis | null {
    validateJobId(jobId);
    const row = database.prepare(`
      SELECT analysis.* FROM deterministic_job_analyses AS analysis
      JOIN jobs ON jobs.id = analysis.job_id
      WHERE jobs.id = ? AND analysis.latest_observation_id = jobs.latest_observation_id
        AND analysis.rules_version = ?
    `).get(jobId, DETERMINISTIC_RULES_VERSION) as AnalysisRow | undefined;
    if (row === undefined) return null;
    const result = readAnalysis(row);
    const sources = [result.source.latestObservationId, result.source.jdObservationId].filter((id) => id !== null);
    for (const id of sources) {
      const source = database.prepare('SELECT job_id FROM job_observations WHERE id = ?').get(id) as { job_id: number } | undefined;
      if (source?.job_id !== jobId) throw new Error('Invalid stored deterministic analysis');
    }
    return result;
  }

  const analyzeTransaction = database.transaction((jobId: number): DeterministicJobAnalysis | null => {
    const existing = getLatestForJob(jobId);
    if (existing !== null) return existing;
    const job = database.prepare('SELECT latest_observation_id FROM jobs WHERE id = ?').get(jobId) as { latest_observation_id: number } | undefined;
    if (job === undefined) return null;
    const latest = createJobObservationRepository(database).getById(job.latest_observation_id);
    if (latest === null || latest.jobId !== jobId) throw new Error('Invalid analysis source');

    let jd: { id: number; full_jd_text: string } | null = null;
    const candidates = database.prepare(`
      SELECT id, full_jd_text FROM job_observations
      WHERE job_id = ? AND full_jd_text IS NOT NULL AND trim(full_jd_text) != ''
      ORDER BY captured_at DESC, id DESC
    `).iterate(jobId);
    for (const candidate of candidates) {
      const row = candidate as { id: number; full_jd_text: string };
      // JS trim also excludes newline/tab/Unicode-only observations.
      if (row.full_jd_text.trim()) { jd = row; break; }
    }
    const result = analyzeDeterministicJob({
      jobId, latestObservationId: latest.id, jdObservationId: jd?.id ?? null,
      title: latest.title, tags: latest.tags, experienceText: latest.experienceText,
      fullJdText: jd?.full_jd_text ?? null,
    });
    const json = JSON.stringify(result);
    parseStoredDeterministicAnalysis(json);
    database.prepare(`
      INSERT INTO deterministic_job_analyses (
        job_id, latest_observation_id, jd_observation_id, rules_version,
        job_nature_status, experience_status, hard_minimum_years, analysis_json, analyzed_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(jobId, latest.id, jd?.id ?? null, result.rulesVersion,
      result.jobNature.status, result.experience.status, result.experience.hardMinimumYears,
      json, new Date().toISOString());
    return result;
  });

  function analyzeJob(jobId: number): DeterministicJobAnalysis | null {
    validateJobId(jobId);
    return analyzeTransaction.immediate(jobId);
  }

  return {
    analyzeJob, getLatestForJob,
    refreshAll(): void {
      const pending = database.prepare(`
        SELECT jobs.id FROM jobs
        WHERE NOT EXISTS (
          SELECT 1 FROM deterministic_job_analyses AS analysis
          WHERE analysis.job_id = jobs.id
            AND analysis.latest_observation_id = jobs.latest_observation_id
            AND analysis.rules_version = ?
        ) ORDER BY jobs.id
      `).all(DETERMINISTIC_RULES_VERSION) as Array<{ id: number }>;
      let failed = false;
      for (const { id } of pending) {
        try { analyzeJob(id); } catch { failed = true; }
      }
      if (failed) throw new Error('Deterministic analysis refresh failed.');
    },
  };
}
