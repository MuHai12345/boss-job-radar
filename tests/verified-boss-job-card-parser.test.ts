import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { Window } from 'happy-dom';
import { describe, expect, it } from 'vitest';

import { parseVerifiedBossJobCards } from '../src/adapters/boss/job-card-parser';
import { verifiedBossJobCardSelectorProfile } from '../src/adapters/boss/selector-profile';

const fixtureUrl = new URL(
  './fixtures/boss-verified-shape/job-list.html',
  import.meta.url,
);

function documentFromHtml(html: string): Document {
  const window = new Window();
  window.document.write(html);
  window.document.close();
  return window.document as unknown as Document;
}

function fixtureDocument(): Document {
  return documentFromHtml(readFileSync(fileURLToPath(fixtureUrl), 'utf8'));
}

describe('verifiedBossJobCardSelectorProfile', () => {
  it('contains only the manually verified search selectors', () => {
    expect(verifiedBossJobCardSelectorProfile).toEqual({
      card: 'li.job-card-box',
      title: '.job-name',
      company: '.boss-name',
      salary: '.job-salary',
      location: '.company-location',
      experience: '.tag-list > li:nth-child(1)',
      education: '.tag-list > li:nth-child(2)',
      tags: null,
      link: '.job-name',
      recruiterActivity: null,
      published: null,
    });
  });

  it('parses every card, preserves raw PUA salary, and explains unavailable fields', () => {
    const result = parseVerifiedBossJobCards(fixtureDocument(), {
      baseUrl: 'https://www.zhipin.com/web/geek/jobs',
    });

    expect(result.warnings).toEqual([]);
    expect(result.cards).toHaveLength(2);
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
      warnings: [],
    });
    expect(result.cards[1]).toMatchObject({
      title: '虚构店铺运营助理 B',
      companyName: null,
      salaryText: '7-10K',
      tags: [],
      missingFields: [
        'companyName',
        'tags',
        'recruiterActivityText',
        'publishedText',
      ],
    });
  });

  it('removes query and hash from every verified card URL field', () => {
    const result = parseVerifiedBossJobCards(fixtureDocument(), {
      baseUrl: 'https://www.zhipin.com/web/geek/jobs?query=SYNTHETIC',
    });
    const serialized = JSON.stringify(result);

    expect(result.cards[0]).toMatchObject({
      jobHrefRaw: 'https://www.zhipin.com/job_detail/example-a.html',
      jobUrl: 'https://www.zhipin.com/job_detail/example-a.html',
    });
    expect(serialized).not.toMatch(
      /securityId|TEST_SECRET|ka=tracking|#private/,
    );
  });

  it.each([
    'https://user:password@www.zhipin.com/job_detail/example-a.html',
    'https://evil.example/job_detail/example-a.html',
    'javascript:alert(1)',
  ])('rejects unsafe verified card URL without preserving its raw value: %s', (href) => {
    const result = parseVerifiedBossJobCards(
      documentFromHtml(`
        <li class="job-card-box">
          <a class="job-name" href="${href}">虚构岗位</a>
        </li>
      `),
      { baseUrl: 'https://www.zhipin.com/web/geek/jobs' },
    );

    expect(result.cards[0]?.jobHrefRaw).toBeNull();
    expect(result.cards[0]?.jobUrl).toBeNull();
    expect(result.cards[0]?.missingFields).toContain('jobHrefRaw');
  });
});
