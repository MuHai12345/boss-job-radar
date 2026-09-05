import type { ImportRequest } from '../shared/import-request-types.js';
import type { JobObservationInput } from '../shared/job-observation-types.js';

export const MAX_OBSERVATIONS_PER_BATCH = 100;

const OBSERVATION_KEYS = [
  'capturedAt',
  'pageType',
  'sourcePageUrl',
  'jobHrefRaw',
  'jobUrl',
  'title',
  'companyName',
  'salaryText',
  'locationText',
  'experienceText',
  'educationText',
  'tags',
  'recruiterActivityText',
  'publishedText',
  'fullJdText',
  'rawText',
  'missingFields',
  'warnings',
] as const;

const OBSERVATION_KEY_SET = new Set<string>(OBSERVATION_KEYS);
const IMPORT_KEYS = ['clientImportId', 'source', 'observations'] as const;
const IMPORT_KEY_SET = new Set<string>(IMPORT_KEYS);
const SOURCE_KEYS = [
  'pageType',
  'pageUrl',
  'capturedAt',
  'matchedCardCount',
  'warnings',
] as const;
const SOURCE_KEY_SET = new Set<string>(SOURCE_KEYS);
const CLIENT_IMPORT_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function hasOnlyObservationKeys(value: Record<string, unknown>): boolean {
  const keys = Object.keys(value);
  return (
    keys.length === OBSERVATION_KEYS.length &&
    keys.every((key) => OBSERVATION_KEY_SET.has(key))
  );
}

function hasOnlyKeys(
  value: Record<string, unknown>,
  keys: readonly string[],
  keySet: ReadonlySet<string>,
): boolean {
  const actualKeys = Object.keys(value);
  return (
    actualKeys.length === keys.length &&
    actualKeys.every((key) => keySet.has(key))
  );
}

function isNullableString(value: unknown): value is string | null {
  return typeof value === 'string' || value === null;
}

function isStringArray(value: unknown): value is string[] {
  return (
    Array.isArray(value) &&
    value.every((item): item is string => typeof item === 'string')
  );
}

function isJobObservationInput(value: unknown): value is JobObservationInput {
  if (!isRecord(value) || !hasOnlyObservationKeys(value)) {
    return false;
  }

  return (
    typeof value.capturedAt === 'string' &&
    (value.pageType === 'search_results' || value.pageType === 'job_detail') &&
    typeof value.sourcePageUrl === 'string' &&
    isNullableString(value.jobHrefRaw) &&
    isNullableString(value.jobUrl) &&
    isNullableString(value.title) &&
    isNullableString(value.companyName) &&
    isNullableString(value.salaryText) &&
    isNullableString(value.locationText) &&
    isNullableString(value.experienceText) &&
    isNullableString(value.educationText) &&
    isStringArray(value.tags) &&
    isNullableString(value.recruiterActivityText) &&
    isNullableString(value.publishedText) &&
    isNullableString(value.fullJdText) &&
    typeof value.rawText === 'string' &&
    isStringArray(value.missingFields) &&
    isStringArray(value.warnings)
  );
}

export function validateImportRequest(value: unknown): ImportRequest | null {
  if (
    !isRecord(value) ||
    !hasOnlyKeys(value, IMPORT_KEYS, IMPORT_KEY_SET) ||
    typeof value.clientImportId !== 'string' ||
    !CLIENT_IMPORT_ID_PATTERN.test(value.clientImportId) ||
    !isRecord(value.source) ||
    !hasOnlyKeys(value.source, SOURCE_KEYS, SOURCE_KEY_SET) ||
    (value.source.pageType !== 'search_results' &&
      value.source.pageType !== 'job_detail') ||
    typeof value.source.pageUrl !== 'string' ||
    typeof value.source.capturedAt !== 'string' ||
    !isStringArray(value.source.warnings) ||
    (value.source.pageType === 'search_results'
      ? !Number.isSafeInteger(value.source.matchedCardCount) ||
        (value.source.matchedCardCount as number) < 0
      : value.source.matchedCardCount !== null) ||
    !Array.isArray(value.observations) ||
    value.observations.length < 1 ||
    value.observations.length > MAX_OBSERVATIONS_PER_BATCH
  ) {
    return null;
  }

  const source = value.source;
  if (
    !value.observations.every(
      (observation) =>
        isJobObservationInput(observation) &&
        observation.pageType === source.pageType &&
        observation.capturedAt === source.capturedAt &&
        observation.sourcePageUrl === source.pageUrl,
    )
  ) {
    return null;
  }

  return value as unknown as ImportRequest;
}
