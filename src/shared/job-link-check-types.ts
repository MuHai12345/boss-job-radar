import { canonicalBossJobUrl } from './boss-url-policy.js';

export const LINK_MARKER_CODES = [
  'job_closed', 'job_offline', 'job_expired', 'job_missing', 'job_deleted', 'recruitment_ended',
] as const;
export type LinkMarkerCode = typeof LINK_MARKER_CODES[number];
export type CheckedLinkStatus = 'available' | 'explicitly_unavailable' | 'unknown';
export type LinkStatus = CheckedLinkStatus | 'unchecked';

export interface JobLinkCheckRequest {
  readonly jobUrl: string;
  readonly observedAt: string;
  readonly status: CheckedLinkStatus;
  readonly markerCode: LinkMarkerCode | null;
}

export function isIsoTimestamp(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u.test(value)) return false;
  const time = Date.parse(value);
  return Number.isFinite(time) && new Date(time).toISOString() === value;
}

/** Manual checks only support the explicitly approved HTTPS detail host. */
export function canonicalCheckableJobUrl(input: unknown): string | null {
  if (typeof input !== 'string') return null;
  const canonical = canonicalBossJobUrl(input);
  if (canonical === null) return null;
  const url = new URL(canonical);
  return url.origin === 'https://www.zhipin.com' ? canonical : null;
}

export function validateJobLinkCheckRequest(value: unknown): JobLinkCheckRequest | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
  const row = value as Record<string, unknown>;
  const keys = ['jobUrl', 'observedAt', 'status', 'markerCode'];
  if (Object.keys(row).length !== keys.length || !keys.every((key) => Object.hasOwn(row, key))
    || typeof row.jobUrl !== 'string' || canonicalCheckableJobUrl(row.jobUrl) !== row.jobUrl
    || !isIsoTimestamp(row.observedAt)
    || (row.status !== 'available' && row.status !== 'explicitly_unavailable' && row.status !== 'unknown')) return null;
  const marker = LINK_MARKER_CODES.find((code) => code === row.markerCode);
  if (row.status === 'explicitly_unavailable' ? marker === undefined : row.markerCode !== null) return null;
  return {
    jobUrl: row.jobUrl, observedAt: row.observedAt,
    status: row.status, markerCode: marker ?? null,
  };
}
