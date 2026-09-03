import {
  isBossHostname,
  isSupportedHttpProtocol,
} from '../shared/boss-url-policy';
import type {
  StructuredPageExtractionResult,
  StructuredPageType,
} from './structured-page-extraction-types';

export interface StructuredPageExtractionTab {
  id?: number;
  url?: string;
}

export interface StructuredPageExtractionUrlClassification {
  supported: boolean;
  pageType: StructuredPageType;
  pageUrl: string | null;
}

export type StructuredPageExtractionFailureCode =
  | 'unsupported_page'
  | 'missing_tab_id'
  | 'scripting_failed'
  | 'missing_extraction_result'
  | 'page_navigated';

export type StructuredPageExtractionRequestOutcome =
  | { ok: true; result: StructuredPageExtractionResult }
  | {
      ok: false;
      code: StructuredPageExtractionFailureCode;
      message: string;
    };

export type ExecuteStructuredPageExtraction = (
  tabId: number,
) => Promise<StructuredPageExtractionResult | undefined>;

export function classifyStructuredPageExtractionUrl(
  input: string | null | undefined,
): StructuredPageExtractionUrlClassification {
  if (typeof input !== 'string' || input.trim() === '') {
    return { supported: false, pageType: 'unsupported', pageUrl: null };
  }

  let url: URL;
  try {
    url = new URL(input);
  } catch {
    return { supported: false, pageType: 'unsupported', pageUrl: null };
  }
  if (
    !isSupportedHttpProtocol(url.protocol) ||
    !isBossHostname(url.hostname) ||
    url.username !== '' ||
    url.password !== ''
  ) {
    return { supported: false, pageType: 'unsupported', pageUrl: null };
  }

  const pageType: StructuredPageType =
    url.pathname === '/web/geek/jobs'
      ? 'search_results'
      : /^\/job_detail\/[^/]+\.html$/.test(url.pathname)
        ? 'job_detail'
        : 'unsupported';
  if (pageType === 'unsupported') {
    return { supported: false, pageType, pageUrl: null };
  }
  return {
    supported: true,
    pageType,
    pageUrl: `${url.protocol}//${url.hostname}${url.pathname}`,
  };
}

export async function requestStructuredPageExtraction(
  tab: StructuredPageExtractionTab,
  executeExtraction: ExecuteStructuredPageExtraction,
): Promise<StructuredPageExtractionRequestOutcome> {
  const classification = classifyStructuredPageExtractionUrl(tab.url);
  if (!classification.supported) {
    return {
      ok: false,
      code: 'unsupported_page',
      message: '结构化解析仅支持岗位搜索结果页或独立岗位详情页。',
    };
  }
  if (tab.id === undefined) {
    return {
      ok: false,
      code: 'missing_tab_id',
      message: '无法取得当前标签页标识，请关闭扩展弹窗后重试。',
    };
  }

  let result: StructuredPageExtractionResult | undefined;
  try {
    result = await executeExtraction(tab.id);
  } catch {
    return {
      ok: false,
      code: 'scripting_failed',
      message: '无法解析当前岗位页面。页面可能不允许扩展注入，请保持页面打开后重试。',
    };
  }
  if (result === undefined) {
    return {
      ok: false,
      code: 'missing_extraction_result',
      message: '页面没有返回结构化解析结果，请确认页面仍然打开后重新点击。',
    };
  }

  const returnedClassification = classifyStructuredPageExtractionUrl(
    result.pageUrl,
  );
  if (
    returnedClassification.pageUrl === null ||
    returnedClassification.pageUrl !== classification.pageUrl
  ) {
    return {
      ok: false,
      code: 'page_navigated',
      message: '页面在解析过程中发生了跳转，请确认当前页面后重新点击。',
    };
  }

  return { ok: true, result };
}
