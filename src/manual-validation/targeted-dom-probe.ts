import type {
  TargetedDomProbeLinkSummary,
  TargetedDomProbeNodeSummary,
  TargetedDomProbePageType,
  TargetedDomProbeResult,
  TargetedDomProbeSample,
  TargetedDomProbeTarget,
  TargetedDomProbeWarning,
} from './targeted-dom-probe-types';

/**
 * This function is passed directly to the MV3 scripting API. Keep every runtime
 * dependency inside the function body because injected functions cannot retain
 * module closures.
 */
export function runTargetedDomProbe(): TargetedDomProbeResult {
  const searchCardSelector = 'li.job-card-box';
  const searchSampleLimit = 3;
  const searchNodeLimit = 60;
  const searchDepthLimit = 5;
  const searchDirectTextLimit = 80;
  const detailDirectTextLimit = 100;
  const detailRootTextLimit = 300;
  const attributeTextLimit = 200;
  const excludedTextTags = new Set(['INPUT', 'TEXTAREA', 'SELECT', 'OPTION']);
  const detailTargets = [
    { selector: '.info-primary', nodeLimit: 80, depthLimit: 6 },
    { selector: '.job-tags', nodeLimit: 50, depthLimit: 5 },
    { selector: '.job-box', nodeLimit: 160, depthLimit: 8 },
    { selector: '.job-sider', nodeLimit: 80, depthLimit: 6 },
  ];

  function normalizeText(value: string | null | undefined): string {
    return value?.replace(/\s+/g, ' ').trim() ?? '';
  }

  function limitedAttribute(value: string | null): string | null {
    const normalized = normalizeText(value);
    return normalized === '' ? null : normalized.slice(0, attributeTextLimit);
  }

  function safePageIdentity(location: Location): string {
    return `${location.protocol}//${location.hostname}${location.pathname}`;
  }

  function isBossHostname(hostname: string): boolean {
    const normalized = hostname.toLowerCase();
    return normalized === 'zhipin.com' || normalized.endsWith('.zhipin.com');
  }

  function classifyPage(location: Location): TargetedDomProbePageType {
    if (
      (location.protocol !== 'http:' && location.protocol !== 'https:') ||
      !isBossHostname(location.hostname)
    ) {
      return 'unsupported';
    }
    if (location.pathname === '/web/geek/jobs') {
      return 'search_results';
    }
    if (
      location.pathname.startsWith('/job_detail/') &&
      location.pathname.endsWith('.html')
    ) {
      return 'job_detail';
    }
    return 'unsupported';
  }

  function isHidden(element: Element): boolean {
    let current: Element | null = element;
    while (current !== null) {
      if (current.hasAttribute('hidden')) {
        return true;
      }
      const style = window.getComputedStyle(current);
      if (
        style.display === 'none' ||
        style.visibility === 'hidden' ||
        style.visibility === 'collapse'
      ) {
        return true;
      }
      current = current.parentElement;
    }
    return false;
  }

  function directText(element: Element): string {
    if (excludedTextTags.has(element.tagName)) {
      return '';
    }
    const text = Array.from(element.childNodes)
      .filter((node) => node.nodeType === 3)
      .map((node) => node.textContent ?? '')
      .join(' ');
    return normalizeText(text);
  }

  function rootText(root: Element): string {
    const chunks: string[] = [];
    const walker = document.createTreeWalker(root, 4);
    let node = walker.nextNode();
    while (node !== null) {
      const parent = node.parentElement;
      if (
        parent !== null &&
        !excludedTextTags.has(parent.tagName) &&
        !isHidden(parent)
      ) {
        chunks.push(node.textContent ?? '');
        const preview = normalizeText(chunks.join(' '));
        if (preview.length >= detailRootTextLimit) {
          return preview.slice(0, detailRootTextLimit);
        }
      }
      node = walker.nextNode();
    }
    return normalizeText(chunks.join(' ')).slice(0, detailRootTextLimit);
  }

  function summarizeLink(element: Element): TargetedDomProbeLinkSummary | null {
    if (element.tagName !== 'A') {
      return null;
    }
    const rawHref = element.getAttribute('href');
    if (!rawHref) {
      return null;
    }
    try {
      const parsed = new URL(rawHref, document.location.href);
      if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
        return null;
      }
      return { hostname: parsed.hostname, pathname: parsed.pathname };
    } catch {
      return null;
    }
  }

  function containsPrivateUseCharacters(value: string): boolean {
    return /[\uE000-\uF8FF\u{F0000}-\u{FFFFD}\u{100000}-\u{10FFFD}]/u.test(
      value,
    );
  }

  function summarizeNode(
    element: Element,
    depth: number,
    textLimit: number,
  ): TargetedDomProbeNodeSummary {
    const fullDirectText = directText(element);
    const textPreview = fullDirectText.slice(0, textLimit);
    return {
      depth,
      tagName: element.tagName,
      className:
        typeof element.className === 'string'
          ? limitedAttribute(element.className)
          : null,
      role: limitedAttribute(element.getAttribute('role')),
      ariaLabel: limitedAttribute(element.getAttribute('aria-label')),
      titleAttribute: limitedAttribute(element.getAttribute('title')),
      directTextPreview: textPreview,
      childElementCount: element.children.length,
      link: summarizeLink(element),
      containsPrivateUseCharacters:
        containsPrivateUseCharacters(fullDirectText),
    };
  }

  function summarizeRoot(
    root: Element,
    nodeLimit: number,
    depthLimit: number,
    textLimit: number,
    includeRootText: boolean,
  ): TargetedDomProbeSample {
    const nodes: TargetedDomProbeNodeSummary[] = [];
    let truncated = false;
    let halted = false;

    function visit(element: Element, depth: number): void {
      if (halted || isHidden(element)) {
        return;
      }
      if (nodes.length >= nodeLimit) {
        truncated = true;
        halted = true;
        return;
      }
      nodes.push(summarizeNode(element, depth, textLimit));

      const visibleChildren = Array.from(element.children).filter(
        (child) => !isHidden(child),
      );
      if (depth >= depthLimit) {
        if (visibleChildren.length > 0) {
          truncated = true;
        }
        return;
      }
      for (const child of visibleChildren) {
        visit(child, depth + 1);
        if (halted) {
          break;
        }
      }
    }

    visit(root, 0);
    return {
      nodes,
      truncated,
      ...(includeRootText ? { rootTextPreview: rootText(root) } : {}),
    };
  }

  function makeTarget(
    selector: string,
    roots: Element[],
    sampleLimit: number,
    nodeLimit: number,
    depthLimit: number,
    textLimit: number,
    includeRootText: boolean,
  ): TargetedDomProbeTarget {
    return {
      selectorLabel: selector,
      matchedCount: roots.length,
      samples: roots
        .filter((root) => !isHidden(root))
        .slice(0, sampleLimit)
        .map((root) =>
          summarizeRoot(
            root,
            nodeLimit,
            depthLimit,
            textLimit,
            includeRootText,
          ),
        ),
    };
  }

  const pageType = classifyPage(document.location);
  const body = document.body;
  const warnings: TargetedDomProbeWarning[] = [];
  const targets: TargetedDomProbeTarget[] = [];
  let matchedCardCount: number | null =
    pageType === 'search_results' ? 0 : null;

  if (body === null) {
    warnings.push('body_missing');
  } else if (pageType === 'search_results') {
    const cards = Array.from(body.querySelectorAll(searchCardSelector));
    matchedCardCount = cards.length;
    targets.push(
      makeTarget(
        searchCardSelector,
        cards,
        searchSampleLimit,
        searchNodeLimit,
        searchDepthLimit,
        searchDirectTextLimit,
        false,
      ),
    );
    if (cards.length === 0) {
      warnings.push('no_job_cards');
    }
  } else if (pageType === 'job_detail') {
    for (const target of detailTargets) {
      const roots = Array.from(body.querySelectorAll(target.selector));
      targets.push(
        makeTarget(
          target.selector,
          roots,
          1,
          target.nodeLimit,
          target.depthLimit,
          detailDirectTextLimit,
          true,
        ),
      );
      if (roots.length === 0 && !warnings.includes('target_not_found')) {
        warnings.push('target_not_found');
      }
    }
  } else {
    warnings.push('unsupported_page');
  }

  return {
    pageUrl: safePageIdentity(document.location),
    pageType,
    timestamp: new Date().toISOString(),
    matchedCardCount,
    targets,
    warnings,
  };
}
