import type { StructuredPageExtractionResult } from '../page-extraction/structured-page-extraction-types';
import type { JobObservationInput } from '../shared/job-observation-types';

export function mapStructuredExtractionToObservations(
  result: StructuredPageExtractionResult,
): JobObservationInput[] {
  if (result.pageType === 'search_results') {
    return result.cards.map((card) => ({
      capturedAt: result.capturedAt,
      pageType: 'search_results',
      sourcePageUrl: result.pageUrl,
      jobHrefRaw: card.jobHrefRaw,
      jobUrl: card.jobUrl,
      title: card.title,
      companyName: card.companyName,
      salaryText: card.salaryText,
      locationText: card.locationText,
      experienceText: card.experienceText,
      educationText: card.educationText,
      tags: [...card.tags],
      recruiterActivityText: card.recruiterActivityText,
      publishedText: card.publishedText,
      fullJdText: null,
      rawText: card.rawCardText,
      missingFields: [...card.missingFields],
      warnings: [...result.warnings, ...card.warnings],
    }));
  }

  if (result.pageType === 'job_detail' && result.detail !== null) {
    const detail = result.detail;
    return [
      {
        capturedAt: result.capturedAt,
        pageType: 'job_detail',
        sourcePageUrl: result.pageUrl,
        jobHrefRaw: detail.jobHrefRaw,
        jobUrl: detail.jobUrl,
        title: detail.title,
        companyName: detail.companyName,
        salaryText: detail.salaryText,
        locationText: detail.locationText,
        experienceText: detail.experienceText,
        educationText: detail.educationText,
        tags: [...detail.tags],
        recruiterActivityText: detail.recruiterActivityText,
        publishedText: detail.publishedText,
        fullJdText: detail.fullJdText,
        rawText: detail.rawDetailText,
        missingFields: [...detail.missingFields],
        warnings: [...result.warnings, ...detail.warnings],
      },
    ];
  }

  return [];
}
