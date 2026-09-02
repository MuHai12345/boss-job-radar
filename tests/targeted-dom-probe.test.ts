import { Window } from 'happy-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { runTargetedDomProbe } from '../src/manual-validation/targeted-dom-probe';

function createWindow(url: string, bodyMarkup: string): Window {
  const window = new Window({ url });
  window.document.write(`<!doctype html><html><body>${bodyMarkup}</body></html>`);
  window.document.close();
  vi.stubGlobal('window', window);
  vi.stubGlobal('document', window.document);
  return window;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('runTargetedDomProbe', () => {
  it('classifies only the approved BOSS pathnames without using query or hash', () => {
    createWindow(
      'https://www.zhipin.com/web/geek/jobs?query=secret#private',
      '<li class="job-card-box">搜索卡片</li>',
    );

    expect(runTargetedDomProbe()).toMatchObject({
      pageUrl: 'https://www.zhipin.com/web/geek/jobs',
      pageType: 'search_results',
      warnings: [],
    });

    createWindow(
      'https://www.zhipin.com/job_detail/example.html?securityId=secret#private',
      '<div class="info-primary">标题区域</div><div class="job-tags">标签</div><div class="job-box">职位描述</div><aside class="job-sider">侧栏</aside>',
    );
    expect(runTargetedDomProbe()).toMatchObject({
      pageUrl: 'https://www.zhipin.com/job_detail/example.html',
      pageType: 'job_detail',
    });

    createWindow('https://www.zhipin.com/', '<main>首页</main>');
    expect(runTargetedDomProbe()).toMatchObject({
      pageType: 'unsupported',
      warnings: ['unsupported_page'],
    });
  });

  it('matches only li.job-card-box and samples the first three in DOM order', () => {
    createWindow(
      'https://www.zhipin.com/web/geek/jobs',
      `
        <nav>TOP_ACCOUNT_NAME</nav>
        <div class="job-card-box">错误标签</div>
        <li class="job-card-box">卡片 1</li>
        <li class="job-card-box">卡片 2</li>
        <li class="job-card-box">卡片 3</li>
        <li class="job-card-box">卡片 4</li>
      `,
    );

    const result = runTargetedDomProbe();
    const [target] = result.targets;

    expect(result.matchedCardCount).toBe(4);
    expect(target).toMatchObject({
      selectorLabel: 'li.job-card-box',
      matchedCount: 4,
    });
    expect(target?.samples).toHaveLength(3);
    expect(
      target?.samples.map((sample) => sample.nodes[0]?.directTextPreview),
    ).toEqual(['卡片 1', '卡片 2', '卡片 3']);
    expect(JSON.stringify(result)).not.toContain('TOP_ACCOUNT_NAME');
    expect(JSON.stringify(result)).not.toContain('错误标签');
  });

  it('uses direct text, approved attributes, redacted links, and PUA detection only', () => {
    const privateUseCharacter = '\uE123';
    createWindow(
      'https://www.zhipin.com/web/geek/jobs',
      `
        <li
          class="job-card-box extra"
          id="private-id"
          role="listitem"
          aria-label="岗位卡片"
          title="卡片标题"
          data-secret="PRIVATE_DATA"
          style="color:red"
        >
          根节点文本
          <span class="salary">${privateUseCharacter}K</span>
          <a href="/job_detail/example.html?securityId=SECRET#PRIVATE">岗位链接</a>
          <input value="PRIVATE_INPUT" />
          <textarea>PRIVATE_TEXTAREA</textarea>
          <select><option value="PRIVATE_OPTION">PRIVATE_SELECT</option></select>
        </li>
      `,
    );

    const result = runTargetedDomProbe();
    const nodes = result.targets[0]?.samples[0]?.nodes ?? [];
    const root = nodes[0];
    const salary = nodes.find((node) => node.className === 'salary');
    const link = nodes.find((node) => node.tagName === 'A');
    const serialized = JSON.stringify(result);

    expect(root).toEqual({
      depth: 0,
      tagName: 'LI',
      className: 'job-card-box extra',
      role: 'listitem',
      ariaLabel: '岗位卡片',
      titleAttribute: '卡片标题',
      directTextPreview: '根节点文本',
      childElementCount: 5,
      link: null,
      containsPrivateUseCharacters: false,
    });
    expect(salary).toMatchObject({
      directTextPreview: `${privateUseCharacter}K`,
      containsPrivateUseCharacters: true,
    });
    expect(link?.link).toEqual({
      hostname: 'www.zhipin.com',
      pathname: '/job_detail/example.html',
    });
    expect(serialized).not.toMatch(
      /private-id|PRIVATE_DATA|color:red|securityId|SECRET|PRIVATE#|PRIVATE_INPUT|PRIVATE_TEXTAREA|PRIVATE_SELECT|PRIVATE_OPTION/,
    );
    expect(serialized).toContain(privateUseCharacter);
  });

  it('limits each search card to 60 preorder nodes and marks truncation', () => {
    const children = Array.from(
      { length: 70 },
      (_, index) => `<span>节点 ${index}</span>`,
    ).join('');
    createWindow(
      'https://www.zhipin.com/web/geek/jobs',
      `<li class="job-card-box">${children}</li>`,
    );

    const sample = runTargetedDomProbe().targets[0]?.samples[0];

    expect(sample?.nodes).toHaveLength(60);
    expect(sample?.truncated).toBe(true);
    expect(sample?.nodes.at(-1)?.directTextPreview).toBe('节点 58');
  });

  it('limits search direct text to 80 characters while detecting later PUA text', () => {
    const privateUseCharacter = '\uE234';
    createWindow(
      'https://www.zhipin.com/web/geek/jobs',
      `<li class="job-card-box"><span>${'薪'.repeat(90)}${privateUseCharacter}</span></li>`,
    );

    const salaryNode =
      runTargetedDomProbe().targets[0]?.samples[0]?.nodes[1];

    expect(salaryNode?.directTextPreview).toHaveLength(80);
    expect(salaryNode?.directTextPreview).not.toContain(privateUseCharacter);
    expect(salaryNode?.containsPrivateUseCharacters).toBe(true);
  });

  it('limits search traversal to depth 5 and marks deeper visible DOM', () => {
    createWindow(
      'https://www.zhipin.com/web/geek/jobs',
      `
        <li class="job-card-box">
          <div><div><div><div><div><span>深度 6</span></div></div></div></div></div>
        </li>
      `,
    );

    const sample = runTargetedDomProbe().targets[0]?.samples[0];

    expect(Math.max(...(sample?.nodes.map((node) => node.depth) ?? []))).toBe(5);
    expect(sample?.truncated).toBe(true);
    expect(JSON.stringify(sample)).not.toContain('深度 6');
  });

  it('excludes hidden descendants but keeps existing below-viewport DOM without scrolling', () => {
    const window = createWindow(
      'https://www.zhipin.com/web/geek/jobs',
      `
        <li class="job-card-box">
          <span hidden>HIDDEN_ATTRIBUTE</span>
          <span style="display:none">DISPLAY_NONE</span>
          <span style="visibility:hidden">VISIBILITY_HIDDEN</span>
          <span style="visibility:collapse">VISIBILITY_COLLAPSE</span>
          <span class="below">BELOW_VIEWPORT</span>
        </li>
      `,
    );
    const below = window.document.querySelector('.below');
    Object.defineProperty(below, 'getBoundingClientRect', {
      value: () => ({ top: 5000, bottom: 5020, left: 0, right: 100, width: 100, height: 20 }),
    });
    const scrollSpy = vi.fn();
    Object.defineProperty(window, 'scrollTo', { configurable: true, value: scrollSpy });

    const serialized = JSON.stringify(runTargetedDomProbe());

    expect(serialized).not.toMatch(
      /HIDDEN_ATTRIBUTE|DISPLAY_NONE|VISIBILITY_HIDDEN|VISIBILITY_COLLAPSE/,
    );
    expect(serialized).toContain('BELOW_VIEWPORT');
    expect(scrollSpy).not.toHaveBeenCalled();
  });

  it('does not let hidden card roots consume the first three sample slots', () => {
    createWindow(
      'https://www.zhipin.com/web/geek/jobs',
      `
        <li class="job-card-box" hidden>隐藏卡片 1</li>
        <li class="job-card-box" style="display:none">隐藏卡片 2</li>
        <li class="job-card-box">可见卡片 1</li>
        <li class="job-card-box">可见卡片 2</li>
        <li class="job-card-box">可见卡片 3</li>
        <li class="job-card-box">可见卡片 4</li>
      `,
    );

    const result = runTargetedDomProbe();

    expect(result.matchedCardCount).toBe(6);
    expect(
      result.targets[0]?.samples.map(
        (sample) => sample.nodes[0]?.directTextPreview,
      ),
    ).toEqual(['可见卡片 1', '可见卡片 2', '可见卡片 3']);
  });

  it('returns no_job_cards without guessing another search selector', () => {
    createWindow(
      'https://www.zhipin.com/web/geek/jobs',
      '<ul class="rec-job-list"><li class="guessed-card">不要猜测</li></ul>',
    );

    const result = runTargetedDomProbe();

    expect(result.matchedCardCount).toBe(0);
    expect(result.targets).toEqual([
      { selectorLabel: 'li.job-card-box', matchedCount: 0, samples: [] },
    ]);
    expect(result.warnings).toEqual(['no_job_cards']);
    expect(JSON.stringify(result)).not.toContain('不要猜测');
  });

  it('scans only the four approved detail roots and reports missing targets', () => {
    createWindow(
      'https://www.zhipin.com/job_detail/example.html',
      `
        <nav><span>TOP_ACCOUNT_NAME</span></nav>
        <div class="job-banner">UNAPPROVED_BANNER</div>
        <div class="info-primary">标题区域</div>
        <div class="job-tags">标签区域</div>
        <aside class="job-sider">侧栏区域</aside>
      `,
    );

    const result = runTargetedDomProbe();

    expect(result.targets.map((target) => target.selectorLabel)).toEqual([
      '.info-primary',
      '.job-tags',
      '.job-box',
      '.job-sider',
    ]);
    expect(result.targets.map((target) => target.matchedCount)).toEqual([
      1, 1, 0, 1,
    ]);
    expect(result.warnings).toContain('target_not_found');
    expect(JSON.stringify(result)).not.toMatch(
      /TOP_ACCOUNT_NAME|UNAPPROVED_BANNER/,
    );
  });

  it('samples the first non-hidden detail root while retaining the raw match count', () => {
    createWindow(
      'https://www.zhipin.com/job_detail/example.html',
      `
        <div class="job-box" hidden>隐藏职位描述</div>
        <div class="job-box">可见职位描述</div>
      `,
    );

    const target = runTargetedDomProbe().targets.find(
      (candidate) => candidate.selectorLabel === '.job-box',
    );

    expect(target?.matchedCount).toBe(2);
    expect(target?.samples).toHaveLength(1);
    expect(target?.samples[0]?.rootTextPreview).toBe('可见职位描述');
  });

  it.each([
    ['.info-primary', 80, 6],
    ['.job-tags', 50, 5],
    ['.job-box', 160, 8],
    ['.job-sider', 80, 6],
  ] as const)(
    'enforces the node and depth limits for %s',
    (selector, nodeLimit, depthLimit) => {
      const className = selector.slice(1);
      const wide = Array.from(
        { length: nodeLimit + 5 },
        (_, index) => `<i>wide-${index}</i>`,
      ).join('');
      const deep = Array.from({ length: depthLimit + 2 }, () => '<div>').join('');
      const deepClose = Array.from({ length: depthLimit + 2 }, () => '</div>').join('');
      createWindow(
        'https://www.zhipin.com/job_detail/example.html',
        `<section class="${className}">${wide}${deep}TOO_DEEP${deepClose}</section>`,
      );

      const target = runTargetedDomProbe().targets.find(
        (candidate) => candidate.selectorLabel === selector,
      );
      const sample = target?.samples[0];

      expect(sample?.nodes).toHaveLength(nodeLimit);
      expect(Math.max(...(sample?.nodes.map((node) => node.depth) ?? []))).toBeLessThanOrEqual(
        depthLimit,
      );
      expect(sample?.truncated).toBe(true);
    },
  );

  it.each([
    ['.info-primary', 6],
    ['.job-tags', 5],
    ['.job-box', 8],
    ['.job-sider', 6],
  ] as const)('stops %s traversal at depth %s', (selector, depthLimit) => {
    const className = selector.slice(1);
    const deep = Array.from({ length: depthLimit + 1 }, () => '<div>').join('');
    const deepClose = Array.from(
      { length: depthLimit + 1 },
      () => '</div>',
    ).join('');
    createWindow(
      'https://www.zhipin.com/job_detail/example.html',
      `<section class="${className}">${deep}TOO_DEEP${deepClose}</section>`,
    );

    const sample = runTargetedDomProbe().targets.find(
      (target) => target.selectorLabel === selector,
    )?.samples[0];

    expect(Math.max(...(sample?.nodes.map((node) => node.depth) ?? []))).toBe(
      depthLimit,
    );
    expect(sample?.truncated).toBe(true);
    expect(JSON.stringify(sample?.nodes)).not.toContain('TOO_DEEP');
  });

  it('limits detail direct and root text without returning the complete JD', () => {
    createWindow(
      'https://www.zhipin.com/job_detail/example.html',
      `<div class="job-box">${'直'.repeat(150)}<p>${'完整职位描述'.repeat(100)}</p></div>`,
    );

    const target = runTargetedDomProbe().targets.find(
      (candidate) => candidate.selectorLabel === '.job-box',
    );
    const sample = target?.samples[0];

    expect(sample?.nodes[0]?.directTextPreview).toHaveLength(100);
    expect(sample?.rootTextPreview).toHaveLength(300);
    expect(sample?.rootTextPreview).not.toContain('完整职位描述'.repeat(100));
  });

  it('does not read private browser state, send network requests, or mutate DOM', () => {
    const window = createWindow(
      'https://www.zhipin.com/web/geek/jobs',
      '<li class="job-card-box"><span>只读结构</span></li>',
    );
    Object.defineProperty(window.document, 'cookie', {
      configurable: true,
      get: () => {
        throw new Error('document.cookie must not be read');
      },
    });
    for (const storageName of ['localStorage', 'sessionStorage'] as const) {
      Object.defineProperty(window, storageName, {
        configurable: true,
        get: () => {
          throw new Error(`${storageName} must not be read`);
        },
      });
    }
    Object.defineProperty(window, 'indexedDB', {
      configurable: true,
      get: () => {
        throw new Error('indexedDB must not be read');
      },
    });
    Object.defineProperty(window, 'caches', {
      configurable: true,
      get: () => {
        throw new Error('Cache Storage must not be read');
      },
    });
    const card = window.document.querySelector('li.job-card-box');
    if (card === null) {
      throw new Error('Expected a targeted job card.');
    }
    const cardElement = card as unknown as HTMLElement;
    const input = window.document.createElement('input');
    const textarea = window.document.createElement('textarea');
    const select = window.document.createElement('select');
    for (const control of [input, textarea, select]) {
      Object.defineProperty(control, 'value', {
        configurable: true,
        get: () => {
          throw new Error('form control value must not be read');
        },
      });
      card.append(control);
    }
    const clickSpy = vi.spyOn(cardElement, 'click');
    const focusSpy = vi.spyOn(cardElement, 'focus');
    const dispatchSpy = vi.spyOn(cardElement, 'dispatchEvent');
    const scrollSpy = vi.fn();
    Object.defineProperty(card, 'scrollIntoView', {
      configurable: true,
      value: scrollSpy,
    });
    const fetchSpy = vi.fn(() => {
      throw new Error('network must not be used');
    });
    vi.stubGlobal('fetch', fetchSpy);
    const before = window.document.documentElement.outerHTML;

    const result = runTargetedDomProbe();

    expect(() => JSON.parse(JSON.stringify(result))).not.toThrow();
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(clickSpy).not.toHaveBeenCalled();
    expect(focusSpy).not.toHaveBeenCalled();
    expect(dispatchSpy).not.toHaveBeenCalled();
    expect(scrollSpy).not.toHaveBeenCalled();
    expect(window.document.documentElement.outerHTML).toBe(before);
  });

  it('returns body_missing when the document body is absent', () => {
    const window = createWindow(
      'https://www.zhipin.com/web/geek/jobs',
      '<li class="job-card-box">卡片</li>',
    );
    window.document.body?.remove();

    expect(runTargetedDomProbe()).toMatchObject({
      matchedCardCount: 0,
      targets: [],
      warnings: ['body_missing'],
    });
  });
});
