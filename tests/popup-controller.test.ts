import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { Window } from 'happy-dom';
import { describe, expect, it, vi } from 'vitest';

import {
  findPopupElements,
  initializePopup,
} from '../entrypoints/popup/popup-controller';
import type { ManualDomProbeResult } from '../src/manual-validation/dom-probe-types';

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
  });

  it('does not execute on popup open and hides the action on a non-BOSS page', async () => {
    const document = createPopupDocument();
    const elements = findPopupElements(document);
    const executeProbe = vi.fn();

    expect(elements).not.toBeNull();
    await initializePopup(elements!, {
      version: '0.1.0',
      getActiveTab: async () => ({ id: 3, url: 'https://example.com/' }),
      executeProbe,
    });

    expect(executeProbe).not.toHaveBeenCalled();
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
    });

    elements.button.click();
    await vi.waitFor(() =>
      expect(elements.probeStatus.textContent).toContain(message),
    );

    expect(elements.result.hidden).toBe(false);
  });
});
