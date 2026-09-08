import type { LocalServiceStructuredLlmAnalysisResult } from '../../src/bridge/local-service-client';
import { canonicalCheckableJobUrl } from '../../src/shared/job-link-check-types';
import type { StructuredLlmAnalysisRequest } from '../../src/shared/structured-llm-analysis-request';

interface AnalysisTab {
  readonly url?: string;
}

export async function initializeStructuredLlmAnalysis(root: ParentNode, dependencies: {
  getActiveTab: () => Promise<AnalysisTab | undefined>;
  analyze: (request: StructuredLlmAnalysisRequest) => Promise<LocalServiceStructuredLlmAnalysisResult>;
}): Promise<void> {
  const action = root.querySelector<HTMLElement>('[data-structured-llm-analysis-action]');
  const button = root.querySelector<HTMLButtonElement>('[data-structured-llm-analysis-button]');
  const status = root.querySelector<HTMLElement>('[data-structured-llm-analysis-status]');
  if (!action || !button || !status) return;

  let inFlight = false;
  const unsupportedMessage = '当前页面无法发起 AI 分析。';
  const applyTab = (tab: AnalysisTab | undefined): void => {
    const canonical = canonicalCheckableJobUrl(tab?.url);
    const supported = canonical !== null && canonical === tab?.url;
    action.hidden = !supported;
    button.disabled = !supported || inFlight;
  };
  applyTab(undefined);
  status.textContent = '';

  button.addEventListener('click', () => {
    if (inFlight || button.disabled) return;
    inFlight = true;
    button.disabled = true;
    status.textContent = '正在分析当前岗位，请稍候…';

    void (async () => {
      try {
        let tab: AnalysisTab | undefined;
        try {
          tab = await dependencies.getActiveTab();
        } catch {
          applyTab(undefined);
          status.textContent = unsupportedMessage;
          return;
        }
        applyTab(tab);
        const jobUrl = canonicalCheckableJobUrl(tab?.url);
        if (jobUrl === null || jobUrl !== tab?.url) {
          status.textContent = unsupportedMessage;
          return;
        }

        try {
          const result = await dependencies.analyze({ jobUrl });
          status.textContent = result.ok
            ? 'AI 分析已完成并保存到本地。'
            : result.message;
        } catch {
          status.textContent = 'AI 分析请求失败。';
        }
      } finally {
        inFlight = false;
        // Keep disabled until a fresh tab query decides whether to enable it.
        try {
          applyTab(await dependencies.getActiveTab());
        } catch {
          applyTab(undefined);
        }
      }
    })();
  });

  // Opening the popup only classifies metadata; analysis requires a click.
  try {
    applyTab(await dependencies.getActiveTab());
  } catch {
    applyTab(undefined);
  }
}
