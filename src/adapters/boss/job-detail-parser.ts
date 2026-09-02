import {
  isAllowedBossUrl,
  isBossHostname,
  isSupportedHttpProtocol,
} from '../../shared/boss-url-policy';
import { domElementToStructuredText } from './dom-to-text';
import { verifiedBossJobDetailSelectorProfile } from './job-detail-selector-profile';
import type { JobDetailSelectorProfile } from './job-detail-selector-profile';
import type {
  JobDetailWarningCode,
  ParsedJobDetail,
  ParsedJobDetailMissingField,
} from './job-detail-types';

export interface ParseJobDetailOptions {
  baseUrl?: string;
  currentPageUrl?: string;
  rawDetailSelector?: string;
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

function readText(
  root: Document | Element,
  selector: string | null,
): string | null {
  if (selector === null) {
    return null;
  }
  return normalizeText(root.querySelector(selector)?.textContent);
}

function normalizeCurrentPageUrl(currentPageUrl: string): string | null {
  try {
    const parsedUrl = new URL(currentPageUrl);
    if (
      !isSupportedHttpProtocol(parsedUrl.protocol) ||
      !isBossHostname(parsedUrl.hostname) ||
      parsedUrl.username !== '' ||
      parsedUrl.password !== '' ||
      !/^\/job_detail\/[^/]+\.html$/.test(parsedUrl.pathname)
    ) {
      return null;
    }
    parsedUrl.search = '';
    parsedUrl.hash = '';
    return parsedUrl.href;
  } catch {
    return null;
  }
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
  const tags = Array.from(
    profile.tags === null ? [] : root.querySelectorAll(profile.tags),
  )
    .map((tag) => normalizeText(tag.textContent))
    .filter((tag): tag is string => tag !== null);
  const link = profile.link === null ? null : root.querySelector(profile.link);
  const hrefAttribute = link?.getAttribute('href') ?? null;
  const normalizedCurrentPageUrl =
    options.currentPageUrl === undefined
      ? undefined
      : normalizeCurrentPageUrl(options.currentPageUrl);
  const jobHrefRaw =
    normalizedCurrentPageUrl === undefined
      ? normalizeText(hrefAttribute) === null
        ? null
        : hrefAttribute
      : normalizedCurrentPageUrl;
  const recruiterActivityText = readText(root, profile.recruiterActivity);
  const publishedText = readText(root, profile.published);
  const fullJdContainer =
    profile.fullJd === null ? null : root.querySelector(profile.fullJd);
  const fullJdText =
    fullJdContainer === null
      ? null
      : domElementToStructuredText(fullJdContainer);
  const rawDetailContainer =
    options.rawDetailSelector === undefined
      ? undefined
      : options.rawDetailSelector === profile.fullJd
      ? fullJdContainer
      : root.querySelector(options.rawDetailSelector);
  const rawDetailText =
    rawDetailContainer === undefined
      ? readRootText(root)
      : rawDetailContainer === null
      ? ''
      : domElementToStructuredText(rawDetailContainer) ?? '';

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

  const baseUrl =
    options.currentPageUrl === undefined
      ? normalizeBaseUrl(options.baseUrl)
      : null;
  const warnings: JobDetailWarningCode[] =
    options.currentPageUrl !== undefined && normalizedCurrentPageUrl === null
      ? ['invalid_current_page_url']
      : options.currentPageUrl === undefined &&
          options.baseUrl !== undefined &&
          baseUrl === null
      ? ['invalid_base_url']
      : [];
  const urlResult =
    normalizedCurrentPageUrl !== undefined
      ? { jobUrl: normalizedCurrentPageUrl, warnings: [] }
      : jobHrefRaw === null
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

export function parseVerifiedBossJobDetail(
  root: Document | Element,
  options: ParseJobDetailOptions = {},
): ParsedJobDetail {
  return parseJobDetail(root, verifiedBossJobDetailSelectorProfile, {
    ...options,
    rawDetailSelector: verifiedBossJobDetailSelectorProfile.fullJd,
  });
}
