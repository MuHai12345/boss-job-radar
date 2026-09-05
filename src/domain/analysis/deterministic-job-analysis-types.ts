export const DETERMINISTIC_RULES_VERSION = 'deterministic-job-analysis-v1';

export type JdSection = 'responsibilities' | 'requirements' | 'unknown';
export type JobNatureStatus = 'genuine_ecommerce_ops' | 'mixed_ecommerce_ops'
  | 'likely_non_ecommerce_ops' | 'insufficient_evidence';
export type ExperienceStatus = 'no_requirement' | 'preference_only'
  | 'hard_minimum' | 'contradictory' | 'insufficient_evidence';

export interface AnalysisEvidence {
  readonly code: string;
  readonly source: 'title' | 'header_experience' | 'full_jd' | 'tags';
  readonly section: JdSection;
  readonly excerpt: string;
}

export interface NormalizedHeaderExperience {
  readonly kind: 'unlimited' | 'range' | 'up_to' | 'minimum' | 'unknown';
  readonly minYears: number | null;
  readonly maxYears: number | null;
}

export interface JdExperience {
  readonly status: ExperienceStatus;
  readonly hardMinimumValues: readonly number[];
  readonly hasPreference: boolean;
  readonly hasNoRequirement: boolean;
}

export type ExperienceContradiction =
  | 'header_unlimited_vs_jd_hard_minimum'
  | 'header_max_below_jd_minimum'
  | 'header_minimum_vs_jd_no_requirement'
  | 'header_minimum_vs_jd_preference'
  | 'jd_no_requirement_vs_hard_minimum';

export type AnalysisWarning = 'jd_from_older_observation'
  | 'multiple_hard_minimum_values';

export interface DeterministicJobAnalysis {
  readonly jobId: number;
  readonly rulesVersion: typeof DETERMINISTIC_RULES_VERSION;
  readonly source: {
    readonly latestObservationId: number;
    readonly jdObservationId: number | null;
  };
  readonly jobNature: {
    readonly status: JobNatureStatus;
    readonly evidence: readonly AnalysisEvidence[];
  };
  readonly experience: {
    readonly status: ExperienceStatus;
    // JD's explicit minimum only; a header never supplies this value.
    readonly hardMinimumYears: number | null;
    readonly header: NormalizedHeaderExperience;
    readonly jd: JdExperience;
    readonly contradictions: readonly ExperienceContradiction[];
    readonly evidence: readonly AnalysisEvidence[];
  };
  readonly warnings: readonly AnalysisWarning[];
}

export interface DeterministicAnalysisInput {
  readonly jobId: number;
  readonly latestObservationId: number;
  readonly jdObservationId: number | null;
  readonly title: string | null;
  readonly experienceText: string | null;
  readonly tags: readonly string[];
  readonly fullJdText: string | null;
}
