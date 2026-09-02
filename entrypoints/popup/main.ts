import { browser } from 'wxt/browser';

import { runManualDomProbe } from '../../src/manual-validation/dom-probe';
import type { ManualDomProbeResult } from '../../src/manual-validation/dom-probe-types';
import { runTargetedDomProbe } from '../../src/manual-validation/targeted-dom-probe';
import type { TargetedDomProbeResult } from '../../src/manual-validation/targeted-dom-probe-types';
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
});
