export type ManualDomProbeWarning = 'body_missing' | 'no_candidates';

export interface ManualDomProbeLinkSummary {
  hostname: string;
  pathname: string;
}

export interface ManualDomProbeCandidate {
  tagName: string;
  className: string | null;
  role: string | null;
  ariaLabel: string | null;
  textPreview: string;
  childElementCount: number;
  link: ManualDomProbeLinkSummary | null;
}

export interface ManualDomProbeCandidateSummary {
  bodyExists: boolean;
  visibleMainCount: number;
  visibleArticleCount: number;
  visibleSectionCount: number;
  linkCount: number;
  headingCount: number;
  visibleTextLength: number;
  documentLanguage: string | null;
  pathname: string;
  candidates: ManualDomProbeCandidate[];
}

export interface ManualDomProbeResult {
  pageUrl: string;
  pageTitle: string;
  timestamp: string;
  candidateSummary: ManualDomProbeCandidateSummary;
  warnings: ManualDomProbeWarning[];
}
