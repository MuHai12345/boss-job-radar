import type { IncomingMessage } from 'node:http';
import { TextDecoder } from 'node:util';

import type { JobObservationInput } from '../database/observation-repository.js';

export const MAX_OBSERVATION_BODY_BYTES = 1_048_576;
export const MAX_OBSERVATIONS_PER_BATCH = 100;

export type LimitedBodyResult =
  | { readonly status: 'ok'; readonly body: Buffer }
  | { readonly status: 'too_large' };

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

export function validateObservationBatch(
  value: unknown,
): JobObservationInput[] | null {
  if (
    !isRecord(value) ||
    Object.keys(value).length !== 1 ||
    !Object.hasOwn(value, 'observations') ||
    !Array.isArray(value.observations) ||
    value.observations.length < 1 ||
    value.observations.length > MAX_OBSERVATIONS_PER_BATCH ||
    !value.observations.every(isJobObservationInput)
  ) {
    return null;
  }

  return value.observations;
}

export function decodeJsonBody(body: Buffer): unknown {
  const decoder = new TextDecoder('utf-8', { fatal: true });
  return JSON.parse(decoder.decode(body)) as unknown;
}

export function readLimitedRequestBody(
  request: IncomingMessage,
): Promise<LimitedBodyResult> {
  const contentLength = request.headers['content-length'];
  if (
    contentLength !== undefined &&
    /^\d+$/u.test(contentLength) &&
    BigInt(contentLength) > BigInt(MAX_OBSERVATION_BODY_BYTES)
  ) {
    request.resume();
    return Promise.resolve({ status: 'too_large' });
  }

  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let receivedBytes = 0;
    let tooLarge = false;

    request.on('data', (chunk: Buffer) => {
      if (tooLarge) {
        return;
      }

      receivedBytes += chunk.length;
      if (receivedBytes > MAX_OBSERVATION_BODY_BYTES) {
        tooLarge = true;
        chunks.length = 0;
        resolve({ status: 'too_large' });
        return;
      }

      chunks.push(chunk);
    });
    request.on('end', () => {
      if (!tooLarge) {
        resolve({ status: 'ok', body: Buffer.concat(chunks, receivedBytes) });
      }
    });
    request.on('error', reject);
  });
}
