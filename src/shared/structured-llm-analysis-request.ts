import { canonicalCheckableJobUrl } from './job-link-check-types.js';

export interface StructuredLlmAnalysisRequest {
  readonly jobUrl: string;
}

export function validateStructuredLlmAnalysisRequest(value: unknown): StructuredLlmAnalysisRequest | null {
  try {
    if (value === null || typeof value !== 'object' || Array.isArray(value)) return null;
    const prototype: unknown = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) return null;
    const keys = Reflect.ownKeys(value);
    if (keys.length !== 1 || keys[0] !== 'jobUrl') return null;
    const descriptor = Object.getOwnPropertyDescriptor(value, 'jobUrl');
    if (!descriptor || !('value' in descriptor) || !descriptor.enumerable) return null;
    const jobUrl: unknown = descriptor.value;
    if (typeof jobUrl !== 'string' || canonicalCheckableJobUrl(jobUrl) !== jobUrl) return null;
    return { jobUrl };
  } catch {
    return null;
  }
}
