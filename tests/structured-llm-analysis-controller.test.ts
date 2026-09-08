import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { Window } from 'happy-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { initializeStructuredLlmAnalysis } from '../entrypoints/popup/structured-llm-analysis-controller';

const popupHtml = readFileSync(
  fileURLToPath(new URL('../entrypoints/popup/index.html', import.meta.url)),
  'utf8',
);
const mainSource = readFileSync(
  fileURLToPath(new URL('../entrypoints/popup/main.ts', import.meta.url)),
  'utf8',
);
const controllerSource = readFileSync(
  fileURLToPath(new URL('../entrypoints/popup/structured-llm-analysis-controller.ts', import.meta.url)),
  'utf8',
);

const JOB_URL = 'https://www.zhipin.com/job_detail/popup-llm-analysis.html';

function createDocument(): Document {
  const window = new Window();
  window.document.write(popupHtml);
  window.document.close();
  return window.document as unknown as Document;
}

function controls(document: Document) {
  return {
    action: document.querySelector<HTMLElement>('[data-structured-llm-analysis-action]')!,
    button: document.querySelector<HTMLButtonElement>('[data-structured-llm-analysis-button]')!,
    status: document.querySelector<HTMLElement>('[data-structured-llm-analysis-status]')!,
  };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('structured LLM popup disclosure and wiring', () => {
  it('shows provider-neutral remote-data and API-cost disclosure', () => {
    const document = createDocument();
    const value = controls(document);
    const text = value.action.textContent ?? '';

    expect(value.action.hidden).toBe(true);
    expect(value.button.disabled).toBe(true);
    expect(value.button.textContent).toContain('发送到已配置的 AI 服务并分析当前岗位');
    for (const requiredText of [
      '只有点击下方按钮后才会发送并分析',
      '完整 JD',
      '最小化岗位上下文',
      '远程 AI 服务或中转站',
      'API 费用',
      '先把当前岗位保存到本地',
      '浏览器不会携带 API key',
      'companyName',
      'jobUrl',
      'rawText',
      'Cookie',
      'Session',
    ]) {
      expect(text).toContain(requiredText);
    }
    expect(text).toContain('岗位链接仅用于向本地服务指定当前岗位');
    expect(text).toContain('作为 AI provider 输入发送');
    expect(text).not.toContain('发送到 OpenAI 并分析当前岗位');
  });

  it('wires the controller only to active-tab metadata and the narrow local analysis client', () => {
    expect(mainSource).toContain('requestStructuredLlmAnalysisFromLocalService');
    expect(mainSource).toContain('initializeStructuredLlmAnalysis(document, {');
    expect(mainSource).toContain('analyze: requestStructuredLlmAnalysisFromLocalService');
    expect(controllerSource).not.toContain('executeScript');
    expect(controllerSource).not.toContain('fullJdText');
    expect(controllerSource).not.toContain('apiKey');
    expect(controllerSource).not.toContain('modelId');
    expect(controllerSource).not.toContain('BOSS_JOB_RADAR_OPENAI_API_KEY');
    expect(controllerSource).not.toContain('BOSS_JOB_RADAR_LAVE8_API_KEY');
  });
});

describe('structured LLM popup initialization', () => {
  it('classifies a canonical detail tab without starting analysis', async () => {
    const document = createDocument();
    const getActiveTab = vi.fn().mockResolvedValue({ url: JOB_URL });
    const analyze = vi.fn();

    await initializeStructuredLlmAnalysis(document, { getActiveTab, analyze });

    const value = controls(document);
    expect(value.action.hidden).toBe(false);
    expect(value.button.disabled).toBe(false);
    expect(value.status.textContent).toBe('');
    expect(getActiveTab).toHaveBeenCalledTimes(1);
    expect(analyze).not.toHaveBeenCalled();
  });

  it.each([
    undefined,
    { url: `${JOB_URL}?from=search` },
    { url: `${JOB_URL}#anchor` },
    { url: JOB_URL.replace('https://', 'http://') },
    { url: JOB_URL.replace('www.zhipin.com', 'm.zhipin.com') },
    { url: 'https://www.zhipin.com/web/geek/job' },
    { url: '/job_detail/popup-llm-analysis.html' },
  ])('fails closed for unsupported initial tab %#', async (tab) => {
    const document = createDocument();
    const analyze = vi.fn();
    await initializeStructuredLlmAnalysis(document, {
      getActiveTab: async () => tab,
      analyze,
    });
    const value = controls(document);
    expect(value.action.hidden).toBe(true);
    expect(value.button.disabled).toBe(true);
    expect(analyze).not.toHaveBeenCalled();
  });

  it('fails closed when the initial active-tab lookup throws', async () => {
    const document = createDocument();
    const analyze = vi.fn();
    await initializeStructuredLlmAnalysis(document, {
      getActiveTab: async () => { throw new Error('tab unavailable'); },
      analyze,
    });
    const value = controls(document);
    expect(value.action.hidden).toBe(true);
    expect(value.button.disabled).toBe(true);
    expect(analyze).not.toHaveBeenCalled();
  });
});

describe('structured LLM popup explicit click flow', () => {
  it('re-reads the active tab, analyzes exactly once, then re-reads the tab again before restoring', async () => {
    const document = createDocument();
    const getActiveTab = vi.fn()
      .mockResolvedValueOnce({ url: JOB_URL })
      .mockResolvedValueOnce({ url: JOB_URL })
      .mockResolvedValueOnce({ url: JOB_URL });
    const analyze = vi.fn().mockResolvedValue({ ok: true, id: 51 });

    await initializeStructuredLlmAnalysis(document, { getActiveTab, analyze });
    const value = controls(document);
    value.button.click();

    await vi.waitFor(() => expect(value.status.textContent).toBe('AI 分析已完成并保存到本地。'));
    await vi.waitFor(() => expect(getActiveTab).toHaveBeenCalledTimes(3));
    expect(analyze).toHaveBeenCalledTimes(1);
    expect(analyze).toHaveBeenCalledWith({ jobUrl: JOB_URL });
    expect(value.action.hidden).toBe(false);
    expect(value.button.disabled).toBe(false);
  });

  it('does not analyze when the tab becomes noncanonical at click time', async () => {
    const document = createDocument();
    const changedUrl = `${JOB_URL}?from=other-tab`;
    const getActiveTab = vi.fn()
      .mockResolvedValueOnce({ url: JOB_URL })
      .mockResolvedValue({ url: changedUrl });
    const analyze = vi.fn();

    await initializeStructuredLlmAnalysis(document, { getActiveTab, analyze });
    const value = controls(document);
    value.button.click();

    await vi.waitFor(() => expect(value.status.textContent).toBe('当前页面无法发起 AI 分析。'));
    await vi.waitFor(() => expect(getActiveTab).toHaveBeenCalledTimes(3));
    expect(analyze).not.toHaveBeenCalled();
    expect(value.action.hidden).toBe(true);
    expect(value.button.disabled).toBe(true);
  });

  it('does not analyze when the active tab disappears at click time', async () => {
    const document = createDocument();
    const getActiveTab = vi.fn()
      .mockResolvedValueOnce({ url: JOB_URL })
      .mockResolvedValue(undefined);
    const analyze = vi.fn();

    await initializeStructuredLlmAnalysis(document, { getActiveTab, analyze });
    const value = controls(document);
    value.button.click();

    await vi.waitFor(() => expect(value.status.textContent).toBe('当前页面无法发起 AI 分析。'));
    expect(analyze).not.toHaveBeenCalled();
    expect(value.action.hidden).toBe(true);
    expect(value.button.disabled).toBe(true);
  });

  it('keeps one in-flight request and ignores duplicate clicks', async () => {
    const document = createDocument();
    let resolveAnalysis!: (value: { readonly ok: true; readonly id: number }) => void;
    const pending = new Promise<{ readonly ok: true; readonly id: number }>((resolve) => {
      resolveAnalysis = resolve;
    });
    const analyze = vi.fn().mockReturnValue(pending);
    const getActiveTab = vi.fn().mockResolvedValue({ url: JOB_URL });

    await initializeStructuredLlmAnalysis(document, { getActiveTab, analyze });
    const value = controls(document);
    value.button.click();
    value.button.click();

    await vi.waitFor(() => expect(analyze).toHaveBeenCalledTimes(1));
    expect(value.button.disabled).toBe(true);
    expect(value.status.textContent).toBe('正在分析当前岗位，请稍候…');

    resolveAnalysis({ ok: true, id: 1 });
    await vi.waitFor(() => expect(value.status.textContent).toBe('AI 分析已完成并保存到本地。'));
    expect(analyze).toHaveBeenCalledTimes(1);
    expect(value.button.disabled).toBe(false);
  });

  it('shows only the client fixed failure message', async () => {
    const document = createDocument();
    const analyze = vi.fn().mockResolvedValue({
      ok: false,
      code: 'job_not_found',
      message: '请先把当前岗位保存到本地，再进行 AI 分析。',
    });

    await initializeStructuredLlmAnalysis(document, {
      getActiveTab: async () => ({ url: JOB_URL }),
      analyze,
    });
    const value = controls(document);
    value.button.click();

    await vi.waitFor(() => expect(value.status.textContent).toBe('请先把当前岗位保存到本地，再进行 AI 分析。'));
    expect(value.status.textContent).not.toContain('job_not_found');
  });

  it('uses a fixed non-sensitive fallback when the analysis dependency throws', async () => {
    const document = createDocument();
    const analyze = vi.fn().mockRejectedValue(new Error('PRIVATE_PROVIDER_DETAIL'));

    await initializeStructuredLlmAnalysis(document, {
      getActiveTab: async () => ({ url: JOB_URL }),
      analyze,
    });
    const value = controls(document);
    value.button.click();

    await vi.waitFor(() => expect(value.status.textContent).toBe('AI 分析请求失败。'));
    expect(value.status.textContent).not.toContain('PRIVATE_PROVIDER_DETAIL');
  });

  it('uses the fresh final tab and hides the action when the user switches away during analysis', async () => {
    const document = createDocument();
    const getActiveTab = vi.fn()
      .mockResolvedValueOnce({ url: JOB_URL })
      .mockResolvedValueOnce({ url: JOB_URL })
      .mockResolvedValueOnce({ url: 'https://www.zhipin.com/web/geek/job' });
    const analyze = vi.fn().mockResolvedValue({ ok: true, id: 8 });

    await initializeStructuredLlmAnalysis(document, { getActiveTab, analyze });
    const value = controls(document);
    value.button.click();

    await vi.waitFor(() => expect(getActiveTab).toHaveBeenCalledTimes(3));
    expect(value.status.textContent).toBe('AI 分析已完成并保存到本地。');
    expect(value.action.hidden).toBe(true);
    expect(value.button.disabled).toBe(true);
  });

  it('fails closed if the final active-tab refresh throws', async () => {
    const document = createDocument();
    const getActiveTab = vi.fn()
      .mockResolvedValueOnce({ url: JOB_URL })
      .mockResolvedValueOnce({ url: JOB_URL })
      .mockRejectedValueOnce(new Error('tab closed during analysis'));
    const analyze = vi.fn().mockResolvedValue({ ok: true, id: 9 });

    await initializeStructuredLlmAnalysis(document, { getActiveTab, analyze });
    const value = controls(document);
    value.button.click();

    await vi.waitFor(() => expect(getActiveTab).toHaveBeenCalledTimes(3));
    expect(value.status.textContent).toBe('AI 分析已完成并保存到本地。');
    expect(value.action.hidden).toBe(true);
    expect(value.button.disabled).toBe(true);
  });
});
