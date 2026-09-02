export type TargetedDomProbePageType =
  | 'search_results'
  | 'job_detail'
  | 'unsupported';

export type TargetedDomProbeWarning =
  | 'unsupported_page'
  | 'target_not_found'
  | 'no_job_cards'
  | 'body_missing';

export interface TargetedDomProbeLinkSummary {
  hostname: string;
  pathname: string;
}

export interface TargetedDomProbeNodeSummary {
  depth: number;
  tagName: string;
  className: string | null;
  role: string | null;
  ariaLabel: string | null;
  titleAttribute: string | null;
  directTextPreview: string;
  childElementCount: number;
  link: TargetedDomProbeLinkSummary | null;
  containsPrivateUseCharacters: boolean;
}

export interface TargetedDomProbeSample {
  nodes: TargetedDomProbeNodeSummary[];
  truncated: boolean;
  rootTextPreview?: string;
}

export interface TargetedDomProbeTarget {
  selectorLabel: string;
  matchedCount: number;
  samples: TargetedDomProbeSample[];
}

export interface TargetedDomProbeResult {
  pageUrl: string;
  pageType: TargetedDomProbePageType;
  timestamp: string;
  matchedCardCount: number | null;
  targets: TargetedDomProbeTarget[];
  warnings: TargetedDomProbeWarning[];
}
