import type SqliteDatabase from 'better-sqlite3';
import { createJobLinkCheckRepository } from './job-link-check-repository.js';
import { createJobStatusAssessmentRepository } from './job-status-assessment-repository.js';
import { refreshJobStatusSafely } from '../job-status-refresh.js';

import type { ImportRequest } from '../../shared/import-request-types.js';
import type { JobObservationRepository } from './observation-repository.js';
import { fingerprintImportRequest } from './import-fingerprint.js';
import { validateImportRequest } from '../import-request-validation.js';
import { createDeterministicAnalysisRepository } from './deterministic-analysis-repository.js';
import { refreshAnalysisSafely } from '../deterministic-analysis-refresh.js';
import { createSalaryDecodingRepository } from './salary-decoding-repository.js';
import { refreshSalaryDecodingSafely } from '../salary-decoding-refresh.js';

export class ImportConflictError extends Error {
  constructor() {
    super('Client import id is already associated with a different payload');
    this.name = 'ImportConflictError';
  }
}

export interface ImportRepository {
  importBatch(request: ImportRequest): { ids: number[] };
}

export function createImportRepository(
  database: SqliteDatabase.Database,
  observations: JobObservationRepository,
): ImportRepository {
  const selectExistingImport = database.prepare(`
    SELECT id, payload_sha256, observation_count
    FROM import_runs
    WHERE client_import_id = ?
  `);
  const selectObservationIds = database.prepare(`
    SELECT id
    FROM job_observations
    WHERE import_run_id = ?
    ORDER BY id
  `);
  const insertImport = database.prepare(`
    INSERT INTO import_runs (
      client_import_id,
      payload_sha256,
      page_type,
      source_page_url,
      captured_at,
      matched_card_count,
      extraction_warnings_json,
      observation_count,
      created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const insertSearchRun = database.prepare(`
    INSERT INTO search_runs (
      import_run_id,
      captured_at,
      source_page_url,
      matched_card_count,
      saved_observation_count,
      extraction_warnings_json,
      created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?)
  `);
  const importTransaction = database.transaction(
    (request: ImportRequest): number[] => {
      if (validateImportRequest(request) === null) {
        throw new TypeError('Invalid import request');
      }
      const fingerprint = fingerprintImportRequest(request);
      const existing = selectExistingImport.get(request.clientImportId) as
        | {
            readonly id: number;
            readonly observation_count: number;
            readonly payload_sha256: string;
          }
        | undefined;
      if (existing !== undefined) {
        if (existing.payload_sha256 !== fingerprint) {
          throw new ImportConflictError();
        }

        const rows = selectObservationIds.all(existing.id) as Array<{
          readonly id: number;
        }>;
        if (rows.length !== existing.observation_count) {
          throw new Error('Stored import observation count is inconsistent');
        }
        return rows.map(({ id }) => id);
      }

      const createdAt = new Date().toISOString();
      const importResult = insertImport.run(
        request.clientImportId,
        fingerprint,
        request.source.pageType,
        request.source.pageUrl,
        request.source.capturedAt,
        request.source.matchedCardCount,
        JSON.stringify(request.source.warnings),
        request.observations.length,
        createdAt,
      );
      const importRunId = toPositiveSafeInteger(
        importResult.lastInsertRowid,
        'import run',
      );

      if (request.source.pageType === 'search_results') {
        insertSearchRun.run(
          importRunId,
          request.source.capturedAt,
          request.source.pageUrl,
          request.source.matchedCardCount,
          request.observations.length,
          JSON.stringify(request.source.warnings),
          createdAt,
        );
      }

      return observations.appendManyForImport(
        importRunId,
        request.observations,
      ).ids;
    },
  );

  return {
    importBatch(request): { ids: number[] } {
      const ids = importTransaction.immediate(request);
      // The source transaction has committed. No analysis error can undo it.
      refreshAnalysisSafely(() => {
        const analyses = createDeterministicAnalysisRepository(database);
        const jobIds = new Set<number>();
        for (const id of ids) {
          const row = database.prepare('SELECT job_id FROM job_observations WHERE id = ?').get(id) as { job_id: number };
          jobIds.add(row.job_id);
        }
        let failed = false;
        for (const jobId of jobIds) {
          try { analyses.analyzeJob(jobId); } catch { failed = true; }
        }
        if (failed) throw new Error('Deterministic analysis refresh failed.');
      });
      refreshSalaryDecodingSafely(() => {
        const jobIds = ids.map((id) => (database.prepare('SELECT job_id FROM job_observations WHERE id = ?').get(id) as { job_id: number }).job_id);
        createSalaryDecodingRepository(database).refreshAffectedByJobs(jobIds);
      });
      refreshJobStatusSafely(() => createJobLinkCheckRepository(database).appendAvailableForObservations(ids));
      refreshJobStatusSafely(() => {
        const jobIds = ids.map((id) => (database.prepare('SELECT job_id FROM job_observations WHERE id = ?').get(id) as { job_id: number }).job_id);
        createJobStatusAssessmentRepository(database).refreshAffectedByJobs(jobIds);
      });
      return { ids };
    },
  };
}

function toPositiveSafeInteger(
  value: number | bigint,
  entityName: string,
): number {
  const converted = typeof value === 'bigint' ? Number(value) : value;
  if (!Number.isSafeInteger(converted) || converted <= 0) {
    throw new Error(`Generated ${entityName} id is not a positive safe integer`);
  }
  return converted;
}
