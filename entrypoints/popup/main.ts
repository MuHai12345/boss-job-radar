import { browser } from 'wxt/browser';

import { classifyPageUrl, type PageKind } from '../../src/page-context';

const pageStatusElement = document.querySelector<HTMLElement>(
  '[data-page-status]',
);
const versionElement = document.querySelector<HTMLElement>(
  '[data-extension-version]',
);

if (!pageStatusElement || !versionElement) {
  throw new Error('Popup status elements are missing.');
}

const pageStatusLabels: Record<PageKind, string> = {
  boss: 'BOSS直聘页面',
  non_boss: '非BOSS直聘页面',
  unknown: '无法判断当前页面',
};

versionElement.textContent = browser.runtime.getManifest().version;

void browser.tabs
  .query({ active: true, currentWindow: true })
  .then(([activeTab]) => {
    const classification = classifyPageUrl(activeTab?.url);
    pageStatusElement.textContent = pageStatusLabels[classification.kind];
    pageStatusElement.dataset.kind = classification.kind;
  })
  .catch(() => {
    pageStatusElement.textContent = pageStatusLabels.unknown;
    pageStatusElement.dataset.kind = 'unknown';
  });
