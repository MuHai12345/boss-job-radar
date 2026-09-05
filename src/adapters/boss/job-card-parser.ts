import {
  canonicalBossJobUrl,
  isAllowedBossUrl,
  isBossHostname,
  isSupportedHttpProtocol,
} from '../../shared/boss-url-policy';
import type {
  JobCardParseResult,
  JobCardWarningCode,
  ParsedJobCard,
  ParsedJobCardMissingField,
} from './job-card-types';
import { verifiedBossJobCardSelectorProfile } from './selector-profile';
import type { JobCardSelectorProfile } from './selector-profile';

export interface ParseJobCardsOptions {
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
): { jobUrl: string | null; warnings: JobCardWarningCode[] } {
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

function normalizeVerifiedJobUrl(
  jobHrefRaw: string,
  baseUrl: string | null,
): { jobUrl: string | null; warnings: JobCardWarningCode[] } {
  const normalized = normalizeJobUrl(jobHrefRaw, baseUrl);
  if (normalized.jobUrl === null) {
    return normalized;
  }

  const parsedUrl = new URL(normalized.jobUrl);
  if (
    parsedUrl.username !== '' ||
    parsedUrl.password !== '' ||
    !/^\/job_detail\/[^/]+\.html$/.test(parsedUrl.pathname)
  ) {
    return { jobUrl: null, warnings: ['invalid_job_url'] };
  }

  return { jobUrl: canonicalBossJobUrl(parsedUrl.href), warnings: [] };
}

function readText(card: Element, selector: string | null): string | null {
  if (selector === null) {
    return null;
  }
  return normalizeText(card.querySelector(selector)?.textContent);
}

function parseCard(
  card: Element,
  profile: JobCardSelectorProfile,
  baseUrl: string | null,
  useVerifiedJobUrlPolicy: boolean,
): ParsedJobCard {
  const title = readText(card, profile.title);
  const companyName = readText(card, profile.company);
  const salaryText = readText(card, profile.salary);
  const locationText = readText(card, profile.location);
  const experienceText = readText(card, profile.experience);
  const educationText = readText(card, profile.education);
  const tags = Array.from(
    profile.tags === null ? [] : card.querySelectorAll(profile.tags),
  )
    .map((tag) => normalizeText(tag.textContent))
    .filter((tag): tag is string => tag !== null);
  const link = profile.link === null ? null : card.querySelector(profile.link);
  const hrefAttribute = link?.getAttribute('href') ?? null;
  const observedJobHrefRaw =
    normalizeText(hrefAttribute) === null ? null : hrefAttribute;
  const urlResult =
    observedJobHrefRaw === null
      ? { jobUrl: null, warnings: [] }
      : useVerifiedJobUrlPolicy
      ? normalizeVerifiedJobUrl(observedJobHrefRaw, baseUrl)
      : normalizeJobUrl(observedJobHrefRaw, baseUrl);
  const jobHrefRaw = useVerifiedJobUrlPolicy
    ? urlResult.jobUrl
    : observedJobHrefRaw;
  const recruiterActivityText = readText(card, profile.recruiterActivity);
  const publishedText = readText(card, profile.published);
  const rawCardText = normalizeText(card.textContent) ?? '';

  const missingFields: ParsedJobCardMissingField[] = [];
  const observableFields: Array<
    readonly [ParsedJobCardMissingField, string | null | string[]]
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
  ];

  for (const [field, value] of observableFields) {
    if (value === null || (Array.isArray(value) && value.length === 0)) {
      missingFields.push(field);
    }
  }

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
    rawCardText,
    missingFields,
    warnings: urlResult.warnings,
  };
}

function parseJobCardsWithPolicy(
  root: Document | Element,
  profile: JobCardSelectorProfile,
  options: ParseJobCardsOptions,
  useVerifiedJobUrlPolicy: boolean,
): JobCardParseResult {
  const baseUrl = normalizeBaseUrl(options.baseUrl);
  const warnings =
    options.baseUrl !== undefined && baseUrl === null
      ? (['invalid_base_url'] as const)
      : [];

  return {
    cards: Array.from(root.querySelectorAll(profile.card)).map((card) =>
      parseCard(card, profile, baseUrl, useVerifiedJobUrlPolicy),
    ),
    warnings: [...warnings],
  };
}

export function parseJobCards(
  root: Document | Element,
  profile: JobCardSelectorProfile,
  options: ParseJobCardsOptions = {},
): JobCardParseResult {
  return parseJobCardsWithPolicy(root, profile, options, false);
}

export function parseVerifiedBossJobCards(
  root: Document | Element,
  options: ParseJobCardsOptions = {},
): JobCardParseResult {
  return parseJobCardsWithPolicy(
    root,
    verifiedBossJobCardSelectorProfile,
    options,
    true,
  );
}
