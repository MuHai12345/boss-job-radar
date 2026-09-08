import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { Window } from 'happy-dom';
import { describe, expect, it } from 'vitest';

function read(relative: string): string {
  return readFileSync(fileURLToPath(new URL(relative, import.meta.url)), 'utf8');
}

const sidepanelHtml = read('../entrypoints/sidepanel/index.html');
const sidepanelMain = read('../entrypoints/sidepanel/main.ts');
const snapshotSource = read('../entrypoints/sidepanel/snapshot.ts');
const viewSource = read('../entrypoints/sidepanel/view.ts');
const popupHtml = read('../entrypoints/popup/index.html');
const popupMain = read('../entrypoints/popup/main.ts');
const wxtConfig = read('../wxt.config.ts');

function sidepanelDocument(): Document {
  const window = new Window();
  window.document.write(sidepanelHtml);
  window.document.close();
  return window.document as unknown as Document;
}

describe('side panel workspace product contract', () => {
  it('uses the side panel as the persistent primary workspace', () => {
    const document = sidepanelDocument();
    expect(document.querySelector('[data-job-summary]')).not.toBeNull();
    expect(document.querySelector('[data-results]')).not.toBeNull();
    expect(document.querySelector('[data-analysis]')).not.toBeNull();
    expect(document.querySelector('[data-history]')).not.toBeNull();
    expect(document.body.textContent).toContain('侧边栏模式');
    expect(document.body.textContent).toContain('切换页面不中断');
  });

  it('keeps popup as a small launcher for the native side panel', () => {
    const window = new Window();
    window.document.write(popupHtml);
    window.document.close();
    const button = window.document.querySelector('[data-open-workspace]');
    expect(button).not.toBeNull();
    expect(window.document.body.textContent).toContain('打开侧边栏工作台');
    expect(popupMain).toContain('browser.sidePanel.open({ windowId })');
    expect(popupMain).not.toContain('requestStructuredLlmAnalysisFromLocalService');
    expect(popupMain).not.toContain('saveImportRequestToLocalService');
  });

  it('declares only the additional browser permissions needed by the persistent workspace', () => {
    expect(wxtConfig).toContain("permissions: ['activeTab', 'scripting', 'storage', 'tabs', 'sidePanel']");
    expect(wxtConfig).toContain("host_permissions: ['http://127.0.0.1:32123/*']");
    expect(wxtConfig).not.toContain('<all_urls>');
    expect(wxtConfig).not.toContain('cookies');
  });

  it('canonicalizes a normal parameterized BOSS detail URL before AI analysis', () => {
    expect(sidepanelMain).toContain('return canonicalCheckableJobUrl(tab.url);');
    expect(sidepanelMain).toContain('requestStructuredLlmAnalysisFromLocalService({ jobUrl: canonical })');
    expect(sidepanelMain).not.toContain('canonical === tab?.url');
    expect(sidepanelMain).not.toContain('canonical === tab.url');
    expect(viewSource).toContain('发送前会去除页面参数');
  });

  it('restores the verified manual job-link check as an explicit side-panel action', () => {
    const document = sidepanelDocument();
    const button = document.querySelector<HTMLButtonElement>('[data-action="link_check"]');
    expect(button).not.toBeNull();
    expect(button?.textContent).toContain('检查岗位链接状态');
    expect(sidepanelMain).toContain("if (action === 'link_check')");
    expect(sidepanelMain).toContain('requestJobLinkCheck(tab');
    expect(sidepanelMain).toContain('runJobLinkStatusProbe');
    expect(sidepanelMain).toContain('runVerifiedBossStructuredExtraction');
    expect(sidepanelMain).toContain('saveJobLinkCheckToLocalService(request)');
  });

  it('does not add automatic link checks or automatic AI calls on workspace initialization', () => {
    const initializer = sidepanelMain.slice(sidepanelMain.indexOf('void (async () => {'));
    expect(initializer).not.toContain('requestJobLinkCheck(');
    expect(initializer).not.toContain('requestStructuredLlmAnalysisFromLocalService(');
    expect(initializer).not.toContain('saveJobLinkCheckToLocalService(');
  });

  it('preserves the last result across tab activation and navigation events', () => {
    expect(sidepanelMain).toContain('browser.tabs.onActivated.addListener');
    expect(sidepanelMain).toContain('browser.tabs.onUpdated.addListener');
    expect(sidepanelMain).toContain('state.viewingPrevious = true');
    const pageChangedBody = sidepanelMain.slice(
      sidepanelMain.indexOf('function pageChanged()'),
      sidepanelMain.indexOf('function fail('),
    );
    expect(pageChangedBody).not.toContain('state.jobs = []');
    expect(pageChangedBody).not.toContain('state.analysis = null');
    expect(pageChangedBody).not.toContain('state.linkCheck = null');
  });

  it('persists only a minimized allowlisted display snapshot', () => {
    expect(snapshotSource).toContain("const STORAGE_KEY = 'workspace.ui-snapshot.v1'");
    expect(snapshotSource).toContain('sanitizeSnapshot');
    expect(snapshotSource).toContain('browser.storage.local.set');
    expect(snapshotSource).toContain('canonicalCheckableJobUrl(linkCheck.jobUrl)');
    expect(snapshotSource).toContain("linkCheck.status === 'available'");
    expect(snapshotSource).toContain("linkCheck.status === 'explicitly_unavailable'");
    expect(snapshotSource).toContain("linkCheck.status === 'unknown'");
    expect(snapshotSource).not.toContain('fullJdText:');
    expect(snapshotSource).not.toContain('rawText:');
    expect(snapshotSource).not.toContain('rawHtml');
  });

  it('does not place provider credentials or relay configuration in browser-side state', () => {
    for (const source of [sidepanelMain, snapshotSource, viewSource, popupMain]) {
      expect(source).not.toContain('BOSS_JOB_RADAR_LAVE8_API_KEY');
      expect(source).not.toContain('BOSS_JOB_RADAR_OPENAI_API_KEY');
      expect(source).not.toContain('Authorization: Bearer');
      expect(source).not.toContain('https://lave8.com/v1/responses');
    }
  });

  it('keeps raw structured data secondary instead of making JSON the main workspace', () => {
    const document = sidepanelDocument();
    const details = document.querySelector('details[data-snapshot-details]');
    expect(details).not.toBeNull();
    expect(details?.querySelector('summary')?.textContent).toContain('查看展示层结构化数据');
    expect(document.querySelector('pre[data-snapshot-json]')).not.toBeNull();
    expect(document.querySelector('[data-job-summary]')).not.toBeNull();
  });
});
