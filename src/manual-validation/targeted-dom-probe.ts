import type {
  TargetedDomProbeLinkSummary,
  TargetedDomProbeNodeSummary,
  TargetedDomProbePageType,
  TargetedDomProbeResult,
  TargetedDomProbeSample,
  TargetedDomProbeTarget,
  TargetedDomProbeWarning,
  TargetedTagDiagnostic,
  TargetedTagDiagnosticComputedStyle,
  TargetedTagDiagnosticElement,
  TargetedTagDiagnosticGeometry,
  TargetedTagDiagnosticSequenceEntry,
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
  const tagDiagnosticSelector = '.job-keyword-list > li';
  const tagDiagnosticSampleLimit = 3;
  const tagDiagnosticDepthLimit = 3;
  const tagDiagnosticSequenceLimit = 40;
  const tagDiagnosticTextLimit = 80;
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

  function safeRead<T>(reader: () => T): T | null {
    try {
      return reader();
    } catch {
      return null;
    }
  }

  function safeAttribute(element: Element, name: string): string | null {
    const value = safeRead(() => element.getAttribute(name));
    return limitedAttribute(value);
  }

  function safeStyleAttribute(element: Element): string | null {
    const value = safeRead(() => element.getAttribute('style'));
    if (value === null) {
      return null;
    }
    let redacted = '';
    let index = 0;
    while (index < value.length) {
      const match = /url\s*\(/i.exec(value.slice(index));
      if (match === null) {
        redacted += value.slice(index);
        break;
      }
      const start = index + match.index;
      let cursor = start + match[0].length;
      let nesting = 1;
      let quote: '"' | "'" | null = null;
      let escaped = false;
      redacted += `${value.slice(index, start)}url([redacted])`;
      while (cursor < value.length && nesting > 0) {
        const character = value[cursor];
        if (escaped) {
          escaped = false;
        } else if (character === '\\') {
          escaped = true;
        } else if (quote !== null) {
          if (character === quote) {
            quote = null;
          }
        } else if (character === '"' || character === "'") {
          quote = character;
        } else if (character === '(') {
          nesting += 1;
        } else if (character === ')') {
          nesting -= 1;
        }
        cursor += 1;
      }
      index = cursor;
    }
    return limitedAttribute(redacted);
  }

  function safeClassName(element: Element): string | null {
    const value = safeRead(() => element.className);
    return typeof value === 'string' ? limitedAttribute(value) : null;
  }

  function safeTextPreview(node: Node): string {
    return normalizeText(safeRead(() => node.textContent)).slice(
      0,
      tagDiagnosticTextLimit,
    );
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

  function tagComputedStyle(
    element: Element,
  ): TargetedTagDiagnosticComputedStyle {
    const style = safeRead(() => window.getComputedStyle(element));
    function property(name: keyof CSSStyleDeclaration): string | null {
      if (style === null) {
        return null;
      }
      const value = safeRead(() => style[name]);
      return typeof value === 'string' ? value : null;
    }
    return {
      display: property('display'),
      visibility: property('visibility'),
      opacity: property('opacity'),
      fontSize: property('fontSize'),
      lineHeight: property('lineHeight'),
      position: property('position'),
      left: property('left'),
      top: property('top'),
      width: property('width'),
      height: property('height'),
      maxWidth: property('maxWidth'),
      maxHeight: property('maxHeight'),
      overflow: property('overflow'),
      clip: property('clip'),
      clipPath: property('clipPath'),
      transform: property('transform'),
      textIndent: property('textIndent'),
    };
  }

  function tagGeometry(element: Element): TargetedTagDiagnosticGeometry {
    const boundingRect = safeRead(() => element.getBoundingClientRect());
    function finiteNumber(reader: () => number): number | null {
      const value = safeRead(reader);
      return value !== null && Number.isFinite(value) ? value : null;
    }
    return {
      boundingClientRect: {
        width:
          boundingRect === null
            ? null
            : finiteNumber(() => boundingRect.width),
        height:
          boundingRect === null
            ? null
            : finiteNumber(() => boundingRect.height),
      },
      getClientRectsLength: finiteNumber(
        () => element.getClientRects().length,
      ),
      offsetWidth: finiteNumber(() => (element as HTMLElement).offsetWidth),
      offsetHeight: finiteNumber(() => (element as HTMLElement).offsetHeight),
      offsetParentIsNull: safeRead(() => {
        if (!('offsetParent' in element)) {
          throw new Error('offsetParent is unavailable');
        }
        return (element as HTMLElement).offsetParent === null;
      }),
    };
  }

  function summarizeTagElement(
    element: Element,
    depth: number,
  ): TargetedTagDiagnosticElement {
    return {
      nodeType: 'element',
      depth,
      tagName: element.tagName,
      className: safeClassName(element),
      styleAttribute: safeStyleAttribute(element),
      hasHiddenAttribute: safeRead(() => element.hasAttribute('hidden')),
      ariaHidden: safeAttribute(element, 'aria-hidden'),
      textContentPreview: '',
      computedStyle: tagComputedStyle(element),
      geometry: tagGeometry(element),
    };
  }

  function summarizeTag(root: Element, index: number): TargetedTagDiagnostic {
    const sequence: TargetedTagDiagnosticSequenceEntry[] = [];
    const rootTextChunks: string[] = [];
    const directTextNodeSegments: string[] = [];
    const elementTextChunks = new Map<TargetedTagDiagnosticElement, string[]>();
    let truncated = false;

    function recordText(
      node: Node,
      depth: number,
      ancestors: TargetedTagDiagnosticElement[],
    ): boolean {
      const textPreview = safeTextPreview(node);
      if (textPreview === '') {
        return false;
      }
      if (sequence.length >= tagDiagnosticSequenceLimit) {
        truncated = true;
        return true;
      }
      sequence.push({ nodeType: 'text', depth, textPreview });
      rootTextChunks.push(textPreview);
      if (depth === 1) {
        directTextNodeSegments.push(textPreview);
      }
      for (const ancestor of ancestors) {
        elementTextChunks.get(ancestor)?.push(textPreview);
      }
      return false;
    }

    function visitChildren(
      element: Element,
      depth: number,
      ancestors: TargetedTagDiagnosticElement[],
    ): boolean {
      for (const node of Array.from(element.childNodes)) {
        if (node.nodeType === 3) {
          if (recordText(node, depth, ancestors)) {
            return true;
          }
          continue;
        }
        if (node.nodeType !== 1) {
          continue;
        }
        const child = node as Element;
        if (sequence.length >= tagDiagnosticSequenceLimit) {
          truncated = true;
          return true;
        }
        const summary = summarizeTagElement(child, depth);
        sequence.push(summary);
        elementTextChunks.set(summary, []);
        if (depth >= tagDiagnosticDepthLimit) {
          const childAncestors = [...ancestors, summary];
          for (const nestedNode of Array.from(child.childNodes)) {
            if (nestedNode.nodeType === 3) {
              if (recordText(nestedNode, depth, childAncestors)) {
                return true;
              }
            } else if (nestedNode.nodeType === 1) {
              truncated = true;
            }
          }
          continue;
        }
        if (visitChildren(child, depth + 1, [...ancestors, summary])) {
          return true;
        }
      }
      return false;
    }

    visitChildren(root, 1, []);
    for (const [element, chunks] of elementTextChunks) {
      element.textContentPreview = normalizeText(chunks.join('')).slice(
        0,
        tagDiagnosticTextLimit,
      );
    }

    return {
      index,
      tagName: root.tagName,
      className: safeClassName(root),
      directTextNodeSegments,
      normalizedDirectText: normalizeText(directTextNodeSegments.join(' ')).slice(
        0,
        tagDiagnosticTextLimit,
      ),
      textContentPreview: normalizeText(rootTextChunks.join('')).slice(
        0,
        tagDiagnosticTextLimit,
      ),
      childElementCount: safeRead(() => root.children.length) ?? 0,
      sequence,
      truncated,
    };
  }

  const pageType = classifyPage(document.location);
  const body = document.body;
  const warnings: TargetedDomProbeWarning[] = [];
  const targets: TargetedDomProbeTarget[] = [];
  const tagDiagnostics: TargetedTagDiagnostic[] = [];
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
    const tagRoots = Array.from(body.querySelectorAll(tagDiagnosticSelector));
    tagDiagnostics.push(
      ...tagRoots
        .slice(0, tagDiagnosticSampleLimit)
        .map((root, index) => summarizeTag(root, index)),
    );
  } else {
    warnings.push('unsupported_page');
  }

  return {
    pageUrl: safePageIdentity(document.location),
    pageType,
    timestamp: new Date().toISOString(),
    matchedCardCount,
    targets,
    tagDiagnostics,
    warnings,
  };
}
