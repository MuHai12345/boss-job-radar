export interface JobCardSelectorProfile {
  card: string;
  title: string;
  company: string;
  salary: string;
  location: string;
  experience: string;
  education: string;
  tags: string | null;
  link: string;
  recruiterActivity: string | null;
  published: string | null;
}

/**
 * This profile is a contract for the repository's hand-authored fixtures only.
 * It is not a verified selector profile for the current BOSS website.
 */
export const syntheticFixtureJobCardSelectorProfile: JobCardSelectorProfile = {
  card: '[data-fixture-job-card]',
  title: '[data-fixture-job-title]',
  company: '[data-fixture-company]',
  salary: '[data-fixture-salary]',
  location: '[data-fixture-location]',
  experience: '[data-fixture-experience]',
  education: '[data-fixture-education]',
  tags: '[data-fixture-tag]',
  link: '[data-fixture-job-link]',
  recruiterActivity: '[data-fixture-recruiter-activity]',
  published: '[data-fixture-published]',
};

/**
 * Verified from user-run Targeted Probes on 2026-09-02 and compared across
 * multiple samples by the external ChatGPT reviewer. This is not an official
 * BOSS API contract and may drift. Unknown fields stay explicit so the parser
 * keeps cards and reports explainable missing fields instead of guessing.
 */
export const verifiedBossJobCardSelectorProfile: JobCardSelectorProfile = {
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
};
