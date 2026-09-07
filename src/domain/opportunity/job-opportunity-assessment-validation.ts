import { DETERMINISTIC_RULES_VERSION, type AnalysisEvidence } from '../analysis/deterministic-job-analysis-types.js';
import { JOB_STATUS_RULES_VERSION } from '../status/job-status-assessment.js';
import { isIsoTimestamp } from '../../shared/job-link-check-types.js';
import {
  ADVANCED_FAMILIES, CAREER_REASON_CODES, INTERVIEW_QUESTIONS, JOB_OPPORTUNITY_RULES_VERSION,
  OPPORTUNITY_RISKS, OPPORTUNITY_WARNINGS, PRIORITY_REASON_CODES, SKILL_FAMILIES,
  type JobOpportunityAssessment,
} from './job-opportunity-assessment-types.js';

function shape(value: unknown, keys: readonly string[]): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    && Object.keys(value).length === keys.length && keys.every((key) => Object.hasOwn(value, key));
}

function id(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0;
}

function nullableId(value: unknown): value is number | null { return value === null || id(value); }

function member<T extends string>(value: unknown, values: readonly T[]): value is T {
  return typeof value === 'string' && values.some((item) => item === value);
}

/** Strictly increasing catalog positions enforce both canonical order and uniqueness. */
function ordered<T extends string>(value: unknown, catalog: readonly T[]): value is T[] {
  if (!Array.isArray(value)) return false;
  let previous = -1;
  for (const item of value) {
    const index = catalog.findIndex((code) => code === item);
    if (index <= previous) return false;
    previous = index;
  }
  return true;
}

function evidence(value: unknown): value is AnalysisEvidence[] {
  return Array.isArray(value) && value.every((item: unknown) =>
    shape(item, ['code', 'source', 'section', 'excerpt'])
    && SKILL_FAMILIES.some((family) => item.code === `ecommerce_core.${family}`)
    && item.source === 'full_jd' && member(item.section, ['responsibilities', 'unknown'])
    && typeof item.excerpt === 'string' && item.excerpt.trim().length > 0 && item.excerpt.length <= 160);
}

function catalogItems(
  value: unknown,
  catalog: readonly { readonly code: string }[],
  keys: readonly string[],
): boolean {
  if (!Array.isArray(value)) return false;
  let previous = -1;
  for (const item of value) {
    if (!shape(item, keys)) return false;
    const index = catalog.findIndex((entry) => entry.code === item.code);
    if (index <= previous) return false;
    const expected = catalog[index];
    if (expected === undefined || !Object.entries(expected).every(([key, text]) => item[key] === text)) return false;
    previous = index;
  }
  return true;
}

function validAssessment(value: unknown): value is JobOpportunityAssessment {
  if (!shape(value, ['jobId', 'rulesVersion', 'source', 'growthValue', 'careerSwitchValue', 'risks', 'priority', 'interviewQuestions', 'warnings', 'assessedAt'])
    || !id(value.jobId) || value.rulesVersion !== JOB_OPPORTUNITY_RULES_VERSION || !isIsoTimestamp(value.assessedAt)
    || !shape(value.source, ['deterministicRulesVersion', 'statusRulesVersion', 'latestObservationId', 'jdObservationId', 'recruiterActivityObservationId', 'publishedObservationId', 'latestLinkCheckId', 'localObservationRecencyBand'])
    || value.source.deterministicRulesVersion !== DETERMINISTIC_RULES_VERSION
    || value.source.statusRulesVersion !== JOB_STATUS_RULES_VERSION
    || !id(value.source.latestObservationId) || !nullableId(value.source.jdObservationId)
    || !nullableId(value.source.recruiterActivityObservationId) || !nullableId(value.source.publishedObservationId)
    || !nullableId(value.source.latestLinkCheckId)
    || !member(value.source.localObservationRecencyBand, ['today', 'within_3_days', 'within_week', 'within_month', 'older', 'unknown'])
    || !shape(value.growthValue, ['band', 'skillFamilies', 'advancedFamilies', 'evidence'])
    || !member(value.growthValue.band, ['strong', 'moderate', 'limited', 'unknown'])
    || !ordered(value.growthValue.skillFamilies, SKILL_FAMILIES)
    || !ordered(value.growthValue.advancedFamilies, ADVANCED_FAMILIES)
    || !evidence(value.growthValue.evidence)
    || !shape(value.careerSwitchValue, ['status', 'reasonCodes'])
    || !member(value.careerSwitchValue.status, ['suitable', 'worth_trying', 'hard_mismatch', 'unclear'])
    || !ordered(value.careerSwitchValue.reasonCodes, CAREER_REASON_CODES) || value.careerSwitchValue.reasonCodes.length === 0
    || !catalogItems(value.risks, OPPORTUNITY_RISKS, ['code', 'severity', 'reason'])
    || !shape(value.priority, ['tier', 'reasonCodes'])
    || !member(value.priority.tier, ['S', 'A', 'B', 'C', 'REVIEW'])
    || !ordered(value.priority.reasonCodes, PRIORITY_REASON_CODES) || value.priority.reasonCodes.length === 0
    || !Array.isArray(value.interviewQuestions) || value.interviewQuestions.length > 6
    || !catalogItems(value.interviewQuestions, INTERVIEW_QUESTIONS, ['code', 'question', 'reason'])
    || !ordered(value.warnings, OPPORTUNITY_WARNINGS)) return false;
  const evidenceItems = value.growthValue.evidence;
  const families = SKILL_FAMILIES.filter((family) => evidenceItems.some((item) => item.code === `ecommerce_core.${family}`));
  const advanced = ADVANCED_FAMILIES.filter((family) => families.includes(family));
  if (JSON.stringify(families) !== JSON.stringify(value.growthValue.skillFamilies)
    || JSON.stringify(advanced) !== JSON.stringify(value.growthValue.advancedFamilies)
    || (value.source.jdObservationId === null && evidenceItems.length > 0)) return false;
  if (families.length >= 4 && advanced.length > 0) return value.growthValue.band === 'strong';
  if (families.length >= 2) return value.growthValue.band === 'moderate';
  return value.growthValue.band === 'limited' || value.growthValue.band === 'unknown';
}

export function parseStoredJobOpportunityAssessment(json: unknown): JobOpportunityAssessment {
  try {
    if (typeof json !== 'string') throw new Error();
    const value: unknown = JSON.parse(json);
    if (validAssessment(value)) return value;
  } catch { /* Never expose stored data or JSON parser details. */ }
  throw new Error('Invalid stored job opportunity assessment');
}
