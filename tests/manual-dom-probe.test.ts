import { Window } from 'happy-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { runManualDomProbe } from '../src/manual-validation/dom-probe';

function createWindow(html: string): Window {
  const window = new Window({
    url: 'https://www.zhipin.com/web/geek/job?query=secret#tracking',
  });
  window.document.write(html);
  window.document.close();
  vi.stubGlobal('window', window);
  vi.stubGlobal('document', window.document);
  return window;
}

function markVisible(element: unknown, top = 10): void {
  if (
    typeof element !== 'object' ||
    element === null ||
    !('getBoundingClientRect' in element)
  ) {
    throw new Error('Expected an element with getBoundingClientRect.');
  }

  const rectTarget = element as { getBoundingClientRect: () => unknown };
  vi.spyOn(rectTarget, 'getBoundingClientRect').mockReturnValue({
    x: 10,
    y: top,
    width: 200,
    height: 40,
    top,
    right: 210,
    bottom: top + 40,
    left: 10,
    toJSON: () => ({}),
  });
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('runManualDomProbe', () => {
  it('returns a JSON-safe bounded structure summary', () => {
    const window = createWindow(`
      <!doctype html>
      <html lang="zh-CN">
        <head><title>人工验证页</title></head>
        <body><main class="result-list"><h1>岗位列表</h1></main></body>
      </html>
    `);
    markVisible(window.document.querySelector('main'));
    markVisible(window.document.querySelector('h1'));

    const result = runManualDomProbe();
    const serialized = JSON.stringify(result);

    expect(() => JSON.parse(serialized)).not.toThrow();
    expect(result).toMatchObject({
      pageUrl:
        'https://www.zhipin.com/web/geek/job?query=secret#tracking',
      pageTitle: '人工验证页',
      candidateSummary: {
        bodyExists: true,
        visibleMainCount: 1,
        visibleArticleCount: 0,
        visibleSectionCount: 0,
        linkCount: 0,
        headingCount: 1,
        documentLanguage: 'zh-CN',
        pathname: '/web/geek/job',
      },
      warnings: [],
    });
    expect(result.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it('does not read or return cookie, localStorage, or sessionStorage', () => {
    const window = createWindow('<body><main>安全摘要</main></body>');
    const document = window.document;
    markVisible(document.querySelector('main'));
    Object.defineProperty(document, 'cookie', {
      configurable: true,
      get: () => {
        throw new Error('cookie must not be read');
      },
    });
    Object.defineProperty(window, 'localStorage', {
      configurable: true,
      get: () => {
        throw new Error('localStorage must not be read');
      },
    });
    Object.defineProperty(window, 'sessionStorage', {
      configurable: true,
      get: () => {
        throw new Error('sessionStorage must not be read');
      },
    });

    expect(() => runManualDomProbe()).not.toThrow();
    expect(JSON.stringify(runManualDomProbe())).not.toMatch(
      /cookie|localStorage|sessionStorage/i,
    );
  });

  it('does not read input or textarea values', () => {
    const window = createWindow(`
      <body>
        <main>
          <input value="PRIVATE_INPUT_VALUE" />
          <textarea>PRIVATE_TEXTAREA_VALUE</textarea>
          <p>允许展示的正文</p>
        </main>
      </body>
    `);
    const main = window.document.querySelector('main');
    markVisible(main);
    const input = window.document.querySelector('input');
    const textarea = window.document.querySelector('textarea');
    if (input === null || textarea === null) {
      throw new Error('Expected test form controls.');
    }
    Object.defineProperty(input, 'value', {
      configurable: true,
      get: () => {
        throw new Error('input.value must not be read');
      },
    });
    Object.defineProperty(textarea, 'value', {
      configurable: true,
      get: () => {
        throw new Error('textarea.value must not be read');
      },
    });

    const serialized = JSON.stringify(runManualDomProbe());

    expect(serialized).not.toContain('PRIVATE_INPUT_VALUE');
    expect(serialized).not.toContain('PRIVATE_TEXTAREA_VALUE');
  });

  it('normalizes whitespace and limits each text preview to 120 characters', () => {
    const window = createWindow(
      `<body><article>  第一段\n\t第二段 ${'长'.repeat(200)} </article></body>`,
    );
    markVisible(window.document.querySelector('article'));

    const [candidate] = runManualDomProbe().candidateSummary.candidates;

    expect(candidate?.textPreview).not.toMatch(/\s{2,}/);
    expect(candidate?.textPreview.startsWith('第一段 第二段')).toBe(true);
    expect(candidate?.textPreview.length).toBeLessThanOrEqual(120);
  });

  it('limits candidates to 20 and preserves DOM order', () => {
    const articles = Array.from(
      { length: 25 },
      (_, index) => `<article class="candidate-${index}">候选 ${index}</article>`,
    ).join('');
    const window = createWindow(`<body>${articles}</body>`);
    window.document.querySelectorAll('article').forEach((element, index) => {
      markVisible(element, 5 + index);
    });

    const candidates = runManualDomProbe().candidateSummary.candidates;

    expect(candidates).toHaveLength(20);
    expect(candidates.map((candidate) => candidate.className)).toEqual(
      Array.from({ length: 20 }, (_, index) => `candidate-${index}`),
    );
  });

  it.each([
    ['hidden attribute', '<article hidden>隐藏候选</article>'],
    ['display none', '<article style="display:none">隐藏候选</article>'],
    ['zero opacity', '<article style="opacity:0">隐藏候选</article>'],
  ])('excludes an element hidden by %s', (_, markup) => {
    const window = createWindow(`<body>${markup}</body>`);
    markVisible(window.document.querySelector('article'));

    expect(runManualDomProbe().candidateSummary.candidates).toEqual([]);
    expect(runManualDomProbe().warnings).toContain('no_candidates');
  });

  it('does not use a hidden descendant as candidate evidence', () => {
    const window = createWindow(`
      <body>
        <div class="wrapper">
          <h2 hidden>隐藏标题</h2>
          <a href="/visible-link">可见链接</a>
        </div>
      </body>
    `);
    markVisible(window.document.querySelector('.wrapper'));
    markVisible(window.document.querySelector('h2'));
    markVisible(window.document.querySelector('a'));

    expect(runManualDomProbe().candidateSummary.candidates).toEqual([]);
  });

  it('includes an ordinary visible semantic element as a candidate', () => {
    const window = createWindow('<body><article>可见候选</article></body>');
    markVisible(window.document.querySelector('article'));

    expect(runManualDomProbe().candidateSummary.candidates).toMatchObject([
      { tagName: 'ARTICLE', textPreview: '可见候选' },
    ]);
  });

  it('retains only the approved attribute whitelist', () => {
    const window = createWindow(`
      <body>
        <section
          id="private-id"
          class="candidate-shell"
          role="region"
          aria-label="候选区域"
          data-secret="private-data"
          onclick="alert(1)"
          style="color:red"
        >摘要</section>
      </body>
    `);
    markVisible(window.document.querySelector('section'));

    const [candidate] = runManualDomProbe().candidateSummary.candidates;

    expect(candidate).toEqual({
      tagName: 'SECTION',
      className: 'candidate-shell',
      role: 'region',
      ariaLabel: '候选区域',
      textPreview: '摘要',
      childElementCount: 0,
      link: null,
    });
    expect(JSON.stringify(candidate)).not.toMatch(
      /private-id|private-data|onclick|color:red/,
    );
  });

  it('keeps only hostname and pathname in a candidate link summary', () => {
    const window = createWindow(`
      <body>
        <article>
          <a href="/job_detail/example.html?tracking=secret#private">候选链接</a>
        </article>
      </body>
    `);
    markVisible(window.document.querySelector('article'));
    markVisible(window.document.querySelector('a'));

    const [candidate] = runManualDomProbe().candidateSummary.candidates;

    expect(candidate?.link).toEqual({
      hostname: 'www.zhipin.com',
      pathname: '/job_detail/example.html',
    });
    expect(JSON.stringify(candidate?.link)).not.toMatch(/tracking|secret|private/);
  });

  it('ignores hidden links when selecting a candidate link summary', () => {
    const window = createWindow(`
      <body>
        <article>
          <a hidden href="/hidden-link?secret=1">隐藏链接</a>
          <a href="/visible-link?tracking=2#hash">可见链接</a>
        </article>
      </body>
    `);
    markVisible(window.document.querySelector('article'));
    markVisible(window.document.querySelector('[hidden]'));
    markVisible(window.document.querySelector('a:not([hidden])'));

    expect(runManualDomProbe().candidateSummary.candidates[0]?.link).toEqual({
      hostname: 'www.zhipin.com',
      pathname: '/visible-link',
    });
  });

  it('does not perform network requests or mutate the input DOM', () => {
    const window = createWindow(
      '<body><main><article>只读候选</article></main></body>',
    );
    markVisible(window.document.querySelector('main'));
    markVisible(window.document.querySelector('article'));
    const fetchSpy = vi.fn(() => {
      throw new Error('network must not be used');
    });
    vi.stubGlobal('fetch', fetchSpy);
    const before = window.document.documentElement.outerHTML;

    runManualDomProbe();

    expect(fetchSpy).not.toHaveBeenCalled();
    expect(window.document.documentElement.outerHTML).toBe(before);
  });

  it('returns an explainable result when the page has no candidates', () => {
    createWindow('<body><p>普通页面</p></body>');

    const result = runManualDomProbe();

    expect(result.candidateSummary.bodyExists).toBe(true);
    expect(result.candidateSummary.candidates).toEqual([]);
    expect(result.warnings).toEqual(['no_candidates']);
  });

  it('returns an explainable result when document.body is absent', () => {
    const window = createWindow('<html lang="zh-CN"><head></head><body></body></html>');
    window.document.body?.remove();

    const result = runManualDomProbe();

    expect(result.candidateSummary).toMatchObject({
      bodyExists: false,
      visibleMainCount: 0,
      visibleArticleCount: 0,
      visibleSectionCount: 0,
      linkCount: 0,
      headingCount: 0,
      visibleTextLength: 0,
      candidates: [],
    });
    expect(result.warnings).toEqual(['body_missing']);
  });
});
