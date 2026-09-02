import { classifyPageUrl, type PageKind } from '../../src/page-context';
import type { ManualDomProbeResult } from '../../src/manual-validation/dom-probe-types';
import {
  requestManualDomProbe,
  type ExecuteManualProbe,
  type ManualProbeTab,
} from '../../src/manual-validation/manual-probe-request';
import type { TargetedDomProbeResult } from '../../src/manual-validation/targeted-dom-probe-types';
import {
  classifyTargetedProbeUrl,
  requestTargetedDomProbe,
  type ExecuteTargetedProbe,
} from '../../src/manual-validation/targeted-probe-request';

export interface PopupElements {
  pageStatus: HTMLElement;
  version: HTMLElement;
  action: HTMLElement;
  button: HTMLButtonElement;
  probeStatus: HTMLElement;
  result: HTMLElement;
  output: HTMLElement;
  targetedAction: HTMLElement;
  targetedButton: HTMLButtonElement;
  targetedStatus: HTMLElement;
  targetedResult: HTMLElement;
  targetedOutput: HTMLElement;
}

export interface PopupDependencies {
  version: string;
  getActiveTab: () => Promise<ManualProbeTab | undefined>;
  executeProbe: ExecuteManualProbe;
  executeTargetedProbe: ExecuteTargetedProbe;
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
  const targetedAction = root.querySelector<HTMLElement>(
    '[data-targeted-probe-action]',
  );
  const targetedButton = root.querySelector<HTMLButtonElement>(
    '[data-targeted-probe-button]',
  );
  const targetedStatus = root.querySelector<HTMLElement>(
    '[data-targeted-probe-status]',
  );
  const targetedResult = root.querySelector<HTMLElement>(
    '[data-targeted-probe-result]',
  );
  const targetedOutput = root.querySelector<HTMLElement>(
    '[data-targeted-probe-output]',
  );

  return pageStatus &&
    version &&
    action &&
    button &&
    probeStatus &&
    result &&
    output &&
    targetedAction &&
    targetedButton &&
    targetedStatus &&
    targetedResult &&
    targetedOutput
    ? {
        pageStatus,
        version,
        action,
        button,
        probeStatus,
        result,
        output,
        targetedAction,
        targetedButton,
        targetedStatus,
        targetedResult,
        targetedOutput,
      }
    : null;
}

export async function initializePopup(
  elements: PopupElements,
  dependencies: PopupDependencies,
): Promise<void> {
  const {
    pageStatus,
    version,
    action,
    button,
    probeStatus,
    result,
    output,
    targetedAction,
    targetedButton,
    targetedStatus,
    targetedResult,
    targetedOutput,
  } = elements;
  version.textContent = dependencies.version;
  action.hidden = true;
  button.disabled = true;
  targetedAction.hidden = true;
  targetedButton.disabled = true;
  result.hidden = true;
  output.textContent = '';
  targetedResult.hidden = true;
  targetedOutput.textContent = '';
  let manualProbeInFlight = false;
  let targetedProbeInFlight = false;

  function applyPageState(tab: ManualProbeTab): void {
    const classification = classifyPageUrl(tab.url);
    const targetedClassification = classifyTargetedProbeUrl(tab.url);
    pageStatus.textContent = pageStatusLabels[classification.kind];
    pageStatus.dataset.kind = classification.kind;
    action.hidden = classification.kind !== 'boss';
    button.disabled =
      classification.kind !== 'boss' || manualProbeInFlight;
    targetedAction.hidden = !targetedClassification.supported;
    targetedButton.disabled =
      !targetedClassification.supported || targetedProbeInFlight;
  }

  button.addEventListener('click', () => {
    if (manualProbeInFlight) {
      return;
    }
    manualProbeInFlight = true;
    button.disabled = true;
    probeStatus.textContent = '正在读取当前页面的有限 DOM 结构摘要…';
    result.hidden = true;
    output.textContent = '';

    void (async () => {
      let currentTab: ManualProbeTab | undefined;
      try {
        currentTab = (await dependencies.getActiveTab()) ?? {};
        applyPageState(currentTab);
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
      } catch {
        probeStatus.textContent = '无法重新确认当前页面，请关闭扩展弹窗后重试。';
      } finally {
        manualProbeInFlight = false;
        if (currentTab === undefined) {
          button.disabled = false;
        } else {
          applyPageState(currentTab);
        }
      }
    })();
  });

  targetedButton.addEventListener('click', () => {
    if (targetedProbeInFlight) {
      return;
    }
    targetedProbeInFlight = true;
    targetedButton.disabled = true;
    targetedStatus.textContent = '正在读取已确认岗位区域的有限 DOM 结构摘要…';
    targetedResult.hidden = true;
    targetedOutput.textContent = '';

    void (async () => {
      let currentTab: ManualProbeTab | undefined;
      try {
        currentTab = (await dependencies.getActiveTab()) ?? {};
        applyPageState(currentTab);
        const outcome = await requestTargetedDomProbe(
          currentTab,
          dependencies.executeTargetedProbe,
        );

        if (outcome.ok) {
          targetedStatus.textContent = outcome.result.warnings.includes(
            'body_missing',
          )
            ? '深度结构验证已执行，但当前页面没有 document.body。'
            : outcome.result.warnings.includes('no_job_cards')
              ? '深度结构验证已执行，但没有发现已确认的岗位卡片。'
              : outcome.result.warnings.includes('target_not_found')
                ? '深度结构验证完成，部分已确认区域当前未找到。'
                : '深度结构验证完成。';
          targetedOutput.textContent = JSON.stringify(outcome.result, null, 2);
          targetedResult.hidden = false;
        } else {
          targetedStatus.textContent = outcome.message;
        }
      } catch {
        targetedStatus.textContent =
          '无法重新确认当前页面，请关闭扩展弹窗后重试。';
      } finally {
        targetedProbeInFlight = false;
        if (currentTab === undefined) {
          targetedButton.disabled = false;
        } else {
          applyPageState(currentTab);
        }
      }
    })();
  });

  try {
    const activeTab = (await dependencies.getActiveTab()) ?? {};
    applyPageState(activeTab);
  } catch {
    pageStatus.textContent = pageStatusLabels.unknown;
    pageStatus.dataset.kind = 'unknown';
  }
}

export type { ManualDomProbeResult };
export type { TargetedDomProbeResult };
