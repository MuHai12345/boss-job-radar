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

export interface StructuredLlmAnalysisDiagnosticEvent {
  readonly scope: 'analysis';
  readonly stage: 'invalid_source' | 'provider_failed' | 'output_validation_failed'
    | 'source_changed' | 'stored_analysis_invalid' | 'internal_or_persistence';
}

function analysisFailureStage(error: unknown): StructuredLlmAnalysisDiagnosticEvent['stage'] {
  try {
    if (error instanceof Error) {
      switch (error.message) {
        case 'Invalid structured LLM source': return 'invalid_source';
        case 'Structured LLM provider failed': return 'provider_failed';
        case 'Invalid structured LLM analysis output': return 'output_validation_failed';
        case 'Structured LLM source changed during analysis': return 'source_changed';
        case 'Invalid stored structured LLM analysis': return 'stored_analysis_invalid';
      }
    }
  } catch {
    // Unknown throws, including unreadable errors, retain the internal stage.
  }
  return 'internal_or_persistence';
}

export async function startLocalRuntime(options: {
  readonly databasePath: string;
  readonly port: number;
  readonly structuredLlmProvider?: StructuredLlmProvider;
  readonly onStructuredLlmDiagnostic?: (event: StructuredLlmAnalysisDiagnosticEvent) => void;
}): Promise<LocalRuntime> {
  const database = openLocalDatabase({ path: options.databasePath });

  let service: LocalService;
  try {
    const provider = options.structuredLlmProvider;
    const structuredLlmAnalyses: StructuredLlmAnalysisWriter | undefined = provider === undefined
      ? undefined
      : {
          async analyzeJobUrl(jobUrl) {
            try {
              const job = database.jobs.findByJobUrl(jobUrl);
              if (job === null) return { status: 'job_not_found' };
              const persisted = await database.structuredLlmAnalyses.analyzeJob(job.id, provider);
              if (persisted === null) return { status: 'analysis_unavailable' };
              return { status: 'ok', id: persisted.id };
            } catch (error) {
              try {
                options.onStructuredLlmDiagnostic?.({ scope: 'analysis', stage: analysisFailureStage(error) });
              } catch {
                // Preserve the original exception even if the observer fails.
              }
              throw error;
            }
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
