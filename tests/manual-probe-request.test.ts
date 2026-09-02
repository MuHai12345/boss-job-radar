import { describe, expect, it, vi } from 'vitest';

import type { ManualDomProbeResult } from '../src/manual-validation/dom-probe-types';
import { requestManualDomProbe } from '../src/manual-validation/manual-probe-request';

const probeResult: ManualDomProbeResult = {
  pageUrl: 'https://www.zhipin.com/web/geek/job',
  pageTitle: '人工验证页',
  timestamp: '2026-09-02T00:00:00.000Z',
  candidateSummary: {
    bodyExists: true,
    visibleMainCount: 1,
    visibleArticleCount: 0,
    visibleSectionCount: 0,
    linkCount: 0,
    headingCount: 0,
    visibleTextLength: 4,
    documentLanguage: 'zh-CN',
    pathname: '/web/geek/job',
    candidates: [],
  },
  warnings: ['no_candidates'],
};

describe('requestManualDomProbe', () => {
  it('does not execute the probe for a non-BOSS page', async () => {
    const executeProbe = vi.fn();

    const outcome = await requestManualDomProbe(
      { id: 1, url: 'https://example.com/' },
      executeProbe,
    );

    expect(executeProbe).not.toHaveBeenCalled();
    expect(outcome).toEqual({
      ok: false,
      code: 'not_boss_page',
      message: '仅可在当前活动的 BOSS直聘页面运行人工验证。',
    });
  });

  it('reports a missing active tab id without executing the probe', async () => {
    const executeProbe = vi.fn();

    const outcome = await requestManualDomProbe(
      { url: 'https://www.zhipin.com/web/geek/job' },
      executeProbe,
    );

    expect(executeProbe).not.toHaveBeenCalled();
    expect(outcome).toMatchObject({ ok: false, code: 'missing_tab_id' });
  });

  it('returns a successful probe result for the unchanged BOSS page', async () => {
    const executeProbe = vi.fn().mockResolvedValue(probeResult);

    const outcome = await requestManualDomProbe(
      { id: 7, url: probeResult.pageUrl },
      executeProbe,
    );

    expect(executeProbe).toHaveBeenCalledWith(7);
    expect(outcome).toEqual({ ok: true, result: probeResult });
  });

  it('converts scripting failures into a user-readable state without retrying', async () => {
    const executeProbe = vi.fn().mockRejectedValue(new Error('Cannot access page'));

    const outcome = await requestManualDomProbe(
      { id: 7, url: probeResult.pageUrl },
      executeProbe,
    );

    expect(executeProbe).toHaveBeenCalledTimes(1);
    expect(outcome).toEqual({
      ok: false,
      code: 'scripting_failed',
      message:
        '无法读取当前页面。页面可能不允许扩展注入，请保持页面打开后重试。',
    });
  });

  it('reports an absent scripting result', async () => {
    const outcome = await requestManualDomProbe(
      { id: 7, url: probeResult.pageUrl },
      vi.fn().mockResolvedValue(undefined),
    );

    expect(outcome).toMatchObject({ ok: false, code: 'missing_probe_result' });
  });

  it('reports when the page navigated while the probe was executing', async () => {
    const outcome = await requestManualDomProbe(
      { id: 7, url: probeResult.pageUrl },
      vi.fn().mockResolvedValue({
        ...probeResult,
        pageUrl: 'https://www.zhipin.com/job_detail/changed.html',
      }),
    );

    expect(outcome).toEqual({
      ok: false,
      code: 'page_navigated',
      message: '页面在验证过程中发生了跳转，请确认当前页面后重新点击。',
    });
  });
});
