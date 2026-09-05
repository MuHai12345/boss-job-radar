import type { JobObservationInput } from './job-observation-types.js';

export type ImportPageType = 'search_results' | 'job_detail';

export interface ImportSource {
  readonly pageType: ImportPageType;
  readonly pageUrl: string;
  readonly capturedAt: string;
  readonly matchedCardCount: number | null;
  readonly warnings: string[];
}

export interface ImportRequest {
  readonly clientImportId: string;
  readonly source: ImportSource;
  readonly observations: JobObservationInput[];
}
