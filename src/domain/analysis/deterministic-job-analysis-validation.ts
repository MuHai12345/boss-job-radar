import { DETERMINISTIC_RULES_VERSION, type AnalysisEvidence, type DeterministicJobAnalysis, type ExperienceStatus, type JdExperience, type NormalizedHeaderExperience } from './deterministic-job-analysis-types.js';
import { experienceContradictions, jdExperienceStatus } from './experience-rules.js';
import { JOB_NATURE_RULES } from './job-nature-rules.js';

function object(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function id(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0;
}

function years(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= 99;
}

function experienceStatus(value: unknown): value is ExperienceStatus {
  return typeof value === 'string' && ['no_requirement', 'preference_only', 'hard_minimum', 'contradictory', 'insufficient_evidence'].includes(value);
}

function header(value: unknown): value is NormalizedHeaderExperience {
  if (!object(value)) return false;
  const min = value.minYears;
  const max = value.maxYears;
  switch (value.kind) {
    case 'unknown': case 'unlimited': return min === null && max === null;
    case 'minimum': return years(min) && max === null;
    case 'up_to': return min === null && years(max);
    case 'range': return years(min) && years(max) && min <= max;
    default: return false;
  }
}

function jd(value: unknown): value is JdExperience {
  if (!object(value) || !experienceStatus(value.status)
    || !Array.isArray(value.hardMinimumValues)
    || !value.hardMinimumValues.every((item: unknown) => years(item) && item > 0)
    || typeof value.hasPreference !== 'boolean' || typeof value.hasNoRequirement !== 'boolean') return false;
  const values: number[] = value.hardMinimumValues;
  if (values.some((item, index) => index > 0 && item <= values[index - 1]!)) return false;
  return value.status === jdExperienceStatus({
    hardMinimumValues: values, hasPreference: value.hasPreference, hasNoRequirement: value.hasNoRequirement,
  });
}

const EXPERIENCE_CODES = new Set([
  'experience.header_unknown', 'experience.header_unlimited', 'experience.header_minimum',
  'experience.header_up_to', 'experience.header_range', 'experience.jd_hard_minimum',
  'experience.jd_preference', 'experience.jd_no_requirement',
]);
const NATURE_CODES = new Set(JOB_NATURE_RULES.flatMap((rule) => [
  `${rule.kind}.${rule.family}`, `context.${rule.family}`, `negated.${rule.family}`,
]));

function evidence(value: unknown, axis: 'nature' | 'experience'): value is AnalysisEvidence[] {
  return Array.isArray(value) && value.every((item: unknown) => {
    if (!object(item) || typeof item.code !== 'string'
      || typeof item.excerpt !== 'string' || !item.excerpt.trim() || item.excerpt.length > 160
      || !['responsibilities', 'requirements', 'unknown'].includes(String(item.section))) return false;
    if (axis === 'nature') return NATURE_CODES.has(item.code)
      && ['title', 'tags', 'full_jd'].includes(String(item.source))
      && (item.source === 'full_jd' || item.section === 'unknown');
    return EXPERIENCE_CODES.has(item.code)
      && (item.code.startsWith('experience.header_')
        ? item.source === 'header_experience' && item.section === 'unknown'
        : item.source === 'full_jd');
  });
}

function validAnalysis(value: unknown): value is DeterministicJobAnalysis {
  if (!object(value) || value.rulesVersion !== DETERMINISTIC_RULES_VERSION || !id(value.jobId)
    || !object(value.source) || !id(value.source.latestObservationId)
    || !(value.source.jdObservationId === null || id(value.source.jdObservationId))
    || !object(value.jobNature) || !['genuine_ecommerce_ops', 'mixed_ecommerce_ops', 'likely_non_ecommerce_ops', 'insufficient_evidence'].includes(String(value.jobNature.status))
    || !evidence(value.jobNature.evidence, 'nature')
    || !object(value.experience) || !experienceStatus(value.experience.status)
    || !header(value.experience.header) || !jd(value.experience.jd)
    || !evidence(value.experience.evidence, 'experience')
    || !Array.isArray(value.experience.contradictions) || !Array.isArray(value.warnings)) return false;
  const exp = value.experience;
  const normalizedHeader = value.experience.header;
  const jdResult = value.experience.jd;
  const contradictions = experienceContradictions(normalizedHeader, jdResult);
  const minimum = jdResult.hardMinimumValues.length ? Math.max(...jdResult.hardMinimumValues) : null;
  if (exp.hardMinimumYears !== minimum
    || exp.status !== (contradictions.length ? 'contradictory' : jdResult.status)
    || JSON.stringify(exp.contradictions) !== JSON.stringify(contradictions)) return false;
  const expectedWarnings: string[] = [];
  if (value.source.jdObservationId !== null && value.source.jdObservationId !== value.source.latestObservationId) expectedWarnings.push('jd_from_older_observation');
  if (jdResult.hardMinimumValues.length > 1) expectedWarnings.push('multiple_hard_minimum_values');
  if (JSON.stringify(value.warnings) !== JSON.stringify(expectedWarnings)) return false;
  if (value.source.jdObservationId === null && (
    value.jobNature.status !== 'insufficient_evidence' || exp.status !== 'insufficient_evidence'
    || [...value.jobNature.evidence, ...value.experience.evidence].some((item) => item.source === 'full_jd')
  )) return false;
  return true;
}

export function parseStoredDeterministicAnalysis(json: unknown): DeterministicJobAnalysis {
  try {
    if (typeof json !== 'string') throw new Error();
    const value: unknown = JSON.parse(json);
    if (validAnalysis(value)) return value;
  } catch { /* Never expose stored data or parser details. */ }
  throw new Error('Invalid stored deterministic analysis');
}
