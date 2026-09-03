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

export interface TargetedTagDiagnosticComputedStyle {
  display: string | null;
  visibility: string | null;
  opacity: string | null;
  fontSize: string | null;
  lineHeight: string | null;
  position: string | null;
  left: string | null;
  top: string | null;
  width: string | null;
  height: string | null;
  maxWidth: string | null;
  maxHeight: string | null;
  overflow: string | null;
  clip: string | null;
  clipPath: string | null;
  transform: string | null;
  textIndent: string | null;
}

export interface TargetedTagDiagnosticGeometry {
  boundingClientRect: {
    width: number | null;
    height: number | null;
  };
  getClientRectsLength: number | null;
  offsetWidth: number | null;
  offsetHeight: number | null;
  offsetParentIsNull: boolean | null;
}

export interface TargetedTagDiagnosticTextNode {
  nodeType: 'text';
  depth: number;
  textPreview: string;
}

export interface TargetedTagDiagnosticElement {
  nodeType: 'element';
  depth: number;
  tagName: string;
  className: string | null;
  styleAttribute: string | null;
  hasHiddenAttribute: boolean | null;
  ariaHidden: string | null;
  textContentPreview: string;
  computedStyle: TargetedTagDiagnosticComputedStyle;
  geometry: TargetedTagDiagnosticGeometry;
}

export type TargetedTagDiagnosticSequenceEntry =
  | TargetedTagDiagnosticTextNode
  | TargetedTagDiagnosticElement;

export interface TargetedTagDiagnostic {
  index: number;
  tagName: string;
  className: string | null;
  directTextNodeSegments: string[];
  normalizedDirectText: string;
  textContentPreview: string;
  childElementCount: number;
  sequence: TargetedTagDiagnosticSequenceEntry[];
  truncated: boolean;
}

export interface TargetedDomProbeResult {
  pageUrl: string;
  pageType: TargetedDomProbePageType;
  timestamp: string;
  matchedCardCount: number | null;
  targets: TargetedDomProbeTarget[];
  tagDiagnostics?: TargetedTagDiagnostic[];
  warnings: TargetedDomProbeWarning[];
}
