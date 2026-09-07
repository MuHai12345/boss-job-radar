import { describe, expect, it } from 'vitest';

import {
  assessJobStatus,
  observedRecencyBand,
  parsePlatformFreshness,
  parseRecruiterActivity,
  type JobStatusSource,
} from '../src/domain/status/job-status-assessment';

describe('job status deterministic classification', () => {
  it.each([
    ['在线', 'online_or_just_now'],
    ['刚刚活跃', 'online_or_just_now'],
    ['今日活跃', 'today'],
    ['今天活跃', 'today'],
    ['3日内活跃', 'within_3_days'],
    ['4天内活跃', 'within_week'],
    ['1周内活跃', 'within_week'],
    ['2周内活跃', 'within_month'],
    ['1月内活跃', 'within_month'],
    ['2月内活跃', 'within_half_year'],
    ['近半年活跃', 'within_half_year'],
    ['半年前活跃', 'older'],
    ['未知文案', 'unknown'],
    [null, 'unknown'],
  ] as const)('classifies recruiter activity %s', (raw, expected) => {
    expect(parseRecruiterActivity(raw)).toBe(expected);
  });

  it.each([
    ['刚刚发布', 'just_now'],
    ['今日发布', 'today'],
    ['今天发布', 'today'],
    ['本周发布', 'within_week'],
    ['3日内发布', 'within_3_days'],
    ['4日内发布', 'within_week'],
    ['30日内发布', 'within_month'],
    ['0分钟前发布', 'today'],
    ['23小时前', 'today'],
    ['2天前发布', 'within_3_days'],
    ['1周前', 'within_month'],
    ['1月前', 'older'],
    ['未知文案', 'unknown'],
    [null, 'unknown'],
  ] as const)('classifies platform freshness %s', (raw, expected) => {
    expect(parsePlatformFreshness(raw)).toBe(expected);
  });

  it.each([
    ['2026-09-07T00:00:00.000Z', '2026-09-07T23:59:59.999Z', 'today'],
    ['2026-09-07T00:00:00.000Z', '2026-09-08T00:00:00.000Z', 'today'],
    ['2026-09-07T00:00:00.000Z', '2026-09-09T00:00:00.000Z', 'within_3_days'],
    ['2026-09-07T00:00:00.000Z', '2026-09-11T00:00:00.000Z', 'within_week'],
    ['2026-09-07T00:00:00.000Z', '2026-09-20T00:00:00.000Z', 'within_month'],
    ['2026-09-07T00:00:00.000Z', '2026-10-20T00:00:00.000Z', 'older'],
    ['bad-time', '2026-09-07T00:00:00.000Z', 'unknown'],
    ['2026-09-08T00:00:00.000Z', '2026-09-07T00:00:00.000Z', 'unknown'],
  ] as const)('buckets local recency from %s to %s', (seen, assessed, expected) => {
    expect(observedRecencyBand(seen, assessed)).toBe(expected);
  });

  it('keeps recruiter, platform, local and link facts distinct and warns on older text sources', () => {
    const source: JobStatusSource = {
      jobId: 7,
      jobUrl: 'https://www.zhipin.com/job_detail/example.html',
      latestObservationId: 30,
      recruiter: {
        id: 20,
        rawText: '今日活跃',
        capturedAt: '2026-09-06T08:00:00.000Z',
      },
      published: {
        id: 21,
        rawText: '2天前发布',
        capturedAt: '2026-09-06T08:01:00.000Z',
      },
      firstSeenAt: '2026-09-01T00:00:00.000Z',
      lastSeenAt: '2026-09-06T12:00:00.000Z',
      link: {
        id: 8,
        status: 'explicitly_unavailable',
        observedAt: '2026-09-07T08:00:00.000Z',
        markerCode: 'job_closed',
      },
    };

    expect(assessJobStatus(source, '2026-09-07T12:00:00.000Z')).toMatchObject({
      jobId: 7,
      latestObservationId: 30,
      recruiterActivityObservationId: 20,
      publishedObservationId: 21,
      latestLinkCheckId: 8,
      recruiterActivity: { rawText: '今日活跃', band: 'today', sourceObservationId: 20 },
      platformFreshness: { rawText: '2天前发布', band: 'within_3_days', sourceObservationId: 21 },
      localObservation: { recencyBand: 'today' },
      link: { status: 'explicitly_unavailable', markerCode: 'job_closed' },
      warnings: [
        'recruiter_activity_from_older_observation',
        'published_from_older_observation',
      ],
    });
  });

  it('uses unchecked only for a canonical job with no link check and unknown for unresolved identity', () => {
    const base = {
      jobId: 1,
      latestObservationId: 1,
      recruiter: null,
      published: null,
      firstSeenAt: '2026-09-07T00:00:00.000Z',
      lastSeenAt: '2026-09-07T00:00:00.000Z',
      link: null,
    } as const;

    expect(assessJobStatus({ ...base, jobUrl: 'https://www.zhipin.com/job_detail/example.html' }, '2026-09-07T01:00:00.000Z').link.status).toBe('unchecked');
    expect(assessJobStatus({ ...base, jobUrl: null }, '2026-09-07T01:00:00.000Z').link.status).toBe('unknown');
  });
});
