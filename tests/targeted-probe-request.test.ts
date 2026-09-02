import { describe, expect, it, vi } from 'vitest';

import type { TargetedDomProbeResult } from '../src/manual-validation/targeted-dom-probe-types';
import {
  classifyTargetedProbeUrl,
  requestTargetedDomProbe,
} from '../src/manual-validation/targeted-probe-request';

const result: TargetedDomProbeResult = {
  pageUrl: 'https://www.zhipin.com/web/geek/jobs',
  pageType: 'search_results',
  timestamp: '2026-09-02T00:00:00.000Z',
  matchedCardCount: 0,
  targets: [],
  warnings: ['no_job_cards'],
};

describe('classifyTargetedProbeUrl', () => {
  it.each([
    ['https://www.zhipin.com/web/geek/jobs', 'search_results'],
    ['https://www.zhipin.com/web/geek/jobs?q=secret#private', 'search_results'],
    ['https://www.zhipin.com/job_detail/example.html', 'job_detail'],
    [
      'https://www.zhipin.com/job_detail/example.html?securityId=secret#private',
      'job_detail',
    ],
  ] as const)('classifies supported URL %s', (url, pageType) => {
    expect(classifyTargetedProbeUrl(url)).toEqual({ supported: true, pageType });
  });

  it.each([
    'https://example.com/web/geek/jobs',
    'https://www.zhipin.com/',
    'https://www.zhipin.com/web/geek/jobs/extra',
    'https://www.zhipin.com/job_detail/example',
    'https://www.zhipin.com/job_detail/.html/extra',
  ])('rejects unsupported URL %s', (url) => {
    expect(classifyTargetedProbeUrl(url)).toEqual({
      supported: false,
      pageType: 'unsupported',
    });
  });
});

describe('requestTargetedDomProbe', () => {
  it.each([
    ['non-BOSS page', 'https://example.com/web/geek/jobs'],
    ['BOSS home page', 'https://www.zhipin.com/'],
  ])('does not execute on an unsupported %s', async (_, url) => {
    const executeProbe = vi.fn();

    const outcome = await requestTargetedDomProbe({ id: 1, url }, executeProbe);

    expect(executeProbe).not.toHaveBeenCalled();
    expect(outcome).toMatchObject({ ok: false, code: 'unsupported_page' });
  });

  it.each([
    'https://www.zhipin.com/web/geek/jobs',
    'https://www.zhipin.com/job_detail/example.html',
  ])('executes once on supported URL %s', async (url) => {
    const pageType = url.includes('/job_detail/') ? 'job_detail' : 'search_results';
    const probeResult: TargetedDomProbeResult = {
      ...result,
      pageUrl: url,
      pageType,
    };
    const executeProbe = vi.fn().mockResolvedValue(probeResult);

    const outcome = await requestTargetedDomProbe(
      { id: 7, url },
      executeProbe,
    );

    expect(executeProbe).toHaveBeenCalledTimes(1);
    expect(executeProbe).toHaveBeenCalledWith(7);
    expect(outcome).toEqual({ ok: true, result: probeResult });
  });

  it('requires a tab ID before executing', async () => {
    const executeProbe = vi.fn();
    const outcome = await requestTargetedDomProbe(
      { url: result.pageUrl },
      executeProbe,
    );

    expect(executeProbe).not.toHaveBeenCalled();
    expect(outcome).toMatchObject({ ok: false, code: 'missing_tab_id' });
  });

  it('reports scripting failure and a missing result without retrying', async () => {
    const failedProbe = vi.fn().mockRejectedValue(new Error('blocked'));
    const failed = await requestTargetedDomProbe(
      { id: 7, url: result.pageUrl },
      failedProbe,
    );
    const missing = await requestTargetedDomProbe(
      { id: 7, url: result.pageUrl },
      vi.fn().mockResolvedValue(undefined),
    );

    expect(failedProbe).toHaveBeenCalledTimes(1);
    expect(failed).toMatchObject({ ok: false, code: 'scripting_failed' });
    expect(missing).toMatchObject({
      ok: false,
      code: 'missing_probe_result',
    });
  });

  it('uses protocol, hostname, and pathname for navigation identity', async () => {
    const samePage = await requestTargetedDomProbe(
      {
        id: 7,
        url: `${result.pageUrl}?securityId=secret#private`,
      },
      vi.fn().mockResolvedValue(result),
    );
    const navigated = await requestTargetedDomProbe(
      { id: 7, url: result.pageUrl },
      vi.fn().mockResolvedValue({
        ...result,
        pageUrl: 'https://www.zhipin.com/job_detail/changed.html',
        pageType: 'job_detail',
      }),
    );

    expect(samePage).toEqual({ ok: true, result });
    expect(navigated).toMatchObject({ ok: false, code: 'page_navigated' });
  });
});
