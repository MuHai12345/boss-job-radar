import { classifyPageUrl } from '../page-context';
import type {
  TargetedDomProbePageType,
  TargetedDomProbeResult,
} from './targeted-dom-probe-types';
import type { ManualProbeTab } from './manual-probe-request';

export interface TargetedProbeUrlClassification {
  supported: boolean;
  pageType: TargetedDomProbePageType;
}

export type TargetedProbeFailureCode =
  | 'unsupported_page'
  | 'missing_tab_id'
  | 'scripting_failed'
  | 'missing_probe_result'
  | 'page_navigated';

export type TargetedProbeRequestOutcome =
  | { ok: true; result: TargetedDomProbeResult }
  | { ok: false; code: TargetedProbeFailureCode; message: string };

export type ExecuteTargetedProbe = (
  tabId: number,
) => Promise<TargetedDomProbeResult | undefined>;

export function classifyTargetedProbeUrl(
  input: string | null | undefined,
): TargetedProbeUrlClassification {
  if (classifyPageUrl(input).kind !== 'boss' || typeof input !== 'string') {
    return { supported: false, pageType: 'unsupported' };
  }
  const url = new URL(input);
  if (url.pathname === '/web/geek/jobs') {
    return { supported: true, pageType: 'search_results' };
  }
  if (
    url.pathname.startsWith('/job_detail/') &&
    url.pathname.endsWith('.html')
  ) {
    return { supported: true, pageType: 'job_detail' };
  }
  return { supported: false, pageType: 'unsupported' };
}

function safePageIdentity(urlValue: string): string | null {
  try {
    const url = new URL(urlValue);
    return `${url.protocol}//${url.hostname}${url.pathname}`;
  } catch {
    return null;
  }
}

export async function requestTargetedDomProbe(
  tab: ManualProbeTab,
  executeProbe: ExecuteTargetedProbe,
): Promise<TargetedProbeRequestOutcome> {
  if (!classifyTargetedProbeUrl(tab.url).supported) {
    return {
      ok: false,
      code: 'unsupported_page',
      message: '深度结构验证仅支持岗位搜索结果页或独立岗位详情页。',
    };
  }
  if (tab.id === undefined) {
    return {
      ok: false,
      code: 'missing_tab_id',
      message: '无法取得当前标签页标识，请关闭扩展弹窗后重试。',
    };
  }

  let result: TargetedDomProbeResult | undefined;
  try {
    result = await executeProbe(tab.id);
  } catch {
    return {
      ok: false,
      code: 'scripting_failed',
      message: '无法读取当前岗位区域。页面可能不允许扩展注入，请保持页面打开后重试。',
    };
  }
  if (result === undefined) {
    return {
      ok: false,
      code: 'missing_probe_result',
      message: '页面没有返回深度结构结果，请确认页面仍然打开后重新点击。',
    };
  }
  if (
    safePageIdentity(tab.url as string) !== safePageIdentity(result.pageUrl)
  ) {
    return {
      ok: false,
      code: 'page_navigated',
      message: '页面在验证过程中发生了跳转，请确认当前页面后重新点击。',
    };
  }
  return { ok: true, result };
}
