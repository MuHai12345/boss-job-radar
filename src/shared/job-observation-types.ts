export interface JobObservationInput {
  readonly capturedAt: string;
  readonly pageType: 'search_results' | 'job_detail';
  readonly sourcePageUrl: string;
  readonly jobHrefRaw: string | null;
  readonly jobUrl: string | null;
  readonly title: string | null;
  readonly companyName: string | null;
  readonly salaryText: string | null;
  readonly locationText: string | null;
  readonly experienceText: string | null;
  readonly educationText: string | null;
  readonly tags: string[];
  readonly recruiterActivityText: string | null;
  readonly publishedText: string | null;
  readonly fullJdText: string | null;
  readonly rawText: string;
  readonly missingFields: string[];
  readonly warnings: string[];
}
