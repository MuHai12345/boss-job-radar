import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { Window } from 'happy-dom';
import { describe, expect, it, vi } from 'vitest';

import { initializeJobLinkCheck } from '../entrypoints/popup/job-link-check-controller';
import type { ManualLinkInspection } from '../src/page-extraction/job-link-check-request';

const popupHtml = readFileSync(
  fileURLToPath(new URL('../entrypoints/popup/index.html', import.meta.url)),
  'utf8',
);
const JOB_URL = 'https://www.zhipin.com/job_detail/controller-example.html';

function createDocument(): Document {
  const window = new Window();
  window.document.write(popupHtml);
  window.document.close();
  return window.document as unknown as Document;
}

function availableInspection(): ManualLinkInspection {
  const probe = {
    pageMatches: true,
    challenge: false,
    markerCode: null,
    observedAt: '2026-09-07T10:00:00.000Z',
  } as const;
  return {
    before: probe,
    after: probe,
    documentStable: true,
    extraction: {
      pageType: 'job_detail',
      pageUrl: JOB_URL,
      capturedAt: probe.observedAt,
      matchedCardCount: null,
      cards: [],
      detail: {
        title: '电商运营助理',
        companyName: '合成公司',
        salaryText: '8-10K',
        locationText: '上海',
        experienceText: '经验不限',
        educationText: '本科',
        tags: [],
        jobHrefRaw: '/job_detail/controller-example.html',
        jobUrl: JOB_URL,
        recruiterActivityText: null,
        publishedText: null,
        fullJdText: '负责商品运营。',
        rawDetailText: '合成详情',
        missingFields: [],
        warnings: [],
      },
      warnings: [],
    },
  };
}

function controls(document: Document) {
  return {
    action: document.querySelector<HTMLElement>('[data-job-link-check-action]')!,
    button: document.querySelector<HTMLButtonElement>('[data-job-link-check-button]')!,
    status: document.querySelector<HTMLElement>('[data-job-link-check-status]')!,
  };
}

describe('job link check popup controller', () => {
  it('only exposes the action for a checkable BOSS detail URL and does not inspect on open', async () => {
    const document = createDocument();
    const executeInspection = vi.fn();
    const saveCheck = vi.fn();

    await initializeJobLinkCheck(document, {
      getActiveTab: async () => ({ id: 7, url: JOB_URL }),
      executeInspection,
      saveCheck,
    });

    const value = controls(document);
    expect(value.action.hidden).toBe(false);
    expect(value.button.disabled).toBe(false);
    expect(executeInspection).not.toHaveBeenCalled();
    expect(saveCheck).not.toHaveBeenCalled();
  });

  it('checks once, saves the available result and restores the supported button', async () => {
    const document = createDocument();
    const executeInspection = vi.fn().mockResolvedValue(availableInspection());
    const saveCheck = vi.fn().mockResolvedValue({ ok: true });

    await initializeJobLinkCheck(document, {
      getActiveTab: async () => ({ id: 7, url: JOB_URL }),
      executeInspection,
      saveCheck,
    });
    const value = controls(document);
    value.button.click();

    await vi.waitFor(() => expect(value.status.textContent).toBe('当前岗位链接可正常打开。'));
    expect(executeInspection).toHaveBeenCalledTimes(1);
    expect(saveCheck).toHaveBeenCalledTimes(1);
    expect(saveCheck).toHaveBeenCalledWith({
      jobUrl: JOB_URL,
      observedAt: '2026-09-07T10:00:00.000Z',
      status: 'available',
      markerCode: null,
    });
    expect(value.action.hidden).toBe(false);
    expect(value.button.disabled).toBe(false);
  });

  it('fails closed after the active tab disappears during a click', async () => {
    const document = createDocument();
    const getActiveTab = vi.fn()
      .mockResolvedValueOnce({ id: 7, url: JOB_URL })
      .mockResolvedValueOnce(undefined);
    const executeInspection = vi.fn();
    const saveCheck = vi.fn();

    await initializeJobLinkCheck(document, { getActiveTab, executeInspection, saveCheck });
    const value = controls(document);
    value.button.click();

    await vi.waitFor(() => expect(value.status.textContent).toBe('当前页面无法可靠判断岗位链接状态。'));
    expect(executeInspection).not.toHaveBeenCalled();
    expect(saveCheck).not.toHaveBeenCalled();
    expect(value.action.hidden).toBe(true);
    expect(value.button.disabled).toBe(true);
  });

  it('fails closed after active-tab lookup throws during a click', async () => {
    const document = createDocument();
    const getActiveTab = vi.fn()
      .mockResolvedValueOnce({ id: 7, url: JOB_URL })
      .mockRejectedValueOnce(new Error('tab unavailable'));

    await initializeJobLinkCheck(document, {
      getActiveTab,
      executeInspection: vi.fn(),
      saveCheck: vi.fn(),
    });
    const value = controls(document);
    value.button.click();

    await vi.waitFor(() => expect(value.status.textContent).toBe('当前页面无法可靠判断岗位链接状态。'));
    expect(value.action.hidden).toBe(true);
    expect(value.button.disabled).toBe(true);
  });

  it('keeps a concurrency lock while inspection is in flight', async () => {
    const document = createDocument();
    let resolveInspection!: (value: ManualLinkInspection) => void;
    const pending = new Promise<ManualLinkInspection>((resolve) => {
      resolveInspection = resolve;
    });
    const executeInspection = vi.fn().mockReturnValue(pending);
    const saveCheck = vi.fn().mockResolvedValue({ ok: true });

    await initializeJobLinkCheck(document, {
      getActiveTab: async () => ({ id: 7, url: JOB_URL }),
      executeInspection,
      saveCheck,
    });
    const value = controls(document);
    value.button.click();
    value.button.click();

    await vi.waitFor(() => expect(executeInspection).toHaveBeenCalledTimes(1));
    expect(value.button.disabled).toBe(true);
    resolveInspection(availableInspection());
    await vi.waitFor(() => expect(value.status.textContent).toBe('当前岗位链接可正常打开。'));
    expect(saveCheck).toHaveBeenCalledTimes(1);
    expect(value.button.disabled).toBe(false);
  });
});
