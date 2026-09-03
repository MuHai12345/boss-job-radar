import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { Window } from 'happy-dom';
import { describe, expect, it } from 'vitest';

import { parseJobDetail } from '../src/adapters/boss/job-detail-parser';
import { syntheticFixtureJobDetailSelectorProfile } from '../src/adapters/boss/job-detail-selector-profile';

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

describe('parseJobDetail', () => {
  it('extracts every field and a readable complete JD from a complete detail', () => {
    const detail = parseJobDetail(
      documentFromFixture('job-detail-complete.html'),
      syntheticFixtureJobDetailSelectorProfile,
      { baseUrl: bossBaseUrl },
    );

    expect(detail).toMatchObject({
      title: '测试电商运营助理',
      companyName: '示例科技有限公司',
      salaryText: '8-12K·13薪',
      locationText: '上海·浦东新区',
      experienceText: '经验不限',
      educationText: '大专',
      tags: ['店铺运营', '数据分析'],
      jobHrefRaw: '/job_detail/example-detail-complete.html',
      jobUrl:
        'https://www.zhipin.com/job_detail/example-detail-complete.html',
      recruiterActivityText: '今日活跃',
      publishedText: '3天前发布',
      fullJdText:
        '岗位职责：\n1. 负责店铺商品维护\n2. 协助活动报名\n任职要求：\n1. 大专及以上\n2. 电商相关经验优先',
      missingFields: [],
      warnings: [],
    });
    expect(detail.rawDetailText).toContain('测试电商运营助理');
    expect(detail.rawDetailText).toContain('岗位职责：');
    expect(detail.rawDetailText).toContain('2. 电商相关经验优先');
  });

  it('preserves paragraph, list, and br order while normalizing whitespace', () => {
    const detail = parseJobDetail(
      documentFromFixture('job-detail-multiline-jd.html'),
      syntheticFixtureJobDetailSelectorProfile,
    );

    expect(detail.fullJdText).toBe(
      '岗位职责：\n1. 整理商品资料\n2. 跟进页面更新\n任职要求：\n细心负责\n愿意学习',
    );
    expect(detail.fullJdText).not.toContain('  ');
  });

  it('returns a sparse detail and records every genuinely missing field', () => {
    const detail = parseJobDetail(
      documentFromFixture('job-detail-missing-fields.html'),
      syntheticFixtureJobDetailSelectorProfile,
      { baseUrl: bossBaseUrl },
    );

    expect(detail).toMatchObject({
      title: '示例天猫运营助理',
      companyName: '演示商贸有限公司',
      salaryText: null,
      educationText: null,
      recruiterActivityText: null,
      publishedText: null,
      fullJdText: null,
      missingFields: [
        'salaryText',
        'educationText',
        'recruiterActivityText',
        'publishedText',
        'fullJdText',
      ],
    });
  });

  it('does not substitute summary text for a missing full JD container', () => {
    const detail = parseJobDetail(
      documentFromFixture('job-detail-missing-fields.html'),
      syntheticFixtureJobDetailSelectorProfile,
    );

    expect(detail.rawDetailText).toContain('摘要不能替代完整 JD');
    expect(detail.fullJdText).toBeNull();
    expect(detail.missingFields).toContain('fullJdText');
  });

  it('keeps an external-link detail and records a host warning', () => {
    const detail = parseJobDetail(
      documentFromFixture('job-detail-invalid-link.html'),
      syntheticFixtureJobDetailSelectorProfile,
      { baseUrl: bossBaseUrl },
    );

    expect(detail.jobHrefRaw).toBe(
      'https://evil.example/job/example-detail-invalid',
    );
    expect(detail.jobUrl).toBeNull();
    expect(detail.warnings).toContain('invalid_job_url_host');
  });

  it.each([
    'https://fake-zhipin.com/job/example',
    'https://zhipin.com.evil.example/job/example',
  ])('rejects a deceptive hostname while preserving raw href: %s', (href) => {
    const detail = parseJobDetail(
      documentFromHtml(`
        <main data-fixture-job-detail>
          <a data-fixture-detail-link href="${href}">岗位</a>
        </main>
      `),
      syntheticFixtureJobDetailSelectorProfile,
      { baseUrl: bossBaseUrl },
    );

    expect(detail.jobHrefRaw).toBe(href);
    expect(detail.jobUrl).toBeNull();
    expect(detail.warnings).toContain('invalid_job_url_host');
  });

  it('accepts a valid absolute BOSS URL', () => {
    const href = 'https://zhipin.com/job_detail/example-absolute.html';
    const detail = parseJobDetail(
      documentFromHtml(`
        <main data-fixture-job-detail>
          <a data-fixture-detail-link href="${href}">岗位</a>
        </main>
      `),
      syntheticFixtureJobDetailSelectorProfile,
    );

    expect(detail.jobHrefRaw).toBe(href);
    expect(detail.jobUrl).toBe(href);
  });

  it('does not infer publication or recruiter activity from other fields', () => {
    const detail = parseJobDetail(
      documentFromHtml(`
        <main data-fixture-job-detail>
          <h1 data-fixture-detail-title>今日活跃岗位</h1>
          <p data-fixture-detail-company>三天前成立的示例公司</p>
        </main>
      `),
      syntheticFixtureJobDetailSelectorProfile,
    );

    expect(detail.recruiterActivityText).toBeNull();
    expect(detail.publishedText).toBeNull();
  });

  it.each([
    ['title', '[data-selector-that-does-not-exist]'],
    ['companyName', '[data-selector-that-does-not-exist]'],
  ] as const)(
    'keeps a detail whose %s is missing',
    (missingField, missingSelector) => {
      const profile = {
        ...syntheticFixtureJobDetailSelectorProfile,
        ...(missingField === 'title'
          ? { title: missingSelector }
          : { company: missingSelector }),
      };
      const detail = parseJobDetail(
        documentFromFixture('job-detail-complete.html'),
        profile,
        { baseUrl: bossBaseUrl },
      );

      expect(detail[missingField]).toBeNull();
      expect(detail.missingFields).toContain(missingField);
    },
  );

  it('accepts an Element as the read-only detail root', () => {
    const document = documentFromFixture('job-detail-complete.html');
    const root = document.querySelector('[data-fixture-job-detail]');

    expect(root).not.toBeNull();
    const detail = parseJobDetail(
      root as Element,
      syntheticFixtureJobDetailSelectorProfile,
      { baseUrl: bossBaseUrl },
    );

    expect(detail.title).toBe('测试电商运营助理');
    expect(detail.fullJdText).toContain('1. 负责店铺商品维护');
  });

  it('uses the supplied detail selector profile to drive the parser', () => {
    const detail = parseJobDetail(
      documentFromHtml(`
        <article class="custom-detail">
          <h1 class="custom-title">自定义详情岗位</h1>
          <div class="custom-jd"><p>自定义完整 JD</p></div>
        </article>
      `),
      {
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
        fullJd: '.custom-jd',
      },
    );

    expect(detail.title).toBe('自定义详情岗位');
    expect(detail.fullJdText).toBe('自定义完整 JD');
  });

  it('preserves generic parser textContent semantics for hidden tag descendants', () => {
    const detail = parseJobDetail(
      documentFromHtml(`
        <main data-fixture-job-detail>
          <span data-fixture-detail-tag>直<span hidden>隐藏文本</span>播</span>
        </main>
      `),
      syntheticFixtureJobDetailSelectorProfile,
    );

    expect(detail.tags).toEqual(['直隐藏文本播']);
  });

  it('uses null, empty tags, and controlled missing fields for an empty root', () => {
    const detail = parseJobDetail(
      documentFromHtml('<main data-fixture-job-detail></main>'),
      syntheticFixtureJobDetailSelectorProfile,
    );

    expect(detail.title).toBeNull();
    expect(detail.tags).toEqual([]);
    expect(detail.rawDetailText).toBe('');
    expect(detail.missingFields).toContain('title');
    expect(detail.missingFields).toContain('tags');
    expect(detail.missingFields).toContain('fullJdText');
  });
});
