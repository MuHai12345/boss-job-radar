export type ParsedJobDetailMissingField =
  | 'title'
  | 'companyName'
  | 'salaryText'
  | 'locationText'
  | 'experienceText'
  | 'educationText'
  | 'tags'
  | 'jobHrefRaw'
  | 'recruiterActivityText'
  | 'publishedText'
  | 'fullJdText';

export type JobDetailWarningCode =
  | 'invalid_base_url'
  | 'invalid_job_url'
  | 'invalid_job_url_protocol'
  | 'invalid_job_url_host'
  | 'relative_job_url_without_valid_base';

export interface ParsedJobDetail {
  title: string | null;
  companyName: string | null;
  salaryText: string | null;
  locationText: string | null;
  experienceText: string | null;
  educationText: string | null;
  tags: string[];
  jobHrefRaw: string | null;
  jobUrl: string | null;
  recruiterActivityText: string | null;
  publishedText: string | null;
  fullJdText: string | null;
  rawDetailText: string;
  missingFields: ParsedJobDetailMissingField[];
  warnings: JobDetailWarningCode[];
}
