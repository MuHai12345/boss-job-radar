import type { ParsedJobCard } from '../adapters/boss/job-card-types';
import type { ParsedJobDetail } from '../adapters/boss/job-detail-types';
import type { JobDetailSelectorProfile } from '../adapters/boss/job-detail-selector-profile';
import type { JobCardSelectorProfile } from '../adapters/boss/selector-profile';

export type StructuredPageType =
  | 'search_results'
  | 'job_detail'
  | 'unsupported';

export type StructuredPageExtractionWarning =
  | 'unsupported_page'
  | 'body_missing'
  | 'no_job_cards'
  | 'card_limit_reached';

export interface VerifiedBossSelectorProfiles {
  cardProfile: JobCardSelectorProfile;
  detailProfile: JobDetailSelectorProfile;
}

export interface StructuredPageExtractionResult {
  pageType: StructuredPageType;
  pageUrl: string;
  capturedAt: string;
  matchedCardCount: number | null;
  cards: ParsedJobCard[];
  detail: ParsedJobDetail | null;
  warnings: StructuredPageExtractionWarning[];
}
