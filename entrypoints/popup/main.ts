import { browser } from 'wxt/browser';

import { saveImportRequestToLocalService } from '../../src/bridge/local-service-client';
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

if (elements === null) {
  throw new Error('Popup elements are missing.');
}

void initializePopup(elements, {
  version: browser.runtime.getManifest().version,
  getActiveTab: async () => {
    const [activeTab] = await browser.tabs.query({
      active: true,
      currentWindow: true,
    });
    return activeTab;
  },
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
    const [injectionResult] = await browser.scripting.executeScript({
      target: { tabId },
      func: runVerifiedBossStructuredExtraction,
      args: [
        {
          cardProfile: verifiedBossJobCardSelectorProfile,
          detailProfile: verifiedBossJobDetailSelectorProfile,
        },
      ],
    });
    return injectionResult?.result;
  },
  createClientImportId: () => crypto.randomUUID(),
  saveObservations: saveImportRequestToLocalService,
});
