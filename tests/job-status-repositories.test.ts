import { describe, expect, it } from 'vitest';

import { openLocalDatabase } from '../src/local-service/database/database';
import type { JobObservationInput } from '../src/shared/job-observation-types';

const JOB_URL = 'https://www.zhipin.com/job_detail/status-example.html';

function observation(overrides: Partial<JobObservationInput> = {}): JobObservationInput {
  return {
    capturedAt: '2026-09-07T08:00:00.000Z',
    pageType: 'search_results',
    sourcePageUrl: 'https://www.zhipin.com/web/geek/jobs',
    jobHrefRaw: '/job_detail/status-example.html',
    jobUrl: JOB_URL,
    title: '电商运营助理',
    companyName: '合成公司',
    salaryText: '8-10K',
    locationText: '上海',
    experienceText: '经验不限',
    educationText: '本科',
    tags: ['电商运营'],
    recruiterActivityText: null,
    publishedText: null,
    fullJdText: null,
    rawText: '合成岗位',
    missingFields: [],
    warnings: [],
    ...overrides,
  };
}

describe('job link checks and persisted status assessments', () => {
  it('persists a manual available check and exposes it through the current assessment', () => {
    const database = openLocalDatabase({ path: ':memory:' });
    try {
      const saved = database.observations.append(observation());
      const jobId = database.observations.getById(saved.id)!.jobId;
      const checked = database.linkChecks.append({
        jobUrl: JOB_URL,
        observedAt: '2026-09-07T09:00:00.000Z',
        status: 'available',
        markerCode: null,
      });

      expect(checked?.id).toBeGreaterThan(0);
      expect(database.statusAssessments.getLatestForJob(jobId, '2026-09-07T10:00:00.000Z')).toMatchObject({
        latestLinkCheckId: checked?.id,
        link: {
          status: 'available',
          markerCode: null,
          observedAt: '2026-09-07T09:00:00.000Z',
        },
      });
    } finally {
      database.close();
    }
  });

  it('keeps link-check history append-only and lets a newer available check supersede an older unavailable check', () => {
    const database = openLocalDatabase({ path: ':memory:' });
    try {
      const saved = database.observations.append(observation());
      const jobId = database.observations.getById(saved.id)!.jobId;
      const unavailable = database.linkChecks.append({
        jobUrl: JOB_URL,
        observedAt: '2026-09-07T09:00:00.000Z',
        status: 'explicitly_unavailable',
        markerCode: 'job_closed',
      });
      const available = database.linkChecks.append({
        jobUrl: JOB_URL,
        observedAt: '2026-09-07T10:00:00.000Z',
        status: 'available',
        markerCode: null,
      });

      expect(database.statusAssessments.getLatestForJob(jobId, '2026-09-07T10:30:00.000Z')).toMatchObject({
        latestLinkCheckId: available?.id,
        link: { status: 'available', markerCode: null },
      });
      expect(database.observations.getById(saved.id)?.jobId).toBe(jobId);
      expect(unavailable?.id).not.toBe(available?.id);
    } finally {
      database.close();
    }
  });

  it('uses observed_at then higher id as the deterministic current-link ordering', () => {
    const database = openLocalDatabase({ path: ':memory:' });
    try {
      const saved = database.observations.append(observation());
      const jobId = database.observations.getById(saved.id)!.jobId;
      database.linkChecks.append({
        jobUrl: JOB_URL,
        observedAt: '2026-09-07T09:00:00.000Z',
        status: 'unknown',
        markerCode: null,
      });
      const laterId = database.linkChecks.append({
        jobUrl: JOB_URL,
        observedAt: '2026-09-07T09:00:00.000Z',
        status: 'available',
        markerCode: null,
      });

      expect(database.statusAssessments.getLatestForJob(jobId, '2026-09-07T09:30:00.000Z')).toMatchObject({
        latestLinkCheckId: laterId?.id,
        link: { status: 'available' },
      });
    } finally {
      database.close();
    }
  });

  it('returns null for a manual check whose canonical job has not been saved locally', () => {
    const database = openLocalDatabase({ path: ':memory:' });
    try {
      expect(database.linkChecks.append({
        jobUrl: JOB_URL,
        observedAt: '2026-09-07T09:00:00.000Z',
        status: 'unknown',
        markerCode: null,
      })).toBeNull();
    } finally {
      database.close();
    }
  });

  it('selects the newest nonblank recruiter and platform texts without rewriting their capture times', () => {
    const database = openLocalDatabase({ path: ':memory:' });
    try {
      const older = database.observations.append(observation({
        capturedAt: '2026-09-05T08:00:00.000Z',
        recruiterActivityText: '今日活跃',
        publishedText: '2天前发布',
      }));
      const olderRecord = database.observations.getById(older.id)!;
      const latest = database.observations.append(observation({
        capturedAt: '2026-09-07T08:00:00.000Z',
        recruiterActivityText: '   ',
        publishedText: '',
      }));
      const latestRecord = database.observations.getById(latest.id)!;

      expect(olderRecord.jobId).toBe(latestRecord.jobId);
      expect(database.statusAssessments.getLatestForJob(latestRecord.jobId, '2026-09-07T10:00:00.000Z')).toMatchObject({
        latestObservationId: latest.id,
        recruiterActivityObservationId: older.id,
        publishedObservationId: older.id,
        recruiterActivity: {
          rawText: '今日活跃',
          band: 'today',
          sourceObservationId: older.id,
          observedAt: '2026-09-05T08:00:00.000Z',
        },
        platformFreshness: {
          rawText: '2天前发布',
          band: 'within_3_days',
          sourceObservationId: older.id,
          observedAt: '2026-09-05T08:00:00.000Z',
        },
        warnings: [
          'recruiter_activity_from_older_observation',
          'published_from_older_observation',
        ],
      });
    } finally {
      database.close();
    }
  });

  it('materializes a new assessment when only the local recency bucket changes and remains idempotent inside that bucket', () => {
    const database = openLocalDatabase({ path: ':memory:' });
    try {
      const saved = database.observations.append(observation({
        capturedAt: '2026-09-01T00:00:00.000Z',
      }));
      const jobId = database.observations.getById(saved.id)!.jobId;

      const first = database.statusAssessments.assessJob(jobId, '2026-09-01T12:00:00.000Z');
      expect(first?.localObservation.recencyBand).toBe('today');

      const second = database.statusAssessments.getLatestForJob(jobId, '2026-09-03T00:00:00.000Z');
      expect(second?.localObservation.recencyBand).toBe('within_3_days');
      const repeated = database.statusAssessments.getLatestForJob(jobId, '2026-09-03T12:00:00.000Z');
      expect(repeated?.localObservation.recencyBand).toBe('within_3_days');
    } finally {
      database.close();
    }
  });
});
