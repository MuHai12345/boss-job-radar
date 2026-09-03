import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { Window } from 'happy-dom';
import { describe, expect, it, vi } from 'vitest';

import {
  findPopupElements,
  initializePopup,
} from '../entrypoints/popup/popup-controller';
import type { ManualDomProbeResult } from '../src/manual-validation/dom-probe-types';
import type { TargetedDomProbeResult } from '../src/manual-validation/targeted-dom-probe-types';
import type { StructuredPageExtractionResult } from '../src/page-extraction/structured-page-extraction-types';

const popupHtml = readFileSync(
  fileURLToPath(new URL('../entrypoints/popup/index.html', import.meta.url)),
  'utf8',
);

const probeResult: ManualDomProbeResult = {
  pageUrl: 'https://www.zhipin.com/web/geek/job',
  pageTitle: '人工验证页',
  timestamp: '2026-09-02T00:00:00.000Z',
  candidateSummary: {
    bodyExists: true,
    visibleMainCount: 1,
    visibleArticleCount: 2,
    visibleSectionCount: 0,
    linkCount: 2,
    headingCount: 2,
    visibleTextLength: 20,
    documentLanguage: 'zh-CN',
    pathname: '/web/geek/job',
    candidates: [],
  },
  warnings: [],
};

const targetedProbeResult: TargetedDomProbeResult = {
  pageUrl: 'https://www.zhipin.com/web/geek/jobs',
  pageType: 'search_results',
  timestamp: '2026-09-02T00:00:00.000Z',
  matchedCardCount: 1,
  targets: [
    {
      selectorLabel: 'li.job-card-box',
      matchedCount: 1,
      samples: [],
    },
  ],
  warnings: [],
};

const structuredExtractionResult: StructuredPageExtractionResult = {
  pageType: 'search_results',
  pageUrl: 'https://www.zhipin.com/web/geek/jobs',
  capturedAt: '2026-09-02T00:00:00.000Z',
  matchedCardCount: 1,
  cards: [],
  detail: null,
  warnings: [],
};

function createPopupDocument(): Document {
  const window = new Window();
  window.document.write(popupHtml);
  window.document.close();
  return window.document as unknown as Document;
}

describe('popup controller', () => {
  it('finds the manual validation controls and required privacy notices', () => {
    const document = createPopupDocument();

    expect(findPopupElements(document)).not.toBeNull();
    expect(document.body.textContent).toContain(
      '仅在你点击后读取当前页面的有限 DOM 结构摘要，不自动采集、不保存、不上传。',
    );
    expect(document.body.textContent).toContain(
      '请在发送给 ChatGPT 前自行确认内容中没有不希望分享的信息。',
    );
    expect(document.body.textContent).toContain('深度验证岗位结构');
    expect(document.body.textContent).toContain(
      '仅分析已人工确认的岗位相关 DOM 区域，不自动点击、不滚动、不保存、不上传。',
    );
    expect(document.body.textContent).toContain('解析当前岗位数据');
    expect(document.body.textContent).toContain(
      '只读取当前已打开页面中已验证的岗位字段，不自动点击、不滚动、不翻页、不保存、不上传。',
    );
    expect(document.body.textContent).toContain('用户点击后解析当前页面');
    expect(document.body.textContent).not.toContain('当前尚未开始采集');
  });

  it('does not execute on popup open and hides the action on a non-BOSS page', async () => {
    const document = createPopupDocument();
    const elements = findPopupElements(document);
    const executeProbe = vi.fn();
    const executeTargetedProbe = vi.fn();
    const executeStructuredExtraction = vi.fn();

    expect(elements).not.toBeNull();
    await initializePopup(elements!, {
      version: '0.1.0',
      getActiveTab: async () => ({ id: 3, url: 'https://example.com/' }),
      executeProbe,
      executeTargetedProbe,
      executeStructuredExtraction,
    });

    expect(executeProbe).not.toHaveBeenCalled();
    expect(executeTargetedProbe).not.toHaveBeenCalled();
    expect(executeStructuredExtraction).not.toHaveBeenCalled();
    expect(elements?.pageStatus.textContent).toBe('非BOSS直聘页面');
    expect(elements?.action.hidden).toBe(true);
    expect(elements?.button.disabled).toBe(true);
  });

  it('executes exactly once after a click on a BOSS page and displays JSON', async () => {
    const document = createPopupDocument();
    const elements = findPopupElements(document)!;
    const executeProbe = vi.fn().mockResolvedValue(probeResult);

    await initializePopup(elements, {
      version: '0.1.0',
      getActiveTab: async () => ({ id: 7, url: probeResult.pageUrl }),
      executeProbe,
      executeTargetedProbe: vi.fn(),
      executeStructuredExtraction: vi.fn(),
    });

    expect(executeProbe).not.toHaveBeenCalled();
    expect(elements.action.hidden).toBe(false);
    expect(elements.button.disabled).toBe(false);

    elements.button.click();
    await vi.waitFor(() => expect(elements.result.hidden).toBe(false));

    expect(executeProbe).toHaveBeenCalledTimes(1);
    expect(elements.result.hidden).toBe(false);
    expect(JSON.parse(elements.output.textContent ?? '')).toEqual(probeResult);
    expect(elements.probeStatus.textContent).toBe('人工验证完成。');
  });

  it('shows a readable scripting error and does not retry', async () => {
    const document = createPopupDocument();
    const elements = findPopupElements(document)!;
    const executeProbe = vi.fn().mockRejectedValue(new Error('blocked'));

    await initializePopup(elements, {
      version: '0.1.0',
      getActiveTab: async () => ({ id: 7, url: probeResult.pageUrl }),
      executeProbe,
      executeTargetedProbe: vi.fn(),
      executeStructuredExtraction: vi.fn(),
    });

    elements.button.click();
    await vi.waitFor(() =>
      expect(elements.probeStatus.textContent).toContain(
        '页面可能不允许扩展注入',
      ),
    );

    expect(executeProbe).toHaveBeenCalledTimes(1);
    expect(elements.probeStatus.textContent).toContain('页面可能不允许扩展注入');
    expect(elements.output.textContent).toBe('');
  });

  it('rechecks the current page at click time and does not inject after navigation', async () => {
    const document = createPopupDocument();
    const elements = findPopupElements(document)!;
    const executeProbe = vi.fn();
    const getActiveTab = vi
      .fn()
      .mockResolvedValueOnce({ id: 7, url: probeResult.pageUrl })
      .mockResolvedValueOnce({ id: 7, url: 'https://example.com/after-navigation' });

    await initializePopup(elements, {
      version: '0.1.0',
      getActiveTab,
      executeProbe,
      executeTargetedProbe: vi.fn(),
      executeStructuredExtraction: vi.fn(),
    });

    elements.button.click();
    await vi.waitFor(() =>
      expect(elements.probeStatus.textContent).toContain(
        '仅可在当前活动的 BOSS直聘页面',
      ),
    );

    expect(getActiveTab).toHaveBeenCalledTimes(2);
    expect(executeProbe).not.toHaveBeenCalled();
  });

  it.each([
    ['body_missing', '当前页面没有 document.body'],
    ['no_candidates', '没有发现候选结构'],
  ] as const)('explains the %s probe warning in Chinese', async (warning, message) => {
    const document = createPopupDocument();
    const elements = findPopupElements(document)!;

    await initializePopup(elements, {
      version: '0.1.0',
      getActiveTab: async () => ({ id: 7, url: probeResult.pageUrl }),
      executeProbe: vi.fn().mockResolvedValue({
        ...probeResult,
        warnings: [warning],
      }),
      executeTargetedProbe: vi.fn(),
      executeStructuredExtraction: vi.fn(),
    });

    elements.button.click();
    await vi.waitFor(() =>
      expect(elements.probeStatus.textContent).toContain(message),
    );

    expect(elements.result.hidden).toBe(false);
  });

  it('keeps targeted probe hidden on BOSS home and does not run it on popup open', async () => {
    const document = createPopupDocument();
    const elements = findPopupElements(document)!;
    const executeTargetedProbe = vi.fn();

    await initializePopup(elements, {
      version: '0.1.0',
      getActiveTab: async () => ({ id: 7, url: 'https://www.zhipin.com/' }),
      executeProbe: vi.fn(),
      executeTargetedProbe,
      executeStructuredExtraction: vi.fn(),
    });

    expect(elements.action.hidden).toBe(false);
    expect(elements.targetedAction.hidden).toBe(true);
    expect(elements.targetedButton.disabled).toBe(true);
    expect(executeTargetedProbe).not.toHaveBeenCalled();
  });

  it('runs targeted probe exactly once after a user click and shows a separate result', async () => {
    const document = createPopupDocument();
    const elements = findPopupElements(document)!;
    const executeProbe = vi.fn();
    const executeTargetedProbe = vi.fn().mockResolvedValue(targetedProbeResult);

    await initializePopup(elements, {
      version: '0.1.0',
      getActiveTab: async () => ({ id: 7, url: targetedProbeResult.pageUrl }),
      executeProbe,
      executeTargetedProbe,
      executeStructuredExtraction: vi.fn(),
    });

    expect(executeTargetedProbe).not.toHaveBeenCalled();
    expect(elements.targetedAction.hidden).toBe(false);
    expect(elements.targetedButton.disabled).toBe(false);

    elements.targetedButton.click();
    await vi.waitFor(() => expect(elements.targetedResult.hidden).toBe(false));

    expect(executeTargetedProbe).toHaveBeenCalledTimes(1);
    expect(executeProbe).not.toHaveBeenCalled();
    expect(JSON.parse(elements.targetedOutput.textContent ?? '')).toEqual(
      targetedProbeResult,
    );
    expect(elements.targetedStatus.textContent).toBe('深度结构验证完成。');
    expect(elements.result.hidden).toBe(true);
  });

  it('rechecks targeted support at click time and never injects after navigation', async () => {
    const document = createPopupDocument();
    const elements = findPopupElements(document)!;
    const executeTargetedProbe = vi.fn();
    const getActiveTab = vi
      .fn()
      .mockResolvedValueOnce({ id: 7, url: targetedProbeResult.pageUrl })
      .mockResolvedValueOnce({ id: 7, url: 'https://www.zhipin.com/' });

    await initializePopup(elements, {
      version: '0.1.0',
      getActiveTab,
      executeProbe: vi.fn(),
      executeTargetedProbe,
      executeStructuredExtraction: vi.fn(),
    });

    elements.targetedButton.click();
    await vi.waitFor(() =>
      expect(elements.targetedStatus.textContent).toContain(
        '仅支持岗位搜索结果页或独立岗位详情页',
      ),
    );

    expect(getActiveTab).toHaveBeenCalledTimes(2);
    expect(executeTargetedProbe).not.toHaveBeenCalled();
  });

  it('keeps each probe button disabled while its request is in flight', async () => {
    const document = createPopupDocument();
    const elements = findPopupElements(document)!;
    let resolveManual!: (value: ManualDomProbeResult) => void;
    let resolveTargeted!: (value: TargetedDomProbeResult) => void;
    const executeProbe = vi.fn(
      () =>
        new Promise<ManualDomProbeResult>((resolve) => {
          resolveManual = resolve;
        }),
    );
    const executeTargetedProbe = vi.fn(
      () =>
        new Promise<TargetedDomProbeResult>((resolve) => {
          resolveTargeted = resolve;
        }),
    );

    await initializePopup(elements, {
      version: '0.1.0',
      getActiveTab: async () => ({ id: 7, url: targetedProbeResult.pageUrl }),
      executeProbe,
      executeTargetedProbe,
      executeStructuredExtraction: vi.fn(),
    });

    elements.button.click();
    elements.targetedButton.click();
    await vi.waitFor(() => {
      expect(executeProbe).toHaveBeenCalledTimes(1);
      expect(executeTargetedProbe).toHaveBeenCalledTimes(1);
    });

    expect(elements.button.disabled).toBe(true);
    expect(elements.targetedButton.disabled).toBe(true);
    elements.button.click();
    elements.targetedButton.click();
    expect(executeProbe).toHaveBeenCalledTimes(1);
    expect(executeTargetedProbe).toHaveBeenCalledTimes(1);

    resolveManual({ ...probeResult, pageUrl: targetedProbeResult.pageUrl });
    resolveTargeted(targetedProbeResult);
    await vi.waitFor(() => {
      expect(elements.button.disabled).toBe(false);
      expect(elements.targetedButton.disabled).toBe(false);
    });
  });

  it('does not extract on popup open and keeps structured extraction hidden on BOSS home', async () => {
    const document = createPopupDocument();
    const elements = findPopupElements(document)!;
    const executeStructuredExtraction = vi.fn();

    await initializePopup(elements, {
      version: '0.1.0',
      getActiveTab: async () => ({ id: 7, url: 'https://www.zhipin.com/' }),
      executeProbe: vi.fn(),
      executeTargetedProbe: vi.fn(),
      executeStructuredExtraction,
    });

    expect(executeStructuredExtraction).not.toHaveBeenCalled();
    expect(elements.structuredAction.hidden).toBe(true);
    expect(elements.structuredButton.disabled).toBe(true);
  });

  it('runs structured extraction only after a click and displays separate JSON', async () => {
    const document = createPopupDocument();
    const elements = findPopupElements(document)!;
    const executeProbe = vi.fn();
    const executeTargetedProbe = vi.fn();
    const executeStructuredExtraction = vi
      .fn()
      .mockResolvedValue(structuredExtractionResult);

    await initializePopup(elements, {
      version: '0.1.0',
      getActiveTab: async () => ({
        id: 7,
        url: structuredExtractionResult.pageUrl,
      }),
      executeProbe,
      executeTargetedProbe,
      executeStructuredExtraction,
    });

    expect(executeStructuredExtraction).not.toHaveBeenCalled();
    expect(elements.structuredAction.hidden).toBe(false);
    expect(elements.structuredButton.disabled).toBe(false);

    elements.structuredButton.click();
    await vi.waitFor(() =>
      expect(elements.structuredResult.hidden).toBe(false),
    );

    expect(executeStructuredExtraction).toHaveBeenCalledTimes(1);
    expect(executeProbe).not.toHaveBeenCalled();
    expect(executeTargetedProbe).not.toHaveBeenCalled();
    expect(JSON.parse(elements.structuredOutput.textContent ?? '')).toEqual(
      structuredExtractionResult,
    );
    expect(elements.structuredStatus.textContent).toBe('当前岗位数据解析完成。');
    expect(elements.result.hidden).toBe(true);
    expect(elements.targetedResult.hidden).toBe(true);
  });

  it('rechecks structured extraction support at click time', async () => {
    const document = createPopupDocument();
    const elements = findPopupElements(document)!;
    const executeStructuredExtraction = vi.fn();
    const getActiveTab = vi
      .fn()
      .mockResolvedValueOnce({ id: 7, url: structuredExtractionResult.pageUrl })
      .mockResolvedValueOnce({ id: 7, url: 'https://www.zhipin.com/' });

    await initializePopup(elements, {
      version: '0.1.0',
      getActiveTab,
      executeProbe: vi.fn(),
      executeTargetedProbe: vi.fn(),
      executeStructuredExtraction,
    });

    elements.structuredButton.click();
    await vi.waitFor(() =>
      expect(elements.structuredStatus.textContent).toContain(
        '仅支持岗位搜索结果页或独立岗位详情页',
      ),
    );

    expect(getActiveTab).toHaveBeenCalledTimes(2);
    expect(executeStructuredExtraction).not.toHaveBeenCalled();
  });

  it('prevents duplicate structured extraction while a request is in flight', async () => {
    const document = createPopupDocument();
    const elements = findPopupElements(document)!;
    let resolveExtraction!: (value: StructuredPageExtractionResult) => void;
    const executeStructuredExtraction = vi.fn(
      () =>
        new Promise<StructuredPageExtractionResult>((resolve) => {
          resolveExtraction = resolve;
        }),
    );

    await initializePopup(elements, {
      version: '0.1.0',
      getActiveTab: async () => ({
        id: 7,
        url: structuredExtractionResult.pageUrl,
      }),
      executeProbe: vi.fn(),
      executeTargetedProbe: vi.fn(),
      executeStructuredExtraction,
    });

    elements.structuredButton.click();
    elements.structuredButton.click();
    await vi.waitFor(() =>
      expect(executeStructuredExtraction).toHaveBeenCalledTimes(1),
    );
    expect(elements.structuredButton.disabled).toBe(true);

    resolveExtraction(structuredExtractionResult);
    await vi.waitFor(() =>
      expect(elements.structuredButton.disabled).toBe(false),
    );
  });
});
