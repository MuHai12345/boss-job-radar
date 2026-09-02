export interface JobCardSelectorProfile {
  card: string;
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
