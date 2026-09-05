import {
  canonicalCheckableJobUrl, validateJobLinkCheckRequest, type JobLinkCheckRequest,
} from '../shared/job-link-check-types';
import type { StructuredPageExtractionResult } from './structured-page-extraction-types';
import type { JobLinkStatusProbe } from './job-link-status-probe';
import type { StructuredPageExtractionTab } from './structured-page-extraction-request';

export interface ManualLinkInspection {
  readonly before: JobLinkStatusProbe;
  readonly after: JobLinkStatusProbe;
  readonly extraction: StructuredPageExtractionResult | undefined;
  readonly documentStable: boolean;
}
export type ExecuteManualLinkInspection = (tabId: number, jobUrl: string) => Promise<ManualLinkInspection | undefined>;

export async function requestJobLinkCheck(
  tab: StructuredPageExtractionTab, execute: ExecuteManualLinkInspection,
): Promise<JobLinkCheckRequest | null> {
  const jobUrl = canonicalCheckableJobUrl(tab.url);
  if (jobUrl === null || tab.id === undefined) return null;
  let request: JobLinkCheckRequest = { jobUrl, observedAt: new Date().toISOString(), status: 'unknown', markerCode: null };
  try {
    const inspection = await execute(tab.id, jobUrl);
    if (!inspection || !inspection.documentStable || !inspection.before.pageMatches || !inspection.after.pageMatches
      || inspection.before.challenge || inspection.after.challenge) return request;
    const { extraction, after } = inspection;
    request = { ...request, observedAt: after.observedAt };
    // Scripting failures and navigation never support an explicit unavailable conclusion.
    if (extraction?.pageType !== 'job_detail' || canonicalCheckableJobUrl(extraction.pageUrl) !== jobUrl) return request;
    if (extraction.detail !== null && canonicalCheckableJobUrl(extraction.detail.jobUrl) === jobUrl) {
      request = { ...request, status: 'available' };
    } else if (extraction.detail === null && after.markerCode !== null) {
      request = { ...request, status: 'explicitly_unavailable', markerCode: after.markerCode };
    }
    return validateJobLinkCheckRequest(request);
  } catch {
    return request;
  }
}
