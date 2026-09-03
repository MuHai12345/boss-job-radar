import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { Window } from 'happy-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { parseVerifiedBossJobCards } from '../src/adapters/boss/job-card-parser';
import { parseVerifiedBossJobDetail } from '../src/adapters/boss/job-detail-parser';
import { verifiedBossJobDetailSelectorProfile } from '../src/adapters/boss/job-detail-selector-profile';
import { verifiedBossJobCardSelectorProfile } from '../src/adapters/boss/selector-profile';
import { runVerifiedBossStructuredExtraction } from '../src/page-extraction/structured-page-extraction';

const fixtureDirectory = new URL('./fixtures/boss-verified-shape/', import.meta.url);
const profiles = {
  cardProfile: verifiedBossJobCardSelectorProfile,
  detailProfile: verifiedBossJobDetailSelectorProfile,
};

function createWindow(url: string, html: string): Window {
  const window = new Window({ url });
  window.document.write(html);
  window.document.close();
  vi.stubGlobal('window', window);
  vi.stubGlobal('document', window.document);
  return window;
}

function createFixtureWindow(url: string, name: string): Window {
  return createWindow(
    url,
    readFileSync(fileURLToPath(new URL(name, fixtureDirectory)), 'utf8'),
  );
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('runVerifiedBossStructuredExtraction search results', () => {
  it('extracts verified cards, preserves raw salary, and matches the reference parser', () => {
    const window = createFixtureWindow(
      'https://www.zhipin.com/web/geek/jobs?query=PRIVATE#tracking',
      'job-list.html',
    );
    const reference = parseVerifiedBossJobCards(
      window.document as unknown as Document,
      { baseUrl: window.location.href },
    );

    const result = runVerifiedBossStructuredExtraction(profiles);

    expect(result).toMatchObject({
      pageType: 'search_results',
      pageUrl: 'https://www.zhipin.com/web/geek/jobs',
      matchedCardCount: 2,
      detail: null,
      warnings: [],
    });
    expect(result.capturedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(result.cards).toHaveLength(2);
    expect(result.warnings).toEqual(reference.warnings);
    expect(result.cards[0]).toMatchObject({
      title: '虚构电商运营助理 A',
      companyName: '公司 A',
      salaryText: '\uE101-\uE102K',
      locationText: '上海·浦东新区',
      experienceText: '经验不限',
      educationText: '大专',
      tags: [],
      jobHrefRaw: 'https://www.zhipin.com/job_detail/example-a.html',
      jobUrl: 'https://www.zhipin.com/job_detail/example-a.html',
      recruiterActivityText: null,
      publishedText: null,
      missingFields: ['tags', 'recruiterActivityText', 'publishedText'],
    });

    const contractFields = [
      'title',
      'companyName',
      'salaryText',
      'locationText',
      'experienceText',
      'educationText',
      'tags',
      'jobHrefRaw',
      'jobUrl',
      'recruiterActivityText',
      'publishedText',
      'rawCardText',
      'missingFields',
      'warnings',
    ] as const;
    for (const [index, card] of result.cards.entries()) {
      for (const field of contractFields) {
        expect(card[field]).toEqual(reference.cards[index]?.[field]);
      }
    }
    expect(JSON.stringify(result)).not.toMatch(/PRIVATE|securityId|tracking/);
  });

  it('keeps sparse cards and scopes rawCardText to each matching card', () => {
    createWindow(
      'https://www.zhipin.com/web/geek/jobs',
      `
        <nav>PRIVATE_ACCOUNT_NAV</nav>
        <li class="job-card-box">
          <a class="job-name" href="/job_detail/first.html">第一岗位</a>
          <span class="job-salary">7-9K</span>
        </li>
        <li class="job-card-box">
          <a class="job-name" href="/job_detail/second.html">第二岗位</a>
        </li>
      `,
    );

    const result = runVerifiedBossStructuredExtraction(profiles);

    expect(result.cards).toHaveLength(2);
    expect(result.cards[1]?.salaryText).toBeNull();
    expect(result.cards[1]?.missingFields).toContain('salaryText');
    expect(result.cards[0]?.rawCardText).toContain('第一岗位');
    expect(result.cards[0]?.rawCardText).not.toMatch(/第二岗位|PRIVATE_ACCOUNT_NAV/);
    expect(result.cards[1]?.rawCardText).toContain('第二岗位');
    expect(result.cards[1]?.rawCardText).not.toMatch(/第一岗位|PRIVATE_ACCOUNT_NAV/);
  });

  it('caps extraction at 100 cards without clicking or scrolling', () => {
    const cards = Array.from(
      { length: 105 },
      (_, index) =>
        `<li class="job-card-box"><a class="job-name" href="/job_detail/example-${index}.html">岗位 ${index}</a></li>`,
    ).join('');
    const window = createWindow(
      'https://www.zhipin.com/web/geek/jobs',
      `<ul>${cards}</ul>`,
    );
    const firstCard = window.document.querySelector('li.job-card-box');
    if (firstCard === null) {
      throw new Error('Expected a card fixture.');
    }
    const clickSpy = vi.spyOn(firstCard as unknown as HTMLElement, 'click');
    const scrollSpy = vi.fn();
    Object.defineProperty(firstCard, 'scrollIntoView', {
      configurable: true,
      value: scrollSpy,
    });

    const result = runVerifiedBossStructuredExtraction(profiles);

    expect(result.matchedCardCount).toBe(105);
    expect(result.cards).toHaveLength(100);
    expect(result.cards.at(-1)?.title).toBe('岗位 99');
    expect(result.warnings).toContain('card_limit_reached');
    expect(clickSpy).not.toHaveBeenCalled();
    expect(scrollSpy).not.toHaveBeenCalled();
  });

  it('returns explicit empty, missing-body, and unsupported states', () => {
    createWindow('https://www.zhipin.com/web/geek/jobs', '<main>空列表</main>');
    expect(runVerifiedBossStructuredExtraction(profiles)).toMatchObject({
      matchedCardCount: 0,
      cards: [],
      warnings: ['no_job_cards'],
    });

    const window = createWindow(
      'https://www.zhipin.com/web/geek/jobs',
      '<body></body>',
    );
    window.document.body?.remove();
    expect(runVerifiedBossStructuredExtraction(profiles)).toMatchObject({
      matchedCardCount: 0,
      cards: [],
      warnings: ['body_missing'],
    });

    createWindow('https://www.zhipin.com/', '<main>首页</main>');
    expect(runVerifiedBossStructuredExtraction(profiles)).toMatchObject({
      pageType: 'unsupported',
      matchedCardCount: null,
      cards: [],
      detail: null,
      warnings: ['unsupported_page'],
    });
  });
});

describe('runVerifiedBossStructuredExtraction job detail', () => {
  it.each(['job-detail-a.html', 'job-detail-b.html', 'job-detail-c.html'])(
    'matches the verified parser contract for %s',
    (fixture) => {
      const slug = fixture.replace('job-detail-', 'example-').replace('.html', '');
      const pageUrl = `https://www.zhipin.com/job_detail/${slug}.html?securityId=PRIVATE#tracking`;
      const window = createFixtureWindow(pageUrl, fixture);
      const reference = parseVerifiedBossJobDetail(
        window.document as unknown as Document,
        { currentPageUrl: pageUrl },
      );

      const result = runVerifiedBossStructuredExtraction(profiles);

      expect(result).toMatchObject({
        pageType: 'job_detail',
        pageUrl: `https://www.zhipin.com/job_detail/${slug}.html`,
        matchedCardCount: null,
        cards: [],
        warnings: [],
      });
      expect(result.detail).not.toBeNull();
      const contractFields = [
        'title',
        'companyName',
        'salaryText',
        'locationText',
        'experienceText',
        'educationText',
        'tags',
        'jobHrefRaw',
        'jobUrl',
        'recruiterActivityText',
        'publishedText',
        'fullJdText',
        'rawDetailText',
        'missingFields',
        'warnings',
      ] as const;
      for (const field of contractFields) {
        expect(result.detail?.[field]).toEqual(reference[field]);
      }
      expect(JSON.stringify(result)).not.toMatch(/securityId|PRIVATE#|tracking/);
    },
  );

  it('keeps JD text scoped and excludes executable or unrelated page regions', () => {
    createFixtureWindow(
      'https://www.zhipin.com/job_detail/example-a.html',
      'job-detail-a.html',
    );

    const detail = runVerifiedBossStructuredExtraction(profiles).detail;

    expect(detail?.fullJdText).toBe(
      'CURRENT_JOB_JD\n维护商品资料\n协助活动报名',
    );
    expect(detail?.rawDetailText).toBe(detail?.fullJdText);
    for (const excluded of [
      'PRIVATE_ACCOUNT_NAV',
      'PRIVATE_SCRIPT',
      'PRIVATE_STYLE',
      'PRIVATE_NOSCRIPT',
      'PRIVATE_TEMPLATE',
      'PRIVATE_COMPETITION',
      'PRIVATE_SECURITY',
      'PRIVATE_RECOMMENDATION',
    ]) {
      expect(JSON.stringify(detail)).not.toContain(excluded);
    }
    expect(detail?.jobUrl).toBe(
      'https://www.zhipin.com/job_detail/example-a.html',
    );
    expect(JSON.stringify(detail)).not.toContain('recommended-a.html');
  });

  it('does not read private browser state, send network requests, or mutate DOM', () => {
    const window = createFixtureWindow(
      'https://www.zhipin.com/job_detail/example-a.html',
      'job-detail-a.html',
    );
    Object.defineProperty(window.document, 'cookie', {
      configurable: true,
      get: () => {
        throw new Error('document.cookie must not be read');
      },
    });
    for (const property of [
      'localStorage',
      'sessionStorage',
      'indexedDB',
      'caches',
    ] as const) {
      Object.defineProperty(window, property, {
        configurable: true,
        get: () => {
          throw new Error(`${property} must not be read`);
        },
      });
    }
    const input = window.document.createElement('input');
    Object.defineProperty(input, 'value', {
      configurable: true,
      get: () => {
        throw new Error('input.value must not be read');
      },
    });
    window.document.querySelector('.job-sec-text')?.append(input);
    const fetchSpy = vi.fn(() => {
      throw new Error('network must not be used');
    });
    vi.stubGlobal('fetch', fetchSpy);
    const before = window.document.documentElement.outerHTML;

    const result = runVerifiedBossStructuredExtraction(profiles);

    expect(() => JSON.parse(JSON.stringify(result))).not.toThrow();
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(window.document.documentElement.outerHTML).toBe(before);
  });
});
