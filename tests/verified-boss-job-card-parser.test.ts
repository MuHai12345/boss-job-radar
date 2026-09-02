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

function fixtureDocument(): Document {
  const window = new Window();
  window.document.write(readFileSync(fileURLToPath(fixtureUrl), 'utf8'));
  window.document.close();
  return window.document as unknown as Document;
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
      jobHrefRaw: '/job_detail/example-a.html',
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
});
