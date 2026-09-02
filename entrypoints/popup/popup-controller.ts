import { classifyPageUrl, type PageKind } from '../../src/page-context';
import type { ManualDomProbeResult } from '../../src/manual-validation/dom-probe-types';
import {
  requestManualDomProbe,
  type ExecuteManualProbe,
  type ManualProbeTab,
} from '../../src/manual-validation/manual-probe-request';

export interface PopupElements {
  pageStatus: HTMLElement;
  version: HTMLElement;
  action: HTMLElement;
  button: HTMLButtonElement;
  probeStatus: HTMLElement;
  result: HTMLElement;
  output: HTMLElement;
}

export interface PopupDependencies {
  version: string;
  getActiveTab: () => Promise<ManualProbeTab | undefined>;
  executeProbe: ExecuteManualProbe;
}

const pageStatusLabels: Record<PageKind, string> = {
  boss: 'BOSS直聘页面',
  non_boss: '非BOSS直聘页面',
  unknown: '无法判断当前页面',
};

export function findPopupElements(root: ParentNode): PopupElements | null {
  const pageStatus = root.querySelector<HTMLElement>('[data-page-status]');
  const version = root.querySelector<HTMLElement>('[data-extension-version]');
  const action = root.querySelector<HTMLElement>('[data-manual-probe-action]');
  const button = root.querySelector<HTMLButtonElement>('[data-manual-probe-button]');
  const probeStatus = root.querySelector<HTMLElement>('[data-probe-status]');
  const result = root.querySelector<HTMLElement>('[data-probe-result]');
  const output = root.querySelector<HTMLElement>('[data-probe-output]');

  return pageStatus &&
    version &&
    action &&
    button &&
    probeStatus &&
    result &&
    output
    ? { pageStatus, version, action, button, probeStatus, result, output }
    : null;
}

export async function initializePopup(
  elements: PopupElements,
  dependencies: PopupDependencies,
): Promise<void> {
  const { pageStatus, version, action, button, probeStatus, result, output } =
    elements;
  version.textContent = dependencies.version;
  action.hidden = true;
  button.disabled = true;
  result.hidden = true;
  output.textContent = '';

  button.addEventListener('click', () => {
    button.disabled = true;
    probeStatus.textContent = '正在读取当前页面的有限 DOM 结构摘要…';
    result.hidden = true;
    output.textContent = '';

    void (async () => {
      try {
        const currentTab = (await dependencies.getActiveTab()) ?? {};
        const currentClassification = classifyPageUrl(currentTab.url);
        pageStatus.textContent = pageStatusLabels[currentClassification.kind];
        pageStatus.dataset.kind = currentClassification.kind;
        const outcome = await requestManualDomProbe(
          currentTab,
          dependencies.executeProbe,
        );

        if (outcome.ok) {
          probeStatus.textContent = outcome.result.warnings.includes(
            'body_missing',
          )
            ? '人工验证已执行，但当前页面没有 document.body。'
            : outcome.result.warnings.includes('no_candidates')
              ? '人工验证已执行，但当前可见页面中没有发现候选结构。'
              : '人工验证完成。';
          output.textContent = JSON.stringify(outcome.result, null, 2);
          result.hidden = false;
        } else {
          probeStatus.textContent = outcome.message;
        }
        button.disabled = currentClassification.kind !== 'boss';
      } catch {
        probeStatus.textContent = '无法重新确认当前页面，请关闭扩展弹窗后重试。';
        button.disabled = false;
      }
    })();
  });

  try {
    const activeTab = (await dependencies.getActiveTab()) ?? {};
    const classification = classifyPageUrl(activeTab.url);
    pageStatus.textContent = pageStatusLabels[classification.kind];
    pageStatus.dataset.kind = classification.kind;

    if (classification.kind === 'boss') {
      action.hidden = false;
      button.disabled = false;
    }
  } catch {
    pageStatus.textContent = pageStatusLabels.unknown;
    pageStatus.dataset.kind = 'unknown';
  }
}

export type { ManualDomProbeResult };
