import type { LinkMarkerCode, LinkStatus } from '../../shared/job-link-check-types.js';

export const JOB_STATUS_RULES_VERSION = 'job-status-assessment-v1' as const;
export type RecencyBand = 'today' | 'within_3_days' | 'within_week' | 'within_month' | 'older' | 'unknown';
export type RecruiterActivityBand = RecencyBand | 'online_or_just_now' | 'within_half_year';
export type PlatformFreshnessBand = RecencyBand | 'just_now';

export interface StatusTextSource {
  readonly id: number;
  readonly rawText: string;
  readonly capturedAt: string;
}

export interface JobStatusSource {
  readonly jobId: number;
  readonly jobUrl: string | null;
  readonly latestObservationId: number;
  readonly recruiter: StatusTextSource | null;
  readonly published: StatusTextSource | null;
  readonly firstSeenAt: string;
  readonly lastSeenAt: string;
  readonly link: {
    readonly id: number;
    readonly status: Exclude<LinkStatus, 'unchecked'>;
    readonly observedAt: string;
    readonly markerCode: LinkMarkerCode | null;
  } | null;
}

export interface JobStatusAssessment {
  readonly jobId: number;
  readonly rulesVersion: typeof JOB_STATUS_RULES_VERSION;
  readonly latestObservationId: number;
  readonly recruiterActivityObservationId: number | null;
  readonly publishedObservationId: number | null;
  readonly latestLinkCheckId: number | null;
  readonly recruiterActivity: {
    readonly rawText: string | null;
    readonly band: RecruiterActivityBand;
    readonly sourceObservationId: number | null;
    readonly observedAt: string | null;
  };
  readonly platformFreshness: {
    readonly rawText: string | null;
    readonly band: PlatformFreshnessBand;
    readonly sourceObservationId: number | null;
    readonly observedAt: string | null;
  };
  readonly localObservation: {
    readonly firstSeenAt: string;
    readonly lastSeenAt: string;
    readonly recencyBand: RecencyBand;
  };
  readonly link: {
    readonly status: LinkStatus;
    readonly observedAt: string | null;
    readonly markerCode: LinkMarkerCode | null;
  };
  readonly warnings: string[];
  readonly assessedAt: string;
}

function daysBand(days: number): RecencyBand {
  if (days <= 3) return 'within_3_days';
  if (days <= 7) return 'within_week';
  if (days <= 30) return 'within_month';
  return 'older';
}

function activityDaysBand(days: number): RecruiterActivityBand {
  if (days <= 30) return daysBand(days);
  return days <= 180 ? 'within_half_year' : 'older';
}

/** Buckets describe what the platform said at capture time, never a timestamp. */
export function parseRecruiterActivity(rawText: string | null): RecruiterActivityBand {
  const text = rawText?.trim() ?? '';
  if (/^(在线|刚刚活跃)$/u.test(text)) return 'online_or_just_now';
  if (/^(今日|今天)活跃$/u.test(text)) return 'today';
  if (/^本周内?活跃$/u.test(text)) return 'within_week';
  if (/^本月内?活跃$/u.test(text)) return 'within_month';
  if (text === '近半年活跃') return 'within_half_year';
  if (text === '半年前活跃') return 'older';
  const match = /^([1-9]\d*)[ ]*(日|天|周|月)内活跃$/u.exec(text);
  if (!match) return 'unknown';
  const count = Number(match[1]);
  if (!Number.isSafeInteger(count)) return 'unknown';
  // Whole-month wording uses its own calendar-scale bounds, without inventing dates.
  if (match[2] === '月') return count === 1 ? 'within_month' : count <= 6 ? 'within_half_year' : 'older';
  return activityDaysBand(count * (match[2] === '周' ? 7 : 1));
}

export function parsePlatformFreshness(rawText: string | null): PlatformFreshnessBand {
  const text = rawText?.trim() ?? '';
  if (text === '刚刚发布') return 'just_now';
  if (/^(今日|今天)发布$/u.test(text)) return 'today';
  if (text === '本周发布') return 'within_week';
  const within = /^([1-9]\d*)日内发布$/u.exec(text);
  if (within) {
    const count = Number(within[1]);
    return Number.isSafeInteger(count) ? daysBand(count) : 'unknown';
  }
  const ago = /^(0|[1-9]\d*)(分钟|小时|天|周|月)前(?:发布)?$/u.exec(text);
  if (!ago) return 'unknown';
  const count = Number(ago[1]);
  if (!Number.isSafeInteger(count)) return 'unknown';
  // "N units ago" is rounded; bucket by the upper bound to avoid overstating recency.
  if (ago[2] === '月') return count === 0 ? 'within_month' : 'older';
  const days = (count + 1) * (ago[2] === '分钟' ? 1 / 1440 : ago[2] === '小时' ? 1 / 24 : ago[2] === '周' ? 7 : 1);
  return days <= 1 ? 'today' : daysBand(days);
}

/** Local rolling elapsed-time bands; "today" means within the last 24 hours. */
export function observedRecencyBand(lastSeenAt: string, assessedAt: string): RecencyBand {
  const elapsed = Date.parse(assessedAt) - Date.parse(lastSeenAt);
  if (!Number.isFinite(elapsed) || elapsed < 0) return 'unknown';
  const days = elapsed / 86_400_000;
  return days <= 1 ? 'today' : daysBand(days);
}

export function assessJobStatus(source: JobStatusSource, assessedAt: string): JobStatusAssessment {
  const warnings: string[] = [];
  if (source.recruiter && source.recruiter.id !== source.latestObservationId) warnings.push('recruiter_activity_from_older_observation');
  if (source.published && source.published.id !== source.latestObservationId) warnings.push('published_from_older_observation');
  const recencyBand = observedRecencyBand(source.lastSeenAt, assessedAt);
  if (recencyBand === 'unknown') warnings.push('local_observation_recency_unknown');
  return {
    jobId: source.jobId, rulesVersion: JOB_STATUS_RULES_VERSION,
    latestObservationId: source.latestObservationId,
    recruiterActivityObservationId: source.recruiter?.id ?? null,
    publishedObservationId: source.published?.id ?? null,
    latestLinkCheckId: source.link?.id ?? null,
    recruiterActivity: {
      rawText: source.recruiter?.rawText ?? null,
      band: parseRecruiterActivity(source.recruiter?.rawText ?? null),
      sourceObservationId: source.recruiter?.id ?? null,
      observedAt: source.recruiter?.capturedAt ?? null,
    },
    platformFreshness: {
      rawText: source.published?.rawText ?? null,
      band: parsePlatformFreshness(source.published?.rawText ?? null),
      sourceObservationId: source.published?.id ?? null,
      observedAt: source.published?.capturedAt ?? null,
    },
    localObservation: { firstSeenAt: source.firstSeenAt, lastSeenAt: source.lastSeenAt, recencyBand },
    link: {
      status: source.link?.status ?? (source.jobUrl === null ? 'unknown' : 'unchecked'),
      observedAt: source.link?.observedAt ?? null, markerCode: source.link?.markerCode ?? null,
    },
    warnings, assessedAt,
  };
}
