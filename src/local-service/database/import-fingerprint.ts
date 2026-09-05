import { createHash } from 'node:crypto';

import type { ImportRequest } from '../../shared/import-request-types.js';

export function fingerprintImportRequest(request: ImportRequest): string {
  const canonicalPayload = {
    source: {
      pageType: request.source.pageType,
      pageUrl: request.source.pageUrl,
      capturedAt: request.source.capturedAt,
      matchedCardCount: request.source.matchedCardCount,
      warnings: request.source.warnings,
    },
    observations: request.observations.map((observation) => ({
      capturedAt: observation.capturedAt,
      pageType: observation.pageType,
      sourcePageUrl: observation.sourcePageUrl,
      jobHrefRaw: observation.jobHrefRaw,
      jobUrl: observation.jobUrl,
      title: observation.title,
      companyName: observation.companyName,
      salaryText: observation.salaryText,
      locationText: observation.locationText,
      experienceText: observation.experienceText,
      educationText: observation.educationText,
      tags: observation.tags,
      recruiterActivityText: observation.recruiterActivityText,
      publishedText: observation.publishedText,
      fullJdText: observation.fullJdText,
      rawText: observation.rawText,
      missingFields: observation.missingFields,
      warnings: observation.warnings,
    })),
  };

  return createHash('sha256')
    .update(JSON.stringify(canonicalPayload), 'utf8')
    .digest('hex');
}
