import type { LinkMarkerCode } from '../shared/job-link-check-types';

export interface JobLinkStatusProbe {
  readonly pageMatches: boolean;
  readonly challenge: boolean;
  readonly markerCode: LinkMarkerCode | null;
  readonly observedAt: string;
}

/** Self-contained injected function. No page text or HTML leaves this call. */
export function runJobLinkStatusProbe(expectedJobUrl: string): JobLinkStatusProbe {
  const observedAt = new Date().toISOString();
  const url = new URL(document.location.href);
  url.search = '';
  url.hash = '';
  const pageMatches = url.href === expectedJobUrl;
  const unknown = { pageMatches, challenge: true, markerCode: null, observedAt } as const;
  if (!pageMatches || document.body === null) return unknown;

  const markers: Record<string, LinkMarkerCode> = {
    '职位已下线': 'job_offline', '该职位已下线': 'job_offline',
    '职位已关闭': 'job_closed', '该职位已关闭': 'job_closed',
    '职位已过期': 'job_expired', '该职位已过期': 'job_expired',
    '职位不存在': 'job_missing', '该职位不存在': 'job_missing',
    '职位已删除': 'job_deleted', '该职位已删除': 'job_deleted',
    '招聘已结束': 'recruitment_ended',
  };
  const excluded = new Set(['SCRIPT', 'STYLE', 'NOSCRIPT', 'TEMPLATE']);

  function visible(element: Element): boolean {
    for (let ancestor: Element | null = element; ancestor; ancestor = ancestor.parentElement) {
      if (excluded.has(ancestor.tagName) || ancestor.hasAttribute('hidden')
        || ancestor.getAttribute('aria-hidden') === 'true') return false;
      const style = getComputedStyle(ancestor);
      if (style.display === 'none' || style.visibility === 'hidden' || style.visibility === 'collapse'
        || style.opacity === '0' || style.contentVisibility === 'hidden') return false;
    }
    return Array.from(element.getClientRects()).some((rect) => rect.width > 0 && rect.height > 0);
  }

  // Only bounded, short visible snippets are inspected locally, including text
  // split over inline descendants. Long content cannot become an outage marker.
  function shortVisibleText(element: Element): string | null {
    let value = '';
    let visited = 0;
    function append(node: Node): boolean {
      visited += 1;
      if (visited > 80) return false;
      if (node.nodeType === Node.TEXT_NODE) {
        const text = node.textContent ?? '';
        if (value.length + text.length > 160) return false;
        value += text;
      } else if (node.nodeType === Node.ELEMENT_NODE) {
        if (!visible(node as Element)) return true;
        for (const child of node.childNodes) if (!append(child)) return false;
      }
      return true;
    }
    return append(element) ? value.replace(/\s+/gu, '').trim() : null;
  }

  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_ELEMENT);
  let markerCode: LinkMarkerCode | null = null;
  let visited = 0;
  for (let node: Node | null = document.body; node !== null; node = walker.nextNode()) {
    visited += 1;
    if (visited > 20_000) return unknown;
    const element = node as Element;
    if (!visible(element)) continue;
    // A visible embedded document may contain a challenge we cannot inspect.
    if (element.tagName === 'IFRAME') return unknown;
    const text = shortVisibleText(element);
    if (text === null || text === '') continue;
    if (/验证码|安全验证|异常访问|访问异常|访问受限|访问频繁|操作频繁|人机验证|滑动验证|拖动滑块|请.*登录|需要登录|登录后|登录验证|扫码登录|账号登录|登录[\/或]?注册/u.test(text)) return unknown;
    // Exact approved message, with optional final punctuation. A mention inside
    // JD prose or a negated phrase is never classified as an unavailable page.
    const marker = markers[text.replace(/[。！!，,：:]+$/u, '')];
    if (marker !== undefined) markerCode ??= marker;
  }
  return { pageMatches, challenge: false, markerCode, observedAt };
}
