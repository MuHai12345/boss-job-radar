import { browser } from 'wxt/browser';

import { saveImportRequestToLocalService, saveJobLinkCheckToLocalService } from '../../src/bridge/local-service-client';
import { initializeJobLinkCheck } from './job-link-check-controller';
import { runJobLinkStatusProbe } from '../../src/page-extraction/job-link-status-probe';
import { verifiedBossJobDetailSelectorProfile } from '../../src/adapters/boss/job-detail-selector-profile';
import { verifiedBossJobCardSelectorProfile } from '../../src/adapters/boss/selector-profile';
import { runManualDomProbe } from '../../src/manual-validation/dom-probe';
import type { ManualDomProbeResult } from '../../src/manual-validation/dom-probe-types';
import { runTargetedDomProbe } from '../../src/manual-validation/targeted-dom-probe';
import type { TargetedDomProbeResult } from '../../src/manual-validation/targeted-dom-probe-types';
import { runVerifiedBossStructuredExtraction } from '../../src/page-extraction/structured-page-extraction';
import type { StructuredPageExtractionResult } from '../../src/page-extraction/structured-page-extraction-types';
import { findPopupElements, initializePopup } from './popup-controller';

const elements = findPopupElements(document);

async function getActiveTab() {
  const [activeTab] = await browser.tabs.query({ active: true, currentWindow: true });
  return activeTab;
}

async function executeStructuredInjection(tabId: number) {
  const [injectionResult] = await browser.scripting.executeScript({
    target: { tabId },
    func: runVerifiedBossStructuredExtraction,
    args: [{
      cardProfile: verifiedBossJobCardSelectorProfile,
      detailProfile: verifiedBossJobDetailSelectorProfile,
    }],
  });
  return injectionResult;
}

if (elements === null) {
  throw new Error('Popup elements are missing.');
}

void initializePopup(elements, {
  version: browser.runtime.getManifest().version,
  getActiveTab,
  executeProbe: async (tabId): Promise<ManualDomProbeResult | undefined> => {
    const [injectionResult] = await browser.scripting.executeScript({
      target: { tabId },
      func: runManualDomProbe,
    });
    return injectionResult?.result;
  },
  executeTargetedProbe: async (
    tabId,
  ): Promise<TargetedDomProbeResult | undefined> => {
    const [injectionResult] = await browser.scripting.executeScript({
      target: { tabId },
      func: runTargetedDomProbe,
    });
    return injectionResult?.result;
  },
  executeStructuredExtraction: async (
    tabId,
  ): Promise<StructuredPageExtractionResult | undefined> => {
    const injectionResult = await executeStructuredInjection(tabId);
    return injectionResult?.result;
  },
  createClientImportId: () => crypto.randomUUID(),
  saveObservations: saveImportRequestToLocalService,
});

void initializeJobLinkCheck(document, {
  getActiveTab,
  saveCheck: saveJobLinkCheckToLocalService,
  executeInspection: async (tabId, jobUrl) => {
    const [before] = await browser.scripting.executeScript({
      target: { tabId }, func: runJobLinkStatusProbe, args: [jobUrl],
    });
    if (!before?.result) return undefined;
    if (before.result.challenge || !before.result.pageMatches) {
      return { before: before.result, after: before.result, extraction: undefined, documentStable: true };
    }
    const extracted = await executeStructuredInjection(tabId);
    const [after] = await browser.scripting.executeScript({
      target: { tabId }, func: runJobLinkStatusProbe, args: [jobUrl],
    });
    if (!after?.result) return undefined;
    return {
      before: before.result, after: after.result, extraction: extracted?.result,
      documentStable: typeof before.documentId === 'string'
        && before.documentId === extracted?.documentId && before.documentId === after.documentId,
    };
  },
});
