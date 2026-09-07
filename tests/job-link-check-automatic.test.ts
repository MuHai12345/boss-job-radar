import { describe, expect, it } from 'vitest';

import { openLocalDatabase } from '../src/local-service/database/database';
import type { ImportRequest } from '../src/shared/import-request-types';
import type { JobObservationInput } from '../src/shared/job-observation-types';

const JOB_URL = 'https://www.zhipin.com/job_detail/status-example.html';

function detailObservation(overrides: Partial<JobObservationInput> = {}): JobObservationInput {
  return {
    capturedAt: '2026-09-07T08:00:00.000Z',
    pageType: 'job_detail',
    sourcePageUrl: JOB_URL,
    jobHrefRaw: '/job_detail/status-example.html',
    jobUrl: JOB_URL,
    title: '电商运营助理',
    companyName: '合成公司',
    salaryText: '8-10K',
    locationText: '上海',
    experienceText: '经验不限',
    educationText: '本科',
    tags: ['电商运营'],
    recruiterActivityText: '今日活跃',
    publishedText: '刚刚发布',
    fullJdText: '负责商品维护。',
    rawText: '合成详情',
    missingFields: [],
    warnings: [],
    ...overrides,
  };
}

function importRequest(
  clientImportId: string,
  pageType: 'search_results' | 'job_detail',
  pageUrl: string,
  capturedAt: string,
  observations: JobObservationInput[],
): ImportRequest {
  return {
    clientImportId,
    source: {
      pageType,
      pageUrl,
      capturedAt,
      matchedCardCount: pageType === 'search_results' ? observations.length : null,
      warnings: [],
    },
    observations,
  };
}

describe('automatic available evidence from saved detail observations', () => {
  it('records available for a saved structured detail and replays idempotently by source observation', () => {
    const database = openLocalDatabase({ path: ':memory:' });
    try {
      const request = importRequest(
        '47f3bb11-be51-4d5f-9dbb-e48ec5f408fd',
        'job_detail',
        JOB_URL,
        '2026-09-07T08:00:00.000Z',
        [detailObservation()],
      );
      const imported = database.imports.importBatch(request);
      const jobId = database.observations.getById(imported.ids[0]!)!.jobId;
      const first = database.statusAssessments.getLatestForJob(
        jobId,
        '2026-09-07T09:00:00.000Z',
      );

      expect(first).toMatchObject({
        link: {
          status: 'available',
          markerCode: null,
          observedAt: '2026-09-07T08:00:00.000Z',
        },
      });
      expect(first?.latestLinkCheckId).toEqual(expect.any(Number));

      const replayed = database.imports.importBatch(request);
      expect(replayed.ids).toEqual(imported.ids);
      expect(
        database.statusAssessments.getLatestForJob(
          jobId,
          '2026-09-07T09:30:00.000Z',
        )?.latestLinkCheckId,
      ).toBe(first?.latestLinkCheckId);
    } finally {
      database.close();
    }
  });

  it('does not infer availability from search cards or empty detail shells', () => {
    const database = openLocalDatabase({ path: ':memory:' });
    try {
      const searchUrl = 'https://www.zhipin.com/web/geek/jobs';
      const search = database.imports.importBatch(importRequest(
        '57f3bb11-be51-4d5f-9dbb-e48ec5f408fd',
        'search_results',
        searchUrl,
        '2026-09-07T08:00:00.000Z',
        [detailObservation({
          pageType: 'search_results',
          sourcePageUrl: searchUrl,
          fullJdText: null,
        })],
      ));
      const empty = database.imports.importBatch(importRequest(
        '67f3bb11-be51-4d5f-9dbb-e48ec5f408fd',
        'job_detail',
        JOB_URL,
        '2026-09-07T09:00:00.000Z',
        [detailObservation({
          capturedAt: '2026-09-07T09:00:00.000Z',
          title: null,
          fullJdText: null,
        })],
      ));

      expect(search.ids).toHaveLength(1);
      const jobId = database.observations.getById(empty.ids[0]!)!.jobId;
      expect(
        database.statusAssessments.getLatestForJob(
          jobId,
          '2026-09-07T10:00:00.000Z',
        )?.link.status,
      ).toBe('unchecked');
    } finally {
      database.close();
    }
  });
});
