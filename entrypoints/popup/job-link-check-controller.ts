import { canonicalCheckableJobUrl, type JobLinkCheckRequest } from '../../src/shared/job-link-check-types';
import { requestJobLinkCheck, type ExecuteManualLinkInspection } from '../../src/page-extraction/job-link-check-request';
import type { StructuredPageExtractionTab } from '../../src/page-extraction/structured-page-extraction-request';
import type { LocalServiceLinkCheckResult } from '../../src/bridge/local-service-client';

export async function initializeJobLinkCheck(root: ParentNode, dependencies: {
  getActiveTab: () => Promise<StructuredPageExtractionTab | undefined>;
  executeInspection: ExecuteManualLinkInspection;
  saveCheck: (request: JobLinkCheckRequest) => Promise<LocalServiceLinkCheckResult>;
}): Promise<void> {
  const action = root.querySelector<HTMLElement>('[data-job-link-check-action]');
  const button = root.querySelector<HTMLButtonElement>('[data-job-link-check-button]');
  const status = root.querySelector<HTMLElement>('[data-job-link-check-status]');
  if (!action || !button || !status) return;
  let inFlight = false;
  const unknownMessage = '当前页面无法可靠判断岗位链接状态。';
  function applyTab(tab: StructuredPageExtractionTab | undefined): void {
    const supported = canonicalCheckableJobUrl(tab?.url) !== null;
    action!.hidden = !supported;
    button!.disabled = !supported || inFlight;
  }
  button.addEventListener('click', () => {
    if (inFlight) return;
    inFlight = true;
    button.disabled = true;
    status.textContent = '正在检查当前岗位链接状态…';
    void (async () => {
      let tab: StructuredPageExtractionTab | undefined;
      try {
        tab = await dependencies.getActiveTab();
        applyTab(tab);
        const request = await requestJobLinkCheck(tab ?? {}, dependencies.executeInspection);
        if (request === null) { status.textContent = unknownMessage; return; }
        let saved: LocalServiceLinkCheckResult;
        try { saved = await dependencies.saveCheck(request); } catch {
          status.textContent = '本地服务未启动或无法连接。';
          return;
        }
        status.textContent = !saved.ok ? saved.message
          : request.status === 'available' ? '当前岗位链接可正常打开。'
            : request.status === 'explicitly_unavailable' ? '当前页面明确显示该岗位已失效。'
              : unknownMessage;
      } catch {
        status.textContent = unknownMessage;
      } finally {
        inFlight = false;
        if (tab === undefined) button.disabled = false;
        else applyTab(tab);
      }
    })();
  });
  // Initialization only classifies the tab URL; no DOM probe, extraction or network.
  try { applyTab(await dependencies.getActiveTab()); } catch { applyTab(undefined); }
}
