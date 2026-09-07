import type { DeterministicJobAnalysis } from '../analysis/deterministic-job-analysis-types.js';
import type { JobOpportunityAssessment } from '../opportunity/job-opportunity-assessment-types.js';
import type { JobStatusAssessment } from '../status/job-status-assessment.js';

export const STRUCTURED_LLM_PROMPT_VERSION = 'structured-llm-job-analysis-prompt-v1';
export const STRUCTURED_LLM_OUTPUT_SCHEMA_VERSION = 'structured-llm-job-analysis-v1';

// Preserve upstream conclusions while excluding unnecessary captured status text.
export type StructuredLlmStatusContext = Omit<JobStatusAssessment, 'recruiterActivity' | 'platformFreshness'> & {
  readonly recruiterActivity: Omit<JobStatusAssessment['recruiterActivity'], 'rawText'>;
  readonly platformFreshness: Omit<JobStatusAssessment['platformFreshness'], 'rawText'>;
};

export interface StructuredLlmJobInputSnapshot {
  readonly jobId: number;
  readonly latestObservationId: number;
  readonly jdObservationId: number;
  readonly deterministicRulesVersion: DeterministicJobAnalysis['rulesVersion'];
  readonly statusRulesVersion: JobStatusAssessment['rulesVersion'];
  readonly opportunityRulesVersion: JobOpportunityAssessment['rulesVersion'];
  readonly opportunitySourceStateKey: string;
  readonly title: string | null;
  readonly experienceText: string | null;
  readonly educationText: string | null;
  readonly locationText: string | null;
  readonly tags: readonly string[];
  readonly fullJdText: string;
  readonly deterministic: DeterministicJobAnalysis;
  readonly status: StructuredLlmStatusContext;
  readonly opportunity: JobOpportunityAssessment;
}

export type StructuredLlmEvidenceReference =
  | { readonly source: 'full_jd'; readonly excerpt: string }
  | { readonly source: 'deterministic' | 'status' | 'opportunity'; readonly code: string };

export const RESPONSIBILITY_KINDS = ['core_ops', 'non_target', 'growth_signal', 'risk_signal', 'ambiguity'] as const;
export const AMBIGUITY_CODES = [
  'responsibility_scope', 'experience_requirement', 'growth_scope', 'data_ownership',
  'hiring_status', 'onboarding', 'other',
] as const;

export interface StructuredLlmInterpretation {
  readonly summary: string;
  readonly supports: readonly StructuredLlmEvidenceReference[];
  readonly concerns: readonly StructuredLlmEvidenceReference[];
}

export interface StructuredLlmAnalysisOutput {
  readonly schemaVersion: typeof STRUCTURED_LLM_OUTPUT_SCHEMA_VERSION;
  readonly roleSummary: string;
  readonly responsibilityFindings: readonly {
    readonly kind: typeof RESPONSIBILITY_KINDS[number];
    readonly statement: string;
    readonly evidence: readonly StructuredLlmEvidenceReference[];
  }[];
  readonly careerSwitchInterpretation: StructuredLlmInterpretation;
  readonly growthInterpretation: StructuredLlmInterpretation;
  readonly riskInterpretation: StructuredLlmInterpretation;
  readonly ambiguities: readonly {
    readonly code: typeof AMBIGUITY_CODES[number];
    readonly question: string;
    readonly reason: string;
  }[];
  readonly interviewQuestions: readonly {
    readonly question: string;
    readonly reason: string;
    readonly groundedBy: readonly StructuredLlmEvidenceReference[];
  }[];
  readonly confidence: 'high' | 'medium' | 'low';
}

export interface PersistedStructuredLlmAnalysis {
  readonly id: number;
  readonly jobId: number;
  readonly promptVersion: typeof STRUCTURED_LLM_PROMPT_VERSION;
  readonly outputSchemaVersion: typeof STRUCTURED_LLM_OUTPUT_SCHEMA_VERSION;
  readonly providerId: string;
  readonly modelId: string;
  readonly source: {
    readonly latestObservationId: number;
    readonly jdObservationId: number;
    readonly sourceStateKey: string;
  };
  readonly analysis: StructuredLlmAnalysisOutput;
  readonly analyzedAt: string;
}
