export interface JobDetailSelectorProfile {
  title: string;
  company: string;
  salary: string;
  location: string;
  experience: string;
  education: string;
  tags: string;
  link: string;
  recruiterActivity: string;
  published: string;
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
