export type ParsedJobCardMissingField =
  | 'title'
  | 'companyName'
  | 'salaryText'
  | 'locationText'
  | 'experienceText'
  | 'educationText'
  | 'tags'
  | 'jobHrefRaw'
  | 'recruiterActivityText'
  | 'publishedText';

export type JobCardWarningCode =
  | 'invalid_job_url'
  | 'invalid_job_url_protocol'
  | 'invalid_job_url_host'
  | 'relative_job_url_without_valid_base';

export type ParseWarningCode = 'invalid_base_url';

export interface ParsedJobCard {
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
  rawCardText: string;
  missingFields: ParsedJobCardMissingField[];
  warnings: JobCardWarningCode[];
}

export interface JobCardParseResult {
  cards: ParsedJobCard[];
  warnings: ParseWarningCode[];
}
