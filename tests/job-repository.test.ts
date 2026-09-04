import { describe, expect, it } from 'vitest';

import { openLocalDatabase } from '../src/local-service/database/database';
import type { JobObservationInput } from '../src/shared/job-observation-types';

function createObservation(
  overrides: Partial<JobObservationInput> = {},
): JobObservationInput {
  return {
    capturedAt: '2026-09-04T10:00:00.000Z',
    companyName: '合成测试公司',
    educationText: null,
    experienceText: null,
    fullJdText: null,
    jobHrefRaw: '/job_detail/synthetic.html',
    jobUrl: 'https://example.invalid/job_detail/synthetic.html',
    locationText: '上海',
    missingFields: [],
    pageType: 'search_results',
    publishedText: null,
    rawText: 'synthetic raw fact',
    recruiterActivityText: null,
    salaryText: '6-8K',
    sourcePageUrl: 'https://example.invalid/source',
    tags: [],
    title: '电商运营助理',
    warnings: [],
    ...overrides,
  };
}

describe('job identity repositories', () => {
  it('reuses an exact canonical URL and updates lifecycle by capturedAt then observation id', () => {
    const database = openLocalDatabase({ path: ':memory:' });
    const jobUrl = 'https://example.invalid/job_detail/Exact-Identity.html';

    try {
      const middle = database.observations.append(createObservation({
        capturedAt: '2026-09-04T10:00:00.000Z',
        jobUrl,
      }));
      const earliest = database.observations.append(createObservation({
        capturedAt: '2026-09-04T09:00:00.000Z',
        jobUrl,
      }));
      const latestTie = database.observations.append(createObservation({
        capturedAt: '2026-09-04T10:00:00.000Z',
        jobUrl,
      }));
      const job = database.jobs.findByJobUrl(jobUrl);

      expect(job).toEqual({
        firstSeenAt: '2026-09-04T09:00:00.000Z',
        id: expect.any(Number),
        identityStatus: 'canonical_url',
        jobUrl,
        lastSeenAt: '2026-09-04T10:00:00.000Z',
        latestObservationId: latestTie.id,
        unresolvedObservationId: null,
      });
      expect(database.observations.getById(middle.id)?.jobId).toBe(job?.id);
      expect(database.observations.getById(earliest.id)?.jobId).toBe(job?.id);
      expect(database.observations.getById(latestTie.id)?.jobId).toBe(job?.id);
      expect(database.jobs.getById(job!.id)).toEqual(job);
    } finally {
      database.close();
    }
  });

  it('does not weak-match the same title and company across different or null URLs', () => {
    const database = openLocalDatabase({ path: ':memory:' });

    try {
      const { ids } = database.observations.appendMany([
        createObservation({ jobUrl: 'https://example.invalid/jobs/one' }),
        createObservation({ jobUrl: 'https://example.invalid/jobs/two' }),
        createObservation({ jobUrl: null }),
        createObservation({ jobUrl: null }),
      ]);
      const observations = ids.map((id) => database.observations.getById(id)!);
      const jobIds = observations.map(({ jobId }) => jobId);
      const [canonicalOne, canonicalTwo, unresolvedOne, unresolvedTwo] = jobIds;
      if (
        canonicalOne === undefined ||
        canonicalTwo === undefined ||
        unresolvedOne === undefined ||
        unresolvedTwo === undefined
      ) {
        throw new Error('Expected four linked synthetic observations');
      }

      expect(new Set(jobIds).size).toBe(4);
      expect(database.jobs.getById(canonicalOne)?.identityStatus).toBe('canonical_url');
      expect(database.jobs.getById(canonicalTwo)?.identityStatus).toBe('canonical_url');
      expect(database.jobs.getById(unresolvedOne)).toMatchObject({
        identityStatus: 'unresolved',
        jobUrl: null,
        unresolvedObservationId: ids[2],
      });
      expect(database.jobs.getById(unresolvedTwo)).toMatchObject({
        identityStatus: 'unresolved',
        jobUrl: null,
        unresolvedObservationId: ids[3],
      });
    } finally {
      database.close();
    }
  });

  it('keeps changed facts as separate observations for one canonical job', () => {
    const database = openLocalDatabase({ path: ':memory:' });
    const jobUrl = 'https://example.invalid/jobs/changed-facts';

    try {
      const first = database.observations.append(createObservation({
        companyName: '旧公司展示名',
        jobUrl,
        salaryText: '6-8K',
        title: '电商运营助理',
      }));
      const second = database.observations.append(createObservation({
        capturedAt: '2026-09-04T11:00:00.000Z',
        companyName: '新公司展示名',
        jobUrl,
        salaryText: '7-9K',
        title: '天猫运营助理',
      }));
      const firstRecord = database.observations.getById(first.id)!;
      const secondRecord = database.observations.getById(second.id)!;

      expect(firstRecord.jobId).toBe(secondRecord.jobId);
      expect(firstRecord).toMatchObject({
        companyName: '旧公司展示名',
        salaryText: '6-8K',
        title: '电商运营助理',
      });
      expect(secondRecord).toMatchObject({
        companyName: '新公司展示名',
        salaryText: '7-9K',
        title: '天猫运营助理',
      });
      expect(database.jobs.getById(firstRecord.jobId)?.latestObservationId).toBe(second.id);
    } finally {
      database.close();
    }
  });

  it('uses exact job URL equality without normalization', () => {
    const database = openLocalDatabase({ path: ':memory:' });

    try {
      const first = database.observations.append(createObservation({
        jobUrl: 'https://example.invalid/jobs/Exact',
      }));
      const second = database.observations.append(createObservation({
        jobUrl: 'https://example.invalid/jobs/exact',
      }));
      const third = database.observations.append(createObservation({
        jobUrl: 'https://example.invalid/jobs/Exact ',
      }));

      expect(new Set([
        database.observations.getById(first.id)?.jobId,
        database.observations.getById(second.id)?.jobId,
        database.observations.getById(third.id)?.jobId,
      ]).size).toBe(3);
    } finally {
      database.close();
    }
  });
});
