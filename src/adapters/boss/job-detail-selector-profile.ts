export interface JobDetailSelectorProfile {
  title: string;
  company: string;
  salary: string;
  location: string;
  experience: string;
  education: string;
  tags: string;
  link: string | null;
  recruiterActivity: string;
  published: string | null;
  fullJd: string;
}

/**
 * This profile describes only the repository's hand-authored detail fixtures.
 * It is not a verified selector profile for the current BOSS website.
 */
export const syntheticFixtureJobDetailSelectorProfile: JobDetailSelectorProfile =
  {
    title: '[data-fixture-detail-title]',
    company: '[data-fixture-detail-company]',
    salary: '[data-fixture-detail-salary]',
    location: '[data-fixture-detail-location]',
    experience: '[data-fixture-detail-experience]',
    education: '[data-fixture-detail-education]',
    tags: '[data-fixture-detail-tag]',
    link: '[data-fixture-detail-link]',
    recruiterActivity: '[data-fixture-detail-recruiter-activity]',
    published: '[data-fixture-detail-published]',
    fullJd: '[data-fixture-detail-full-jd]',
  };

/**
 * Verified from user-run Targeted Probes on 2026-09-02 and compared across
 * multiple samples by the external ChatGPT reviewer. This is not an official
 * BOSS API contract and may drift. Unknown fields stay explicit so the parser
 * reports missing data rather than guessing selectors or dropping the detail.
 */
export const verifiedBossJobDetailSelectorProfile: JobDetailSelectorProfile = {
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
};
