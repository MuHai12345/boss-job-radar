import SqliteDatabase from 'better-sqlite3';
import { createJobLinkCheckRepository, type JobLinkCheckRepository } from './job-link-check-repository.js';
import { createJobStatusAssessmentRepository, type JobStatusAssessmentRepository } from './job-status-assessment-repository.js';
import { createSalaryDecodingRepository, type SalaryDecodingRepository } from './salary-decoding-repository.js';
import { createDeterministicAnalysisRepository, type DeterministicAnalysisRepository } from './deterministic-analysis-repository.js';

import { runMigrations } from './migrations.js';
import {
  createJobObservationRepository,
  type JobObservationRepository,
} from './observation-repository.js';
import {
  createJobRepository,
  type JobRepository,
} from './job-repository.js';
import {
  createImportRepository,
  type ImportRepository,
} from './import-repository.js';

export interface LocalDatabase {
  readonly linkChecks: JobLinkCheckRepository;
  readonly statusAssessments: JobStatusAssessmentRepository;
  readonly salaryDecoding: SalaryDecodingRepository;
  readonly analyses: DeterministicAnalysisRepository;
  readonly jobs: JobRepository;
  readonly imports: ImportRepository;
  readonly observations: JobObservationRepository;
  isForeignKeyEnforcementEnabled(): boolean;
  close(): void;
}

export function openLocalDatabase(options: {
  readonly path: string;
}): LocalDatabase {
  const database = new SqliteDatabase(options.path);
  let jobs: JobRepository;
  let imports: ImportRepository;
  let observations: JobObservationRepository;
  let analyses: DeterministicAnalysisRepository;
  let salaryDecoding: SalaryDecodingRepository;
  let linkChecks: JobLinkCheckRepository;
  let statusAssessments: JobStatusAssessmentRepository;

  try {
    database.pragma('foreign_keys = ON');
    runMigrations(database);
    jobs = createJobRepository(database);
    observations = createJobObservationRepository(database);
    imports = createImportRepository(database, observations);
    analyses = createDeterministicAnalysisRepository(database);
    salaryDecoding = createSalaryDecodingRepository(database);
    linkChecks = createJobLinkCheckRepository(database);
    statusAssessments = createJobStatusAssessmentRepository(database);
  } catch (error) {
    database.close();
    throw error;
  }

  let closed = false;
  return {
    linkChecks,
    statusAssessments,
    salaryDecoding,
    analyses,
    jobs,
    imports,
    observations,
    isForeignKeyEnforcementEnabled(): boolean {
      return database.pragma('foreign_keys', { simple: true }) === 1;
    },
    close(): void {
      if (closed) {
        return;
      }

      database.close();
      closed = true;
    },
  };
}
