import { DETERMINISTIC_RULES_VERSION, type AnalysisWarning, type DeterministicAnalysisInput, type DeterministicJobAnalysis } from './deterministic-job-analysis-types.js';
import { analyzeExperience } from './experience-rules.js';
import { parseJdSections } from './jd-sections.js';
import { analyzeJobNature } from './job-nature-rules.js';

export function analyzeDeterministicJob(input: DeterministicAnalysisInput): DeterministicJobAnalysis {
  const lines = input.jdObservationId === null ? [] : parseJdSections(input.fullJdText ?? '');
  const experience = analyzeExperience(input.experienceText, lines);
  const warnings: AnalysisWarning[] = [];
  if (input.jdObservationId !== null && input.jdObservationId !== input.latestObservationId) warnings.push('jd_from_older_observation');
  if (experience.jd.hardMinimumValues.length > 1) warnings.push('multiple_hard_minimum_values');
  return {
    jobId: input.jobId, rulesVersion: DETERMINISTIC_RULES_VERSION,
    source: { latestObservationId: input.latestObservationId, jdObservationId: input.jdObservationId },
    jobNature: analyzeJobNature(input, lines), experience, warnings,
  };
}
