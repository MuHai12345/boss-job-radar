import { browser } from 'wxt/browser';
import { LOCAL_SERVICE_BASE_URL, requestStructuredLlmAnalysisFromLocalService, saveImportRequestToLocalService, saveJobLinkCheckToLocalService } from '../../src/bridge/local-service-client';
import { buildImportRequest } from '../../src/bridge/structured-extraction-to-observations';
import { verifiedBossJobDetailSelectorProfile } from '../../src/adapters/boss/job-detail-selector-profile';
import { verifiedBossJobCardSelectorProfile } from '../../src/adapters/boss/selector-profile';
import { runVerifiedBossStructuredExtraction } from '../../src/page-extraction/structured-page-extraction';
import { classifyStructuredPageExtractionUrl, requestStructuredPageExtraction } from '../../src/page-extraction/structured-page-extraction-request';
import { canonicalCheckableJobUrl } from '../../src/shared/job-link-check-types';
import { requestJobLinkCheck } from '../../src/page-extraction/job-link-check-request';
import { runJobLinkStatusProbe } from '../../src/page-extraction/job-link-status-probe';
import { emptySnapshot, jobUrl, loadSnapshot, saveSnapshot, summarizeExtraction, type Action, type ErrorCode } from './snapshot';
import { find, linkCheckMessages, renderSnapshot, renderStatus } from './view';
import './style.css';

type Tab = { id?: number; url?: string; pendingUrl?: string };
let state = emptySnapshot();
let activeTab: Tab | undefined;
let windowId: number | undefined;
let ready = false;
let busy = false;
let notice = '本次打开尚未发起新的 AI 分析请求。最近进度会自动保留在此浏览器中。';
let pageRevision = 0;
let queryRevision = 0;
let storageRevision = 0;
let syncedTabId: number | undefined;
let syncedPageUrl: string | null = null;

function classification(tab: Tab | undefined) {
  return classifyStructuredPageExtractionUrl(tab?.pendingUrl ? undefined : tab?.url);
}

function analysisUrl(tab: Tab | undefined): string | null {
  if (!tab || tab.pendingUrl) return null;
  return canonicalCheckableJobUrl(tab.url);
}

function render(): void {
  renderStatus(state, { ready, busy, notice,
    supported: activeTab?.id !== undefined && classification(activeTab).supported,
    canAnalyze: analysisUrl(activeTab) !== null,
  });
}

async function persist(): Promise<void> {
  const revision = ++storageRevision;
  find('[data-storage-status]').textContent = '正在保留最近进度…';
  try {
    await saveSnapshot(state);
    if (revision === storageRevision) find('[data-storage-status]').textContent = '展示快照已保留到本机，关闭工作台后可恢复。';
  } catch {
    if (revision === storageRevision) find('[data-storage-status]').textContent = '快照未能写入浏览器存储；当前结果仍在面板中，关闭后可能无法恢复。';
  }
}

async function getActiveTab(): Promise<Tab | undefined> {
  if (windowId === undefined) return undefined;
  const [tab] = await browser.tabs.query({ active: true, windowId });
  return tab;
}

async function refreshTab(): Promise<void> {
  const revision = ++queryRevision;
  let tab: Tab | undefined;
  try { tab = await getActiveTab(); } catch { tab = undefined; }
  if (revision !== queryRevision) return;
  activeTab = tab;
  const page = classification(tab);
  if (tab?.id !== syncedTabId || !page.supported || page.pageUrl !== syncedPageUrl) state.viewingPrevious = true;
  render();
}

function pageChanged(): void {
  pageRevision += 1;
  queryRevision += 1;
  syncedTabId = undefined;
  syncedPageUrl = null;
  activeTab = undefined;
  state.viewingPrevious = true;
  render();
  if (ready) void persist();
  void refreshTab();
}

function fail(code: ErrorCode): void {
  state.error = code;
}

async function isStillCurrent(tab: Tab, revision: number): Promise<boolean> {
  const latest = await getActiveTab();
  return revision === pageRevision && latest?.id === tab.id
    && !latest?.pendingUrl && latest?.url === tab.url;
}

function connection(connected: boolean): void {
  const label = find('[data-connection]');
  label.dataset.connected = String(connected);
  label.textContent = connected ? '本地服务 · 最近请求已连接' : '本地服务 · 无法连接';
}

async function perform(action: Action): Promise<void> {
  if (!ready || busy) return;
  busy = true;
  state.error = null;
  state.pending = action;
  state.lastOperationAt = new Date().toISOString();
  notice = action === 'analyze' ? '正在处理本次显式 AI 分析请求，请稍候；是否被本地服务接受以本次证据为准。' : action === 'link_check' ? '正在检查当前岗位链接状态…' : action === 'save' ? '正在重新读取并保存当前岗位…' : '正在读取当前页的岗位信息…';
  render();
  try {
    // Persist the uncertainty before issuing a request; reopening never replays it.
    await persist();
    const tab = await getActiveTab();
    const revision = pageRevision;
    activeTab = tab;
    if (!tab || tab.id === undefined || !classification(tab).supported) { fail('page'); return; }
    if (action === 'analyze') {
      const canonical = analysisUrl(tab);
      if (!canonical) { fail('canonical'); return; }
      // The existing client owns payload/session/deadline/zero-retry semantics.
      const result = await requestStructuredLlmAnalysisFromLocalService({ jobUrl: canonical });
      if (result.ok) {
        state.analysis = { jobUrl: canonical, id: result.id, at: new Date().toISOString() };
        state.lastJobUrl = canonical;
        notice = 'AI 分析已完成并保存到本地。';
        connection(true);
      } else {
        if (result.code === 'unavailable') connection(false);
        fail(result.code === 'job_not_found' || result.code === 'analysis_unavailable' || result.code === 'analysis_not_configured' ? result.code : 'analysis');
      }
      return;
    }

    if (action === 'link_check') {
      if (!analysisUrl(tab)) { fail('link_check'); return; }
      const request = await requestJobLinkCheck(tab, async (tabId, canonical) => {
        const [before] = await browser.scripting.executeScript({
          target: { tabId }, func: runJobLinkStatusProbe, args: [canonical],
        });
        if (!before?.result) return undefined;
        if (before.result.challenge || !before.result.pageMatches) {
          return { before: before.result, after: before.result, extraction: undefined, documentStable: true };
        }
        const [extracted] = await browser.scripting.executeScript({
          target: { tabId }, func: runVerifiedBossStructuredExtraction,
          args: [{ cardProfile: verifiedBossJobCardSelectorProfile, detailProfile: verifiedBossJobDetailSelectorProfile }],
        });
        const [after] = await browser.scripting.executeScript({
          target: { tabId }, func: runJobLinkStatusProbe, args: [canonical],
        });
        if (!after?.result) return undefined;
        return {
          before: before.result, after: after.result, extraction: extracted?.result,
          documentStable: typeof before.documentId === 'string'
            && before.documentId === extracted?.documentId && before.documentId === after.documentId,
        };
      });
      if (!request) { fail('link_check'); return; }
      if (!await isStillCurrent(tab, revision)) { fail('changed'); return; }
      const result = await saveJobLinkCheckToLocalService(request);
      if (result.ok) {
        state.linkCheck = { jobUrl: request.jobUrl, status: request.status, at: request.observedAt };
        state.lastJobUrl = request.jobUrl;
        notice = linkCheckMessages[request.status];
        connection(true);
      } else {
        notice = result.message;
      }
      return;
    }

    const outcome = await requestStructuredPageExtraction(tab, async (tabId) => {
      const [injection] = await browser.scripting.executeScript({
        target: { tabId }, func: runVerifiedBossStructuredExtraction,
        args: [{ cardProfile: verifiedBossJobCardSelectorProfile, detailProfile: verifiedBossJobDetailSelectorProfile }],
      });
      return injection?.result;
    });
    if (!outcome.ok) { fail(outcome.code === 'scripting_failed' ? 'permission' : outcome.code === 'page_navigated' ? 'changed' : 'empty'); return; }
    if (!await isStillCurrent(tab, revision)) { fail('changed'); return; }
    const jobs = summarizeExtraction(outcome.result);
    if (!jobs.length) { fail('empty'); return; }
    state.jobs = jobs;
    state.lastJobUrl = jobs[0]?.jobUrl ?? null;
    state.parsedAt = new Date().toISOString();
    state.parsedCount = outcome.result.pageType === 'job_detail' ? 1 : outcome.result.cards.length;
    state.pageType = outcome.result.pageType === 'job_detail' ? 'job_detail' : 'search_results';
    state.viewingPrevious = false;
    syncedTabId = tab.id;
    syncedPageUrl = classification(tab).pageUrl;
    renderSnapshot(state);
    notice = '岗位信息已更新，未知字段已明确标注。';
    await persist();

    if (action === 'save') {
      if (!await isStillCurrent(tab, revision)) { fail('changed'); return; }
      const request = buildImportRequest(outcome.result, crypto.randomUUID());
      if (!request || !request.observations.length) { fail('empty'); return; }
      // Full extraction exists only in this action scope and the existing local
      // import transport. It is never passed to the UI snapshot/storage layer.
      const result = await saveImportRequestToLocalService(request);
      if (result.ok) {
        state.saved = { jobUrl: jobs[0]!.jobUrl, count: result.count, at: new Date().toISOString() };
        notice = `已保存 ${result.count} 条岗位记录到本地。`;
        if (outcome.result.warnings.includes('card_limit_reached')) notice += '已达到单页解析上限，仅保存已解析部分。';
        connection(true);
      } else {
        if (result.code === 'unavailable') connection(false);
        fail(result.code === 'unavailable' ? 'service' : 'save');
      }
    }
  } catch {
    fail(action === 'analyze' ? 'analysis' : action === 'link_check' ? 'link_check' : action === 'save' ? 'save' : 'permission');
  } finally {
    state.pending = null;
    state.lastOperationAt = new Date().toISOString();
    // Always classify a fresh tab before reenabling controls. Never clear results.
    await refreshTab();
    renderSnapshot(state);
    await persist();
    busy = false;
    render();
  }
}

for (const button of document.querySelectorAll<HTMLButtonElement>('[data-action]')) {
  button.addEventListener('click', () => {
    if (button.disabled) return;
    const action = button.dataset.action;
    if (action === 'refresh' || action === 'parse' || action === 'save' || action === 'link_check' || action === 'analyze') void perform(action);
  });
}

// A read-only, explicit health check uses the existing public health endpoint.
// Opening/reopening/classifying tabs never requests a bridge session or AI call.
find<HTMLButtonElement>('[data-health]').addEventListener('click', () => {
  const button = find<HTMLButtonElement>('[data-health]');
  if (button.disabled) return;
  button.disabled = true;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5_000);
  find('[data-connection]').textContent = '本地服务 · 正在检查';
  void (async () => {
    try {
      const response = await fetch(`${LOCAL_SERVICE_BASE_URL}/health`, {
        signal: controller.signal, cache: 'no-store', credentials: 'omit', redirect: 'error',
      });
      const body: unknown = response.ok ? await response.json() : null;
      connection(response.ok && typeof body === 'object' && body !== null
        && 'status' in body && body.status === 'ok' && 'service' in body && body.service === 'boss-job-radar-local');
    } catch { connection(false); }
    finally { clearTimeout(timeout); button.disabled = false; }
  })();
});

void (async () => {
  try {
    state = await loadSnapshot();
    find('[data-storage-status]').textContent = '本地展示快照已恢复。';
  } catch {
    find('[data-storage-status]').textContent = '无法读取本地快照，当前可继续操作。';
  }
  try { windowId = (await browser.windows.getCurrent()).id; } catch { windowId = undefined; }
  browser.tabs.onActivated.addListener((info) => { if (info.windowId === windowId) pageChanged(); });
  browser.tabs.onUpdated.addListener((id, change, tab) => {
    if (tab.windowId === windowId && tab.active && (change.status === 'loading' || change.status === 'complete' || change.url !== undefined || id !== activeTab?.id)) pageChanged();
  });
  browser.tabs.onRemoved.addListener((id) => { if (id === activeTab?.id) pageChanged(); });
  // Record only the canonical identity from metadata, never a raw tab URL.
  await refreshTab();
  const canonical = jobUrl(activeTab?.url);
  if (!state.lastJobUrl && canonical) state.lastJobUrl = canonical;
  ready = true;
  renderSnapshot(state);
  render();
  await persist();
})();
