import type {
  StructuredPageExtractionResult,
  StructuredPageType,
  VerifiedBossSelectorProfiles,
} from './structured-page-extraction-types';

/**
 * This function is passed directly to the MV3 scripting API. All runtime
 * dependencies must remain inside the function body. Verified selector
 * profiles are supplied as JSON-safe arguments by the popup entrypoint.
 */
export function runVerifiedBossStructuredExtraction(
  profiles: VerifiedBossSelectorProfiles,
): StructuredPageExtractionResult {
  const cardLimit = 100;
  const verifiedBossDetailTagAttributionMarker = '来自BOSS直聘';
  const blockElementNames = new Set([
    'ARTICLE',
    'BLOCKQUOTE',
    'DD',
    'DIV',
    'DL',
    'DT',
    'H1',
    'H2',
    'H3',
    'H4',
    'H5',
    'H6',
    'HEADER',
    'LI',
    'OL',
    'P',
    'PRE',
    'SECTION',
    'TABLE',
    'TR',
    'UL',
  ]);
  const excludedStructuredTextElementNames = new Set([
    'SCRIPT',
    'STYLE',
    'NOSCRIPT',
    'TEMPLATE',
  ]);

  function normalizeText(value: string | null | undefined): string | null {
    const normalized = value?.replace(/\s+/g, ' ').trim();
    return normalized ? normalized : null;
  }

  function isBossHostname(hostname: string): boolean {
    const normalizedHostname = hostname.toLowerCase();
    return (
      normalizedHostname === 'zhipin.com' ||
      normalizedHostname.endsWith('.zhipin.com')
    );
  }

  function classifyPage(url: URL): StructuredPageType {
    if (
      (url.protocol !== 'http:' && url.protocol !== 'https:') ||
      !isBossHostname(url.hostname) ||
      url.username !== '' ||
      url.password !== ''
    ) {
      return 'unsupported';
    }
    if (url.pathname === '/web/geek/jobs') {
      return 'search_results';
    }
    if (/^\/job_detail\/[^/]+\.html$/.test(url.pathname)) {
      return 'job_detail';
    }
    return 'unsupported';
  }

  function safePageIdentity(url: URL): string {
    return `${url.protocol}//${url.hostname}${url.pathname}`;
  }

  function normalizeVerifiedJobUrl(
    href: string,
    baseUrl: string,
  ): {
    jobUrl: string | null;
    warnings: Array<
      | 'invalid_job_url'
      | 'invalid_job_url_protocol'
      | 'invalid_job_url_host'
      | 'relative_job_url_without_valid_base'
    >;
  } {
    let parsedUrl: URL;
    try {
      parsedUrl = new URL(href);
    } catch {
      try {
        parsedUrl = new URL(href, baseUrl);
      } catch {
        return { jobUrl: null, warnings: ['invalid_job_url'] };
      }
    }

    if (parsedUrl.protocol !== 'http:' && parsedUrl.protocol !== 'https:') {
      return { jobUrl: null, warnings: ['invalid_job_url_protocol'] };
    }
    if (!isBossHostname(parsedUrl.hostname)) {
      return { jobUrl: null, warnings: ['invalid_job_url_host'] };
    }
    if (
      parsedUrl.username !== '' ||
      parsedUrl.password !== '' ||
      !/^\/job_detail\/[^/]+\.html$/.test(parsedUrl.pathname)
    ) {
      return { jobUrl: null, warnings: ['invalid_job_url'] };
    }

    parsedUrl.search = '';
    parsedUrl.hash = '';
    return { jobUrl: parsedUrl.href, warnings: [] };
  }

  function readText(root: ParentNode, selector: string | null): string | null {
    if (selector === null) {
      return null;
    }
    return normalizeText(root.querySelector(selector)?.textContent);
  }

  function appendStructuredNodeText(node: Node, chunks: string[]): void {
    if (node.nodeType === 3) {
      chunks.push(node.textContent?.replace(/\s+/g, ' ') ?? '');
      return;
    }
    if (node.nodeType !== 1) {
      for (const child of node.childNodes) {
        appendStructuredNodeText(child, chunks);
      }
      return;
    }

    const element = node as Element;
    if (excludedStructuredTextElementNames.has(element.tagName)) {
      return;
    }
    if (element.tagName === 'BR') {
      chunks.push('\n');
      return;
    }

    const isBlock = blockElementNames.has(element.tagName);
    if (isBlock) {
      chunks.push('\n');
    }
    for (const child of element.childNodes) {
      appendStructuredNodeText(child, chunks);
    }
    if (isBlock) {
      chunks.push('\n');
    }
  }

  function structuredText(element: Element): string | null {
    const chunks: string[] = [];
    for (const child of element.childNodes) {
      appendStructuredNodeText(child, chunks);
    }
    const normalized = chunks
      .join('')
      .replace(/[\t\f\v\u00a0 ]+/g, ' ')
      .replace(/ *\n */g, '\n')
      .replace(/\n+/g, '\n')
      .trim();
    return normalized === '' ? null : normalized;
  }

  function parseCard(card: Element, pageUrl: string) {
    const profile = profiles.cardProfile;
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
        : normalizeVerifiedJobUrl(observedJobHrefRaw, pageUrl);
    const recruiterActivityText = readText(card, profile.recruiterActivity);
    const publishedText = readText(card, profile.published);
    const rawCardText = normalizeText(card.textContent) ?? '';
    const missingFields: Array<
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
    > = [];
    const observableFields = [
      ['title', title],
      ['companyName', companyName],
      ['salaryText', salaryText],
      ['locationText', locationText],
      ['experienceText', experienceText],
      ['educationText', educationText],
      ['tags', tags],
      ['jobHrefRaw', urlResult.jobUrl],
      ['recruiterActivityText', recruiterActivityText],
      ['publishedText', publishedText],
    ] as const;
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
      jobHrefRaw: urlResult.jobUrl,
      jobUrl: urlResult.jobUrl,
      recruiterActivityText,
      publishedText,
      rawCardText,
      missingFields,
      warnings: urlResult.warnings,
    };
  }

  function parseDetail(root: ParentNode, pageUrl: string) {
    const profile = profiles.detailProfile;
    const title = readText(root, profile.title);
    const companyName = readText(root, profile.company);
    const salaryText = readText(root, profile.salary);
    const locationText = readText(root, profile.location);
    const experienceText = readText(root, profile.experience);
    const educationText = readText(root, profile.education);
    const tags = Array.from(
      profile.tags === null ? [] : root.querySelectorAll(profile.tags),
    )
      .map((tag) =>
        normalizeText(
          tag.textContent?.replaceAll(
            verifiedBossDetailTagAttributionMarker,
            '',
          ),
        ),
      )
      .filter((tag): tag is string => tag !== null);
    const recruiterActivityText = readText(root, profile.recruiterActivity);
    const publishedText = readText(root, profile.published);
    const fullJdContainer =
      profile.fullJd === null ? null : root.querySelector(profile.fullJd);
    const fullJdText =
      fullJdContainer === null ? null : structuredText(fullJdContainer);
    const rawDetailText = fullJdText ?? '';
    const missingFields: Array<
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
      | 'fullJdText'
    > = [];
    const observableFields = [
      ['title', title],
      ['companyName', companyName],
      ['salaryText', salaryText],
      ['locationText', locationText],
      ['experienceText', experienceText],
      ['educationText', educationText],
      ['tags', tags],
      ['jobHrefRaw', pageUrl],
      ['recruiterActivityText', recruiterActivityText],
      ['publishedText', publishedText],
      ['fullJdText', fullJdText],
    ] as const;
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
      jobHrefRaw: pageUrl,
      jobUrl: pageUrl,
      recruiterActivityText,
      publishedText,
      fullJdText,
      rawDetailText,
      missingFields,
      warnings: [],
    };
  }

  const currentUrl = new URL(document.location.href);
  const pageType = classifyPage(currentUrl);
  const pageUrl = safePageIdentity(currentUrl);
  const capturedAt = new Date().toISOString();
  const body = document.body;

  if (pageType === 'unsupported') {
    return {
      pageType,
      pageUrl,
      capturedAt,
      matchedCardCount: null,
      cards: [],
      detail: null,
      warnings: ['unsupported_page'],
    };
  }
  if (body === null) {
    return {
      pageType,
      pageUrl,
      capturedAt,
      matchedCardCount: pageType === 'search_results' ? 0 : null,
      cards: [],
      detail: null,
      warnings: ['body_missing'],
    };
  }
  if (pageType === 'search_results') {
    const matchedCards = Array.from(
      body.querySelectorAll(profiles.cardProfile.card),
    );
    return {
      pageType,
      pageUrl,
      capturedAt,
      matchedCardCount: matchedCards.length,
      cards: matchedCards
        .slice(0, cardLimit)
        .map((card) => parseCard(card, currentUrl.href)),
      detail: null,
      warnings:
        matchedCards.length === 0
          ? ['no_job_cards']
          : matchedCards.length > cardLimit
            ? ['card_limit_reached']
            : [],
    };
  }

  return {
    pageType,
    pageUrl,
    capturedAt,
    matchedCardCount: null,
    cards: [],
    detail: parseDetail(body, pageUrl),
    warnings: [],
  };
}
