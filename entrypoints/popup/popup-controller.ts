import { classifyPageUrl, type PageKind } from '../../src/page-context';
import { mapStructuredExtractionToObservations } from '../../src/bridge/structured-extraction-to-observations';
import type { LocalServiceSaveResult } from '../../src/bridge/local-service-client';
import type { JobObservationInput } from '../../src/shared/job-observation-types';
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
import {
  classifyStructuredPageExtractionUrl,
  requestStructuredPageExtraction,
  type ExecuteStructuredPageExtraction,
} from '../../src/page-extraction/structured-page-extraction-request';
import type { StructuredPageExtractionResult } from '../../src/page-extraction/structured-page-extraction-types';

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
  structuredAction: HTMLElement;
  structuredButton: HTMLButtonElement;
  structuredStatus: HTMLElement;
  structuredResult: HTMLElement;
  structuredOutput: HTMLElement;
  saveAction: HTMLElement;
  saveButton: HTMLButtonElement;
  saveStatus: HTMLElement;
}

export interface PopupDependencies {
  version: string;
  getActiveTab: () => Promise<ManualProbeTab | undefined>;
  executeProbe: ExecuteManualProbe;
  executeTargetedProbe: ExecuteTargetedProbe;
  executeStructuredExtraction: ExecuteStructuredPageExtraction;
  saveObservations: (
    observations: readonly JobObservationInput[],
  ) => Promise<LocalServiceSaveResult>;
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
  const structuredAction = root.querySelector<HTMLElement>(
    '[data-structured-extraction-action]',
  );
  const structuredButton = root.querySelector<HTMLButtonElement>(
    '[data-structured-extraction-button]',
  );
  const structuredStatus = root.querySelector<HTMLElement>(
    '[data-structured-extraction-status]',
  );
  const structuredResult = root.querySelector<HTMLElement>(
    '[data-structured-extraction-result]',
  );
  const structuredOutput = root.querySelector<HTMLElement>(
    '[data-structured-extraction-output]',
  );
  const saveAction = root.querySelector<HTMLElement>(
    '[data-local-save-action]',
  );
  const saveButton = root.querySelector<HTMLButtonElement>(
    '[data-local-save-button]',
  );
  const saveStatus = root.querySelector<HTMLElement>(
    '[data-local-save-status]',
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
    targetedOutput &&
    structuredAction &&
    structuredButton &&
    structuredStatus &&
    structuredResult &&
    structuredOutput &&
    saveAction &&
    saveButton &&
    saveStatus
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
        structuredAction,
        structuredButton,
        structuredStatus,
        structuredResult,
        structuredOutput,
        saveAction,
        saveButton,
        saveStatus,
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
    structuredAction,
    structuredButton,
    structuredStatus,
    structuredResult,
    structuredOutput,
    saveAction,
    saveButton,
    saveStatus,
  } = elements;
  version.textContent = dependencies.version;
  action.hidden = true;
  button.disabled = true;
  targetedAction.hidden = true;
  targetedButton.disabled = true;
  structuredAction.hidden = true;
  structuredButton.disabled = true;
  result.hidden = true;
  output.textContent = '';
  targetedResult.hidden = true;
  targetedOutput.textContent = '';
  structuredResult.hidden = true;
  structuredOutput.textContent = '';
  saveAction.hidden = true;
  saveButton.disabled = true;
  saveStatus.textContent = '';
  let manualProbeInFlight = false;
  let targetedProbeInFlight = false;
  let structuredExtractionInFlight = false;
  let localSaveInFlight = false;

  function applyPageState(tab: ManualProbeTab): void {
    const classification = classifyPageUrl(tab.url);
    const targetedClassification = classifyTargetedProbeUrl(tab.url);
    const structuredClassification =
      classifyStructuredPageExtractionUrl(tab.url);
    pageStatus.textContent = pageStatusLabels[classification.kind];
    pageStatus.dataset.kind = classification.kind;
    action.hidden = classification.kind !== 'boss';
    button.disabled =
      classification.kind !== 'boss' || manualProbeInFlight;
    targetedAction.hidden = !targetedClassification.supported;
    targetedButton.disabled =
      !targetedClassification.supported || targetedProbeInFlight;
    structuredAction.hidden = !structuredClassification.supported;
    structuredButton.disabled =
      !structuredClassification.supported || structuredExtractionInFlight;
    saveAction.hidden = !structuredClassification.supported;
    saveButton.disabled =
      !structuredClassification.supported || localSaveInFlight;
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

  structuredButton.addEventListener('click', () => {
    if (structuredExtractionInFlight) {
      return;
    }
    structuredExtractionInFlight = true;
    structuredButton.disabled = true;
    structuredStatus.textContent = '正在解析当前页面已验证的岗位字段…';
    structuredResult.hidden = true;
    structuredOutput.textContent = '';

    void (async () => {
      let currentTab: ManualProbeTab | undefined;
      try {
        currentTab = (await dependencies.getActiveTab()) ?? {};
        applyPageState(currentTab);
        const outcome = await requestStructuredPageExtraction(
          currentTab,
          dependencies.executeStructuredExtraction,
        );

        if (outcome.ok) {
          structuredStatus.textContent = outcome.result.warnings.includes(
            'body_missing',
          )
            ? '结构化解析已执行，但当前页面没有 document.body。'
            : outcome.result.warnings.includes('no_job_cards')
              ? '结构化解析已执行，但当前页面没有发现岗位卡片。'
              : outcome.result.warnings.includes('card_limit_reached')
                ? '当前岗位数据解析完成；匹配超过 100 张卡片，仅解析前 100 张。'
                : '当前岗位数据解析完成。';
          structuredOutput.textContent = JSON.stringify(outcome.result, null, 2);
          structuredResult.hidden = false;
        } else {
          structuredStatus.textContent = outcome.message;
        }
      } catch {
        structuredStatus.textContent =
          '无法重新确认当前页面，请关闭扩展弹窗后重试。';
      } finally {
        structuredExtractionInFlight = false;
        if (currentTab === undefined) {
          structuredButton.disabled = false;
        } else {
          applyPageState(currentTab);
        }
      }
    })();
  });

  saveButton.addEventListener('click', () => {
    if (localSaveInFlight) {
      return;
    }
    localSaveInFlight = true;
    saveButton.disabled = true;
    saveStatus.textContent = '正在重新解析并保存当前岗位数据…';

    void (async () => {
      let currentTab: ManualProbeTab | undefined;
      try {
        currentTab = (await dependencies.getActiveTab()) ?? {};
        applyPageState(currentTab);
        const outcome = await requestStructuredPageExtraction(
          currentTab,
          dependencies.executeStructuredExtraction,
        );
        if (!outcome.ok) {
          saveStatus.textContent = outcome.message;
          return;
        }

        const observations = mapStructuredExtractionToObservations(
          outcome.result,
        );
        if (observations.length === 0) {
          saveStatus.textContent = '当前页面没有可保存的岗位数据。';
          return;
        }

        let saveResult: LocalServiceSaveResult;
        try {
          saveResult = await dependencies.saveObservations(observations);
        } catch {
          saveStatus.textContent = '本地服务未启动或无法连接。';
          return;
        }
        if (!saveResult.ok) {
          saveStatus.textContent = saveResult.message;
          return;
        }

        saveStatus.textContent = outcome.result.warnings.includes(
          'card_limit_reached',
        )
          ? `已保存 ${saveResult.count} 条岗位记录；当前页面匹配数量超过解析上限，仅保存已解析部分。`
          : `已保存 ${saveResult.count} 条岗位记录到本地。`;
      } catch {
        saveStatus.textContent =
          '无法重新确认当前页面，请关闭扩展弹窗后重试。';
      } finally {
        localSaveInFlight = false;
        if (currentTab === undefined) {
          saveButton.disabled = false;
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
export type { StructuredPageExtractionResult };
