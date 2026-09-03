import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { Window } from 'happy-dom';
import { describe, expect, it } from 'vitest';

import { parseVerifiedBossJobDetail } from '../src/adapters/boss/job-detail-parser';
import { verifiedBossJobDetailSelectorProfile } from '../src/adapters/boss/job-detail-selector-profile';

const fixtureDirectory = new URL('./fixtures/boss-verified-shape/', import.meta.url);

function fixtureDocument(name: string): Document {
  const window = new Window();
  window.document.write(
    readFileSync(fileURLToPath(new URL(name, fixtureDirectory)), 'utf8'),
  );
  window.document.close();
  return window.document as unknown as Document;
}

describe('verifiedBossJobDetailSelectorProfile', () => {
  it('contains only the manually verified detail selectors', () => {
    expect(verifiedBossJobDetailSelectorProfile).toEqual({
      title: '.info-primary .name h1',
      company: '.job-sider .company-info',
      salary: '.info-primary .salary',
      location: '.info-primary .text-desc.text-city',
      experience: '.info-primary .text-desc.text-experiece',
      education: '.info-primary .text-desc.text-degree',
      tags: '.job-keyword-list > li',
      link: null,
      recruiterActivity: '.boss-active-time',
      published: null,
      fullJd: '.job-sec-text',
    });
  });

  it.each([
    [
      'job-detail-a.html',
      'example-a',
      '虚构电商运营助理 A',
      '公司 A',
      '6-9K·13薪',
      '上海',
      '经验不限',
      '大专',
      ['店铺运营', '数据分析'],
      '招聘者 A 今日活跃',
      'CURRENT_JOB_JD\n维护商品资料\n协助活动报名',
    ],
    [
      'job-detail-b.html',
      'example-b',
      '虚构天猫运营助理 B',
      '公司 B…',
      '7-10K',
      '上海·徐汇区',
      '1年以内',
      '本科',
      ['天猫', '活动运营'],
      '招聘者 B 刚刚活跃',
      '负责店铺日常运营\n跟进营销活动',
    ],
    [
      'job-detail-c.html',
      'example-c',
      '虚构商品运营助理 C',
      '公司 C',
      '8-12K',
      '上海·静安区',
      '在校/应届',
      '大专',
      ['商品维护', '基础数据'],
      '招聘者 C 本周活跃',
      '整理商品信息\n核对页面内容',
    ],
  ])(
    'parses verified-shape fixture %s without mixing surrounding job-box text into JD',
    (
      fixture,
      slug,
      title,
      companyName,
      salaryText,
      locationText,
      experienceText,
      educationText,
      tags,
      recruiterActivityText,
      fullJdText,
    ) => {
      const detail = parseVerifiedBossJobDetail(fixtureDocument(fixture), {
        currentPageUrl: `https://www.zhipin.com/job_detail/${slug}.html?securityId=SECRET#private`,
      });

      expect(detail).toMatchObject({
        title,
        companyName,
        salaryText,
        locationText,
        experienceText,
        educationText,
        tags,
        recruiterActivityText,
        publishedText: null,
        fullJdText,
        jobHrefRaw: `https://www.zhipin.com/job_detail/${slug}.html`,
        jobUrl: `https://www.zhipin.com/job_detail/${slug}.html`,
        missingFields: ['publishedText'],
        warnings: [],
      });
      expect(detail.fullJdText).not.toMatch(
        /公司|招聘者|安全提示|推荐岗位|PRIVATE_/,
      );
    },
  );

  it('scopes verified raw detail text to the current full JD container', () => {
    const detail = parseVerifiedBossJobDetail(
      fixtureDocument('job-detail-a.html'),
      {
        currentPageUrl:
          'https://www.zhipin.com/job_detail/example-a.html?securityId=SYNTHETIC#private',
      },
    );

    expect(detail.rawDetailText).toContain('CURRENT_JOB_JD');
    expect(detail.fullJdText).toContain('CURRENT_JOB_JD');
    for (const excludedText of [
      'PRIVATE_ACCOUNT_NAV',
      'PRIVATE_SCRIPT',
      'PRIVATE_STYLE',
      'PRIVATE_NOSCRIPT',
      'PRIVATE_TEMPLATE',
      'PRIVATE_COMPETITION',
      'PRIVATE_SECURITY',
      'PRIVATE_RECOMMENDATION',
    ]) {
      expect(detail.rawDetailText).not.toContain(excludedText);
      expect(detail.fullJdText).not.toContain(excludedText);
    }
  });

  it('removes the verified BOSS attribution marker from tags before whitespace normalization', () => {
    const detail = parseVerifiedBossJobDetail(
      fixtureDocument('job-detail-tag-attribution.html'),
      {
        currentPageUrl:
          'https://www.zhipin.com/job_detail/example-tag-attribution.html',
      },
    );

    expect(detail.tags).toEqual(['直播电商', '电商运营', '常规标签']);
    expect(detail.missingFields).not.toContain('tags');
  });

  it('drops verified tags that contain only the attribution marker', () => {
    const document = fixtureDocument('job-detail-tag-attribution.html');
    const tagList = document.querySelector('.job-keyword-list');
    if (tagList === null) {
      throw new Error('Expected the synthetic tag list fixture.');
    }
    tagList.innerHTML = '<li> 来自BOSS直聘 </li><li>来自BOSS直聘</li>';

    const detail = parseVerifiedBossJobDetail(document, {
      currentPageUrl:
        'https://www.zhipin.com/job_detail/example-tag-attribution.html',
    });

    expect(detail.tags).toEqual([]);
    expect(detail.missingFields).toContain('tags');
  });

  it.each([
    'https://evil.example/job_detail/example-a.html',
    'https://user:password@www.zhipin.com/job_detail/example-a.html',
    'javascript:https://www.zhipin.com/job_detail/example-a.html',
    'https://www.zhipin.com/web/geek/jobs',
    'https://www.zhipin.com/job_detail/nested/example-a.html',
  ])('rejects invalid currentPageUrl without falling back to a recommended link: %s', (url) => {
    const detail = parseVerifiedBossJobDetail(
      fixtureDocument('job-detail-a.html'),
      { currentPageUrl: url },
    );

    expect(detail.jobHrefRaw).toBeNull();
    expect(detail.jobUrl).toBeNull();
    expect(detail.missingFields).toContain('jobHrefRaw');
    expect(detail.warnings).toContain('invalid_current_page_url');
    expect(JSON.stringify(detail)).not.toContain('recommended-a.html');
  });
});
