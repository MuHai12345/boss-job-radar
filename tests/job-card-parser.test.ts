import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { Window } from 'happy-dom';
import { describe, expect, it } from 'vitest';

import { parseJobCards } from '../src/adapters/boss/job-card-parser';
import { syntheticFixtureJobCardSelectorProfile } from '../src/adapters/boss/selector-profile';

const fixtureDirectory = new URL('./fixtures/boss/', import.meta.url);
const bossBaseUrl = 'https://www.zhipin.com/web/geek/job';

function documentFromHtml(html: string): Document {
  const window = new Window();
  window.document.write(html);
  window.document.close();
  return window.document as unknown as Document;
}

function documentFromFixture(name: string): Document {
  const fixtureUrl = new URL(name, fixtureDirectory);
  return documentFromHtml(readFileSync(fileURLToPath(fixtureUrl), 'utf8'));
}

describe('parseJobCards', () => {
  it('extracts and minimally normalizes every field from a complete card', () => {
    const result = parseJobCards(
      documentFromFixture('job-list-complete.html'),
      syntheticFixtureJobCardSelectorProfile,
      { baseUrl: bossBaseUrl },
    );

    expect(result.warnings).toEqual([]);
    expect(result.cards).toHaveLength(1);
    expect(result.cards[0]).toEqual({
      title: '测试电商运营助理',
      companyName: '示例科技有限公司',
      salaryText: '8-12K·13薪',
      locationText: '上海·浦东新区',
      experienceText: '经验不限',
      educationText: '大专',
      tags: ['电商平台', '数据分析'],
      jobHrefRaw: '/job_detail/example-complete.html',
      jobUrl: 'https://www.zhipin.com/job_detail/example-complete.html',
      recruiterActivityText: '今日活跃',
      publishedText: '3天前发布',
      rawCardText:
        '测试电商运营助理 示例科技有限公司 8-12K·13薪 上海·浦东新区 经验不限 大专 电商平台 数据分析 今日活跃 3天前发布',
      missingFields: [],
      warnings: [],
    });
  });

  it('keeps every card in DOM order without deduplicating sparse cards', () => {
    const result = parseJobCards(
      documentFromFixture('job-list-multiple.html'),
      syntheticFixtureJobCardSelectorProfile,
      { baseUrl: bossBaseUrl },
    );

    expect(result.cards).toHaveLength(4);
    expect(result.cards.map((card) => card.title)).toEqual([
      '测试电商运营助理',
      '示例天猫运营助理',
      null,
      '测试电商运营助理',
    ]);
    expect(result.cards[1]?.companyName).toBeNull();
    expect(result.cards[2]?.title).toBeNull();
    expect(result.cards[3]).toMatchObject(result.cards[0] ?? {});
  });

  it('preserves a valid absolute BOSS URL', () => {
    const result = parseJobCards(
      documentFromFixture('job-list-multiple.html'),
      syntheticFixtureJobCardSelectorProfile,
      { baseUrl: bossBaseUrl },
    );

    expect(result.cards[0]?.jobHrefRaw).toBe(
      'https://zhipin.com/job_detail/example-first.html',
    );
    expect(result.cards[0]?.jobUrl).toBe(
      'https://zhipin.com/job_detail/example-first.html',
    );
  });

  it('keeps a card with missing fields and records real unknowns', () => {
    const result = parseJobCards(
      documentFromFixture('job-list-missing-fields.html'),
      syntheticFixtureJobCardSelectorProfile,
      { baseUrl: bossBaseUrl },
    );

    expect(result.cards).toHaveLength(1);
    expect(result.cards[0]).toMatchObject({
      salaryText: null,
      educationText: null,
      recruiterActivityText: null,
      publishedText: null,
      missingFields: [
        'salaryText',
        'educationText',
        'recruiterActivityText',
        'publishedText',
      ],
    });
  });

  it('does not infer publication or recruiter activity from other text', () => {
    const result = parseJobCards(
      documentFromHtml(`
        <article data-fixture-job-card>
          <h2 data-fixture-job-title>今日活跃岗位</h2>
          <p data-fixture-company>三天前成立的示例公司</p>
        </article>
      `),
      syntheticFixtureJobCardSelectorProfile,
      { baseUrl: bossBaseUrl },
    );

    expect(result.cards[0]?.recruiterActivityText).toBeNull();
    expect(result.cards[0]?.publishedText).toBeNull();
  });

  it('keeps an external-link card and records a host warning', () => {
    const result = parseJobCards(
      documentFromFixture('job-list-invalid-link.html'),
      syntheticFixtureJobCardSelectorProfile,
      { baseUrl: bossBaseUrl },
    );

    expect(result.cards).toHaveLength(1);
    expect(result.cards[0]).toMatchObject({
      jobHrefRaw: 'https://evil.example/job/example-invalid',
      jobUrl: null,
      warnings: ['invalid_job_url_host'],
    });
  });

  it.each([
    'https://evil.example/job',
    'https://fake-zhipin.com/job',
    'https://zhipin.com.evil.example/job',
  ])('rejects a non-BOSS URL while preserving its raw href: %s', (href) => {
    const result = parseJobCards(
      documentFromHtml(`
        <article data-fixture-job-card>
          <a data-fixture-job-link href="${href}">岗位</a>
        </article>
      `),
      syntheticFixtureJobCardSelectorProfile,
      { baseUrl: bossBaseUrl },
    );

    expect(result.cards[0]?.jobHrefRaw).toBe(href);
    expect(result.cards[0]?.jobUrl).toBeNull();
    expect(result.cards[0]?.warnings).toContain('invalid_job_url_host');
  });

  it('rejects a non-HTTP job URL protocol', () => {
    const result = parseJobCards(
      documentFromHtml(`
        <article data-fixture-job-card>
          <a data-fixture-job-link href="javascript:void(0)">岗位</a>
        </article>
      `),
      syntheticFixtureJobCardSelectorProfile,
      { baseUrl: bossBaseUrl },
    );

    expect(result.cards[0]?.jobUrl).toBeNull();
    expect(result.cards[0]?.warnings).toContain('invalid_job_url_protocol');
  });

  it('returns empty cards instead of throwing when no container matches', () => {
    const result = parseJobCards(
      documentFromHtml('<main>没有岗位卡片</main>'),
      syntheticFixtureJobCardSelectorProfile,
      { baseUrl: bossBaseUrl },
    );

    expect(result).toEqual({ cards: [], warnings: [] });
  });

  it('records a missing field when its selector has no result', () => {
    const result = parseJobCards(
      documentFromFixture('job-list-complete.html'),
      {
        ...syntheticFixtureJobCardSelectorProfile,
        salary: '[data-selector-that-does-not-exist]',
      },
      { baseUrl: bossBaseUrl },
    );

    expect(result.cards).toHaveLength(1);
    expect(result.cards[0]?.salaryText).toBeNull();
    expect(result.cards[0]?.missingFields).toContain('salaryText');
  });

  it('uses the supplied selector profile to drive the production parser', () => {
    const result = parseJobCards(
      documentFromHtml(`
        <section class="custom-card">
          <strong class="custom-title">自定义测试岗位</strong>
        </section>
      `),
      {
        card: '.custom-card',
        title: '.custom-title',
        company: '.custom-company',
        salary: '.custom-salary',
        location: '.custom-location',
        experience: '.custom-experience',
        education: '.custom-education',
        tags: '.custom-tag',
        link: '.custom-link',
        recruiterActivity: '.custom-recruiter-activity',
        published: '.custom-published',
      },
      { baseUrl: bossBaseUrl },
    );

    expect(result.cards).toHaveLength(1);
    expect(result.cards[0]?.title).toBe('自定义测试岗位');
  });

  it('accepts an Element as the read-only DOM root', () => {
    const document = documentFromFixture('job-list-complete.html');
    const root = document.querySelector('[data-fixture-job-list]');

    expect(root).not.toBeNull();
    const result = parseJobCards(
      root as Element,
      syntheticFixtureJobCardSelectorProfile,
      { baseUrl: bossBaseUrl },
    );

    expect(result.cards).toHaveLength(1);
  });

  it('reports an invalid base URL without dropping relative-link cards', () => {
    const result = parseJobCards(
      documentFromFixture('job-list-complete.html'),
      syntheticFixtureJobCardSelectorProfile,
      { baseUrl: 'https://fake-zhipin.com/search' },
    );

    expect(result.warnings).toEqual(['invalid_base_url']);
    expect(result.cards).toHaveLength(1);
    expect(result.cards[0]?.jobHrefRaw).toBe(
      '/job_detail/example-complete.html',
    );
    expect(result.cards[0]?.jobUrl).toBeNull();
    expect(result.cards[0]?.warnings).toContain(
      'relative_job_url_without_valid_base',
    );
  });

  it('uses an empty tags array and records tags when no tag text exists', () => {
    const result = parseJobCards(
      documentFromHtml(`
        <article data-fixture-job-card>
          <h2 data-fixture-job-title>无标签测试岗位</h2>
          <span data-fixture-tag>   </span>
        </article>
      `),
      syntheticFixtureJobCardSelectorProfile,
      { baseUrl: bossBaseUrl },
    );

    expect(result.cards[0]?.tags).toEqual([]);
    expect(result.cards[0]?.missingFields).toContain('tags');
  });
});
