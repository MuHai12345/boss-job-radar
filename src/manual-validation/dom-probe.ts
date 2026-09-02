import type {
  ManualDomProbeCandidate,
  ManualDomProbeLinkSummary,
  ManualDomProbeResult,
  ManualDomProbeWarning,
} from './dom-probe-types';

/**
 * This function is passed directly to the MV3 scripting API. Keep every runtime
 * dependency inside the function body because injected functions cannot retain
 * module closures.
 */
export function runManualDomProbe(): ManualDomProbeResult {
  const candidateLimit = 20;
  const textPreviewLimit = 120;
  const attributeTextLimit = 200;
  const semanticCandidateTags = new Set(['MAIN', 'ARTICLE', 'SECTION']);
  const excludedTextTags = new Set([
    'INPUT',
    'TEXTAREA',
    'SELECT',
    'OPTION',
  ]);
  const body = document.body;

  function normalizeText(value: string | null | undefined): string {
    return value?.replace(/\s+/g, ' ').trim() ?? '';
  }

  function limitedAttribute(value: string | null): string | null {
    const normalized = normalizeText(value);
    return normalized === '' ? null : normalized.slice(0, attributeTextLimit);
  }

  function isElementVisible(element: Element): boolean {
    let current: Element | null = element;
    while (current !== null) {
      if (current.hasAttribute('hidden')) {
        return false;
      }

      const style = window.getComputedStyle(current);
      if (
        style.display === 'none' ||
        style.visibility === 'hidden' ||
        style.visibility === 'collapse' ||
        Number.parseFloat(style.opacity) === 0
      ) {
        return false;
      }
      current = current.parentElement;
    }

    const rect = element.getBoundingClientRect();
    return (
      (rect.width > 0 || rect.height > 0) &&
      rect.bottom > 0 &&
      rect.right > 0 &&
      rect.top < window.innerHeight &&
      rect.left < window.innerWidth
    );
  }

  function hasExcludedTextAncestor(node: Node, boundary: Element): boolean {
    let current = node.parentElement;
    while (current !== null) {
      if (excludedTextTags.has(current.tagName)) {
        return true;
      }
      if (current === boundary) {
        return false;
      }
      current = current.parentElement;
    }
    return false;
  }

  function readVisibleText(element: Element): string {
    const chunks: string[] = [];
    const walker = document.createTreeWalker(element, 4);
    let node = walker.nextNode();

    while (node !== null) {
      const parent = node.parentElement;
      if (
        parent !== null &&
        !hasExcludedTextAncestor(node, element) &&
        isElementVisible(parent)
      ) {
        chunks.push(node.textContent ?? '');
      }
      node = walker.nextNode();
    }

    return normalizeText(chunks.join(' '));
  }

  function hasRepeatedChildStructure(element: Element): boolean {
    const counts = new Map<string, number>();
    for (const child of element.children) {
      if (!isElementVisible(child)) {
        continue;
      }
      const count = (counts.get(child.tagName) ?? 0) + 1;
      if (count >= 2) {
        return true;
      }
      counts.set(child.tagName, count);
    }
    return false;
  }

  function isCandidateElement(element: Element): boolean {
    if (semanticCandidateTags.has(element.tagName)) {
      return true;
    }
    if (element.getAttribute('role')?.toLowerCase() === 'main') {
      return true;
    }

    const hasHeading = Array.from(
      element.querySelectorAll('h1, h2, h3, h4, h5, h6'),
    ).some(isElementVisible);
    const hasLink = Array.from(element.querySelectorAll('a[href]')).some(
      isElementVisible,
    );
    return (hasHeading && hasLink) || hasRepeatedChildStructure(element);
  }

  function summarizeLink(element: Element): ManualDomProbeLinkSummary | null {
    const links =
      element.tagName === 'A' && element.hasAttribute('href')
        ? [element]
        : Array.from(element.querySelectorAll('a[href]'));
    const link = links.find(isElementVisible);
    const rawHref = link?.getAttribute('href');
    if (!rawHref) {
      return null;
    }

    try {
      const parsedUrl = new URL(rawHref, document.location.href);
      if (parsedUrl.protocol !== 'http:' && parsedUrl.protocol !== 'https:') {
        return null;
      }
      return {
        hostname: parsedUrl.hostname,
        pathname: parsedUrl.pathname,
      };
    } catch {
      return null;
    }
  }

  function summarizeCandidate(element: Element): ManualDomProbeCandidate {
    return {
      tagName: element.tagName,
      className:
        typeof element.className === 'string'
          ? limitedAttribute(element.className)
          : null,
      role: limitedAttribute(element.getAttribute('role')),
      ariaLabel: limitedAttribute(element.getAttribute('aria-label')),
      textPreview: readVisibleText(element).slice(0, textPreviewLimit),
      childElementCount: element.children.length,
      link: summarizeLink(element),
    };
  }

  const warnings: ManualDomProbeWarning[] = [];
  const candidates: ManualDomProbeCandidate[] = [];

  if (body !== null) {
    for (const element of body.querySelectorAll('*')) {
      if (
        candidates.length < candidateLimit &&
        isCandidateElement(element) &&
        isElementVisible(element)
      ) {
        candidates.push(summarizeCandidate(element));
      }
    }
  }

  if (body === null) {
    warnings.push('body_missing');
  } else if (candidates.length === 0) {
    warnings.push('no_candidates');
  }

  const visibleCount = (selector: string): number =>
    body === null
      ? 0
      : Array.from(body.querySelectorAll(selector)).filter(isElementVisible)
          .length;

  return {
    pageUrl: document.location.href,
    pageTitle: document.title,
    timestamp: new Date().toISOString(),
    candidateSummary: {
      bodyExists: body !== null,
      visibleMainCount: visibleCount('main, [role="main"]'),
      visibleArticleCount: visibleCount('article'),
      visibleSectionCount: visibleCount('section'),
      linkCount: body?.querySelectorAll('a[href]').length ?? 0,
      headingCount: body?.querySelectorAll('h1, h2, h3, h4, h5, h6').length ?? 0,
      visibleTextLength: body === null ? 0 : readVisibleText(body).length,
      documentLanguage: limitedAttribute(document.documentElement?.lang ?? null),
      pathname: document.location.pathname,
      candidates,
    },
    warnings,
  };
}
