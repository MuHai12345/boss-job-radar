import { describe, expect, it, vi } from 'vitest';

import {
  requestJobLinkCheck,
  type ManualLinkInspection,
} from '../src/page-extraction/job-link-check-request';
import type { JobLinkStatusProbe } from '../src/page-extraction/job-link-status-probe';
import type { StructuredPageExtractionResult } from '../src/page-extraction/structured-page-extraction-types';

const JOB_URL = 'https://www.zhipin.com/job_detail/request-example.html';

function probe(overrides: Partial<JobLinkStatusProbe> = {}): JobLinkStatusProbe {
  return {
    pageMatches: true,
    challenge: false,
    markerCode: null,
    observedAt: '2026-09-07T10:00:00.000Z',
    ...overrides,
  };
}

function extraction(detail: StructuredPageExtractionResult['detail']): StructuredPageExtractionResult {
  return {
    pageType: 'job_detail',
    pageUrl: JOB_URL,
    capturedAt: '2026-09-07T10:00:00.000Z',
    matchedCardCount: null,
    cards: [],
    detail,
    warnings: [],
  };
}

function validDetail(): NonNullable<StructuredPageExtractionResult['detail']> {
  return {
    title: '电商运营助理',
    companyName: '合成公司',
    salaryText: '8-10K',
    locationText: '上海',
    experienceText: '经验不限',
    educationText: '本科',
    tags: ['电商运营'],
    jobHrefRaw: '/job_detail/request-example.html',
    jobUrl: JOB_URL,
    recruiterActivityText: '今日活跃',
    publishedText: '刚刚发布',
    fullJdText: '负责商品运营。',
    rawDetailText: '合成详情',
    missingFields: [],
    warnings: [],
  };
}

function inspection(overrides: Partial<ManualLinkInspection> = {}): ManualLinkInspection {
  return {
    before: probe(),
    after: probe(),
    extraction: extraction(validDetail()),
    documentStable: true,
    ...overrides,
  };
}

describe('manual job link check request', () => {
  it('returns null before inspection for unsupported URLs or missing tab ids', async () => {
    const execute = vi.fn();
    await expect(requestJobLinkCheck({ id: 1, url: 'https://www.zhipin.com/web/geek/jobs' }, execute)).resolves.toBeNull();
    await expect(requestJobLinkCheck({ url: JOB_URL }, execute)).resolves.toBeNull();
    expect(execute).not.toHaveBeenCalled();
  });

  it('classifies a stable matching structured detail as available', async () => {
    const execute = vi.fn().mockResolvedValue(inspection());
    const result = await requestJobLinkCheck({ id: 7, url: `${JOB_URL}?ka=search_list_jname_1_blank` }, execute);

    expect(execute).toHaveBeenCalledWith(7, JOB_URL);
    expect(result).toEqual({
      jobUrl: JOB_URL,
      observedAt: '2026-09-07T10:00:00.000Z',
      status: 'available',
      markerCode: null,
    });
  });

  it('classifies an exact unavailable marker only when the stable structured detail is absent', async () => {
    const execute = vi.fn().mockResolvedValue(inspection({
      extraction: extraction(null),
      after: probe({ markerCode: 'job_closed', observedAt: '2026-09-07T10:01:00.000Z' }),
    }));
    await expect(requestJobLinkCheck({ id: 7, url: JOB_URL }, execute)).resolves.toEqual({
      jobUrl: JOB_URL,
      observedAt: '2026-09-07T10:01:00.000Z',
      status: 'explicitly_unavailable',
      markerCode: 'job_closed',
    });
  });

  it.each([
    ['unstable document', inspection({ documentStable: false })],
    ['before navigation mismatch', inspection({ before: probe({ pageMatches: false }) })],
    ['after navigation mismatch', inspection({ after: probe({ pageMatches: false }) })],
    ['challenge before', inspection({ before: probe({ challenge: true }) })],
    ['challenge after', inspection({ after: probe({ challenge: true }) })],
    ['missing inspection', undefined],
  ] as const)('fails closed to unknown for %s', async (_name, value) => {
    const execute = vi.fn().mockResolvedValue(value);
    const result = await requestJobLinkCheck({ id: 7, url: JOB_URL }, execute);
    expect(result).toMatchObject({ jobUrl: JOB_URL, status: 'unknown', markerCode: null });
  });

  it('keeps unknown when extraction is mismatched or unsupported even if a marker is present', async () => {
    const mismatched = extraction(null);
    mismatched.pageUrl = 'https://www.zhipin.com/job_detail/other.html';
    const execute = vi.fn().mockResolvedValue(inspection({
      extraction: mismatched,
      after: probe({ markerCode: 'job_closed' }),
    }));
    await expect(requestJobLinkCheck({ id: 7, url: JOB_URL }, execute)).resolves.toMatchObject({
      status: 'unknown',
      markerCode: null,
    });
  });

  it('fails closed to unknown when the inspection throws', async () => {
    const result = await requestJobLinkCheck(
      { id: 7, url: JOB_URL },
      vi.fn().mockRejectedValue(new Error('injection failed')),
    );
    expect(result).toMatchObject({ jobUrl: JOB_URL, status: 'unknown', markerCode: null });
  });
});
