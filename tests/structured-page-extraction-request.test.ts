import { describe, expect, it, vi } from 'vitest';

import {
  classifyStructuredPageExtractionUrl,
  requestStructuredPageExtraction,
} from '../src/page-extraction/structured-page-extraction-request';
import type { StructuredPageExtractionResult } from '../src/page-extraction/structured-page-extraction-types';

const searchResult: StructuredPageExtractionResult = {
  pageType: 'search_results',
  pageUrl: 'https://www.zhipin.com/web/geek/jobs',
  capturedAt: '2026-09-02T00:00:00.000Z',
  matchedCardCount: 0,
  cards: [],
  detail: null,
  warnings: ['no_job_cards'],
};

describe('classifyStructuredPageExtractionUrl', () => {
  it.each([
    ['https://www.zhipin.com/web/geek/jobs', 'search_results'],
    ['https://www.zhipin.com/web/geek/jobs?q=private#hash', 'search_results'],
    ['https://www.zhipin.com/job_detail/example.html', 'job_detail'],
    [
      'https://www.zhipin.com/job_detail/example.html?securityId=private#hash',
      'job_detail',
    ],
  ] as const)('classifies supported URL %s', (url, pageType) => {
    expect(classifyStructuredPageExtractionUrl(url)).toEqual({
      supported: true,
      pageType,
      pageUrl: url.split(/[?#]/u)[0],
    });
  });

  it.each([
    'https://example.com/web/geek/jobs',
    'https://www.zhipin.com/',
    'https://www.zhipin.com/web/geek/jobs/extra',
    'https://www.zhipin.com/job_detail/example',
    'https://www.zhipin.com/job_detail/nested/example.html',
    'https://user:password@www.zhipin.com/job_detail/example.html',
    'file://www.zhipin.com/job_detail/example.html',
  ])('rejects unsupported URL %s', (url) => {
    expect(classifyStructuredPageExtractionUrl(url)).toEqual({
      supported: false,
      pageType: 'unsupported',
      pageUrl: null,
    });
  });
});

describe('requestStructuredPageExtraction', () => {
  it.each([
    ['non-BOSS page', 'https://example.com/web/geek/jobs'],
    ['BOSS home page', 'https://www.zhipin.com/'],
  ])('does not execute on an unsupported %s', async (_, url) => {
    const executeExtraction = vi.fn();

    const outcome = await requestStructuredPageExtraction(
      { id: 1, url },
      executeExtraction,
    );

    expect(executeExtraction).not.toHaveBeenCalled();
    expect(outcome).toMatchObject({ ok: false, code: 'unsupported_page' });
  });

  it('requires a tab ID without executing', async () => {
    const executeExtraction = vi.fn();

    const outcome = await requestStructuredPageExtraction(
      { url: searchResult.pageUrl },
      executeExtraction,
    );

    expect(executeExtraction).not.toHaveBeenCalled();
    expect(outcome).toMatchObject({ ok: false, code: 'missing_tab_id' });
  });

  it.each([
    ['https://www.zhipin.com/web/geek/jobs', searchResult],
    [
      'https://www.zhipin.com/job_detail/example.html',
      {
        ...searchResult,
        pageType: 'job_detail' as const,
        pageUrl: 'https://www.zhipin.com/job_detail/example.html',
        matchedCardCount: null,
        warnings: [],
      },
    ],
  ])('executes once for supported URL %s', async (url, result) => {
    const executeExtraction = vi.fn().mockResolvedValue(result);

    const outcome = await requestStructuredPageExtraction(
      { id: 7, url },
      executeExtraction,
    );

    expect(executeExtraction).toHaveBeenCalledTimes(1);
    expect(executeExtraction).toHaveBeenCalledWith(7);
    expect(outcome).toEqual({ ok: true, result });
  });

  it('ignores query and hash changes but detects pathname navigation', async () => {
    const samePage = await requestStructuredPageExtraction(
      {
        id: 7,
        url: `${searchResult.pageUrl}?securityId=private#hash`,
      },
      vi.fn().mockResolvedValue(searchResult),
    );
    const navigated = await requestStructuredPageExtraction(
      { id: 7, url: searchResult.pageUrl },
      vi.fn().mockResolvedValue({
        ...searchResult,
        pageType: 'job_detail',
        pageUrl: 'https://www.zhipin.com/job_detail/changed.html',
        matchedCardCount: null,
      }),
    );

    expect(samePage).toEqual({ ok: true, result: searchResult });
    expect(navigated).toMatchObject({ ok: false, code: 'page_navigated' });
  });

  it('reports missing results and scripting failures without retrying', async () => {
    const failedExtraction = vi.fn().mockRejectedValue(new Error('blocked'));
    const failed = await requestStructuredPageExtraction(
      { id: 7, url: searchResult.pageUrl },
      failedExtraction,
    );
    const missing = await requestStructuredPageExtraction(
      { id: 7, url: searchResult.pageUrl },
      vi.fn().mockResolvedValue(undefined),
    );

    expect(failedExtraction).toHaveBeenCalledTimes(1);
    expect(failed).toMatchObject({ ok: false, code: 'scripting_failed' });
    expect(missing).toMatchObject({
      ok: false,
      code: 'missing_extraction_result',
    });
  });
});
