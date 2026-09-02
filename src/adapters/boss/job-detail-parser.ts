import {
  isAllowedBossUrl,
  isBossHostname,
  isSupportedHttpProtocol,
} from '../../shared/boss-url-policy';
import { domElementToStructuredText } from './dom-to-text';
import type { JobDetailSelectorProfile } from './job-detail-selector-profile';
import type {
  JobDetailWarningCode,
  ParsedJobDetail,
  ParsedJobDetailMissingField,
} from './job-detail-types';

export interface ParseJobDetailOptions {
  baseUrl?: string;
}

function normalizeText(value: string | null | undefined): string | null {
  const normalized = value?.replace(/\s+/g, ' ').trim();
  return normalized ? normalized : null;
}

function normalizeBaseUrl(baseUrl: string | undefined): string | null {
  if (baseUrl === undefined) {
    return null;
  }

  try {
    const parsedBaseUrl = new URL(baseUrl);
    return isAllowedBossUrl(parsedBaseUrl) ? parsedBaseUrl.href : null;
  } catch {
    return null;
  }
}

function normalizeJobUrl(
  jobHrefRaw: string,
  baseUrl: string | null,
): { jobUrl: string | null; warnings: JobDetailWarningCode[] } {
  let parsedUrl: URL;

  try {
    parsedUrl = new URL(jobHrefRaw);
  } catch {
    if (baseUrl === null) {
      return {
        jobUrl: null,
        warnings: ['relative_job_url_without_valid_base'],
      };
    }

    try {
      parsedUrl = new URL(jobHrefRaw, baseUrl);
    } catch {
      return { jobUrl: null, warnings: ['invalid_job_url'] };
    }
  }

  if (!isSupportedHttpProtocol(parsedUrl.protocol)) {
    return { jobUrl: null, warnings: ['invalid_job_url_protocol'] };
  }

  if (!isBossHostname(parsedUrl.hostname)) {
    return { jobUrl: null, warnings: ['invalid_job_url_host'] };
  }

  return { jobUrl: parsedUrl.href, warnings: [] };
}

function readText(root: Document | Element, selector: string): string | null {
  return normalizeText(root.querySelector(selector)?.textContent);
}

function readRootText(root: Document | Element): string {
  const textContent =
    root.nodeType === 9
      ? (root as Document).documentElement?.textContent
      : root.textContent;
  return normalizeText(textContent) ?? '';
}

export function parseJobDetail(
  root: Document | Element,
  profile: JobDetailSelectorProfile,
  options: ParseJobDetailOptions = {},
): ParsedJobDetail {
  const title = readText(root, profile.title);
  const companyName = readText(root, profile.company);
  const salaryText = readText(root, profile.salary);
  const locationText = readText(root, profile.location);
  const experienceText = readText(root, profile.experience);
  const educationText = readText(root, profile.education);
  const tags = Array.from(root.querySelectorAll(profile.tags))
    .map((tag) => normalizeText(tag.textContent))
    .filter((tag): tag is string => tag !== null);
  const link = root.querySelector(profile.link);
  const hrefAttribute = link?.getAttribute('href') ?? null;
  const jobHrefRaw = normalizeText(hrefAttribute) === null ? null : hrefAttribute;
  const recruiterActivityText = readText(root, profile.recruiterActivity);
  const publishedText = readText(root, profile.published);
  const fullJdContainer = root.querySelector(profile.fullJd);
  const fullJdText =
    fullJdContainer === null
      ? null
      : domElementToStructuredText(fullJdContainer);
  const rawDetailText = readRootText(root);

  const missingFields: ParsedJobDetailMissingField[] = [];
  const observableFields: Array<
    readonly [ParsedJobDetailMissingField, string | null | string[]]
  > = [
    ['title', title],
    ['companyName', companyName],
    ['salaryText', salaryText],
    ['locationText', locationText],
    ['experienceText', experienceText],
    ['educationText', educationText],
    ['tags', tags],
    ['jobHrefRaw', jobHrefRaw],
    ['recruiterActivityText', recruiterActivityText],
    ['publishedText', publishedText],
    ['fullJdText', fullJdText],
  ];

  for (const [field, value] of observableFields) {
    if (value === null || (Array.isArray(value) && value.length === 0)) {
      missingFields.push(field);
    }
  }

  const baseUrl = normalizeBaseUrl(options.baseUrl);
  const warnings: JobDetailWarningCode[] =
    options.baseUrl !== undefined && baseUrl === null
      ? ['invalid_base_url']
      : [];
  const urlResult =
    jobHrefRaw === null
      ? { jobUrl: null, warnings: [] }
      : normalizeJobUrl(jobHrefRaw, baseUrl);
  warnings.push(...urlResult.warnings);

  return {
    title,
    companyName,
    salaryText,
    locationText,
    experienceText,
    educationText,
    tags,
    jobHrefRaw,
    jobUrl: urlResult.jobUrl,
    recruiterActivityText,
    publishedText,
    fullJdText,
    rawDetailText,
    missingFields,
    warnings,
  };
}
