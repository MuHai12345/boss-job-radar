import type { StructuredLlmProvider } from '../domain/llm/structured-llm-provider.js';
import {
  openLocalDatabase,
  type LocalDatabase,
} from './database/database.js';
import { refreshAnalysisSafely } from './deterministic-analysis-refresh.js';
import { refreshSalaryDecodingSafely } from './salary-decoding-refresh.js';
import { refreshJobStatusSafely } from './job-status-refresh.js';
import { refreshJobOpportunitySafely } from './job-opportunity-refresh.js';
import {
  startLocalService,
  type LocalService,
  type LocalServiceAddress,
  type StructuredLlmAnalysisWriter,
} from './server.js';

export interface LocalRuntime {
  readonly address: LocalServiceAddress;
  readonly database: LocalDatabase;
  close(): Promise<void>;
}

export async function startLocalRuntime(options: {
  readonly databasePath: string;
  readonly port: number;
  readonly structuredLlmProvider?: StructuredLlmProvider;
}): Promise<LocalRuntime> {
  const database = openLocalDatabase({ path: options.databasePath });

  let service: LocalService;
  try {
    const provider = options.structuredLlmProvider;
    const structuredLlmAnalyses: StructuredLlmAnalysisWriter | undefined = provider === undefined
      ? undefined
      : {
          async analyzeJobUrl(jobUrl) {
            const job = database.jobs.findByJobUrl(jobUrl);
            if (job === null) return { status: 'job_not_found' };
            const persisted = await database.structuredLlmAnalyses.analyzeJob(job.id, provider);
            if (persisted === null) return { status: 'analysis_unavailable' };
            return { status: 'ok', id: persisted.id };
          },
        };
    service = await startLocalService({
      imports: database.imports,
      linkChecks: database.linkChecks,
      port: options.port,
      ...(structuredLlmAnalyses === undefined ? {} : { structuredLlmAnalyses }),
    });
  } catch (error) {
    database.close();
    throw error;
  }

  refreshAnalysisSafely(() => database.analyses.refreshAll());
  refreshSalaryDecodingSafely(() => database.salaryDecoding.refreshAll());
  refreshJobStatusSafely(() => database.statusAssessments.refreshAll());
  refreshJobOpportunitySafely(() => database.opportunities.refreshAll());

  let closePromise: Promise<void> | undefined;
  return {
    address: service.address,
    database,
    close(): Promise<void> {
      closePromise ??= (async () => {
        try {
          await service.close();
        } finally {
          database.close();
        }
      })();
      return closePromise;
    },
  };
}
