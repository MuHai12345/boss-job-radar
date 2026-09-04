import { describe, expect, it } from 'vitest';

import type { ParsedJobCard } from '../src/adapters/boss/job-card-types';
import type { ParsedJobDetail } from '../src/adapters/boss/job-detail-types';
import { mapStructuredExtractionToObservations } from '../src/bridge/structured-extraction-to-observations';
import type { StructuredPageExtractionResult } from '../src/page-extraction/structured-page-extraction-types';

function createCard(overrides: Partial<ParsedJobCard> = {}): ParsedJobCard {
  return {
    title: '  电商运营助理  ',
    companyName: '示例公司',
    salaryText: '',
    locationText: '上海',
    experienceText: null,
    educationText: '大专',
    tags: ['电商', '电商', ''],
    jobHrefRaw: '/job_detail/example.html?securityId=kept-as-parser-output',
    jobUrl: 'https://www.zhipin.com/job_detail/example.html',
    recruiterActivityText: null,
    publishedText: '',
    rawCardText: '  原始卡片文本\n第二行  ',
    missingFields: ['experienceText', 'recruiterActivityText'],
    warnings: ['invalid_job_url'],
    ...overrides,
  };
}

function createDetail(
  overrides: Partial<ParsedJobDetail> = {},
): ParsedJobDetail {
  return {
    title: '详情岗位',
    companyName: null,
    salaryText: '10-12K',
    locationText: '上海·徐汇区',
    experienceText: '',
    educationText: null,
    tags: ['天猫', '天猫'],
    jobHrefRaw: null,
    jobUrl: 'https://www.zhipin.com/job_detail/detail.html',
    recruiterActivityText: '今日活跃',
    publishedText: null,
    fullJdText: '完整 JD\n第二行',
    rawDetailText: '原始详情文本\n第二行',
    missingFields: ['companyName', 'educationText', 'publishedText'],
    warnings: ['invalid_current_page_url'],
    ...overrides,
  };
}

function createResult(
  overrides: Partial<StructuredPageExtractionResult> = {},
): StructuredPageExtractionResult {
  return {
    pageType: 'search_results',
    pageUrl: 'https://www.zhipin.com/web/geek/jobs',
    capturedAt: '2026-09-04T01:02:03.000Z',
    matchedCardCount: 2,
    cards: [createCard(), createCard({ title: null, rawCardText: '' })],
    detail: null,
    warnings: ['card_limit_reached'],
    ...overrides,
  };
}

describe('mapStructuredExtractionToObservations', () => {
  it('maps search cards in order without normalizing facts or arrays', () => {
    const result = createResult();
    const before = structuredClone(result);

    const observations = mapStructuredExtractionToObservations(result);

    expect(observations).toHaveLength(2);
    expect(observations[0]).toEqual({
      capturedAt: result.capturedAt,
      pageType: 'search_results',
      sourcePageUrl: result.pageUrl,
      jobHrefRaw: result.cards[0]?.jobHrefRaw,
      jobUrl: result.cards[0]?.jobUrl,
      title: '  电商运营助理  ',
      companyName: '示例公司',
      salaryText: '',
      locationText: '上海',
      experienceText: null,
      educationText: '大专',
      tags: ['电商', '电商', ''],
      recruiterActivityText: null,
      publishedText: '',
      fullJdText: null,
      rawText: '  原始卡片文本\n第二行  ',
      missingFields: ['experienceText', 'recruiterActivityText'],
      warnings: ['card_limit_reached', 'invalid_job_url'],
    });
    expect(observations[1]?.title).toBeNull();
    expect(observations[1]?.rawText).toBe('');
    expect(result).toEqual(before);
    expect(observations[0]?.tags).not.toBe(result.cards[0]?.tags);
    expect(observations[0]?.missingFields).not.toBe(
      result.cards[0]?.missingFields,
    );
  });

  it('maps a detail page to exactly one observation with raw detail and full JD', () => {
    const detail = createDetail();
    const result = createResult({
      pageType: 'job_detail',
      pageUrl: 'https://www.zhipin.com/job_detail/detail.html',
      matchedCardCount: null,
      cards: [],
      detail,
      warnings: ['body_missing'],
    });

    expect(mapStructuredExtractionToObservations(result)).toEqual([
      {
        capturedAt: result.capturedAt,
        pageType: 'job_detail',
        sourcePageUrl: result.pageUrl,
        jobHrefRaw: detail.jobHrefRaw,
        jobUrl: detail.jobUrl,
        title: detail.title,
        companyName: detail.companyName,
        salaryText: detail.salaryText,
        locationText: detail.locationText,
        experienceText: detail.experienceText,
        educationText: detail.educationText,
        tags: ['天猫', '天猫'],
        recruiterActivityText: detail.recruiterActivityText,
        publishedText: detail.publishedText,
        fullJdText: '完整 JD\n第二行',
        rawText: '原始详情文本\n第二行',
        missingFields: detail.missingFields,
        warnings: ['body_missing', 'invalid_current_page_url'],
      },
    ]);
  });

  it.each([
    createResult({ pageType: 'unsupported', matchedCardCount: null, cards: [] }),
    createResult({ cards: [], matchedCardCount: 0, warnings: ['no_job_cards'] }),
    createResult({
      pageType: 'job_detail',
      matchedCardCount: null,
      cards: [],
      detail: null,
    }),
  ])('returns no observations when the extraction has no savable data', (result) => {
    expect(mapStructuredExtractionToObservations(result)).toEqual([]);
  });
});
