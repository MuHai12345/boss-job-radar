import { randomUUID } from 'node:crypto';
import type { JobObservationInput } from '../../src/shared/job-observation-types';
import type { ImportRequest } from '../../src/shared/import-request-types';
const time = '2026-09-05T10:00:00.000Z';
export function salaryRequest(salaries: (string | null)[], pageType: 'search_results' | 'job_detail' = 'search_results', capturedAt = time, jobs = salaries.map((_, i) => `job${i}`)): ImportRequest {
  const pageUrl = pageType === 'search_results' ? 'https://www.zhipin.com/web/geek/jobs' : `https://www.zhipin.com/job_detail/${jobs[0]}.html`;
  return {
    clientImportId: randomUUID(),
    source: { pageType, pageUrl, capturedAt, matchedCardCount: pageType === 'search_results' ? salaries.length : null, warnings: [] },
    observations: salaries.map((salaryText, i): JobObservationInput => ({
      capturedAt, pageType, sourcePageUrl: pageUrl, jobUrl: `https://www.zhipin.com/job_detail/${jobs[i]}.html`,
      jobHrefRaw: null, title: '合成岗位', companyName: null, salaryText, locationText: null, experienceText: null,
      educationText: null, tags: [], recruiterActivityText: null, publishedText: null, fullJdText: null,
      rawText: '合成事实', missingFields: [], warnings: [],
    })),
  };
}
