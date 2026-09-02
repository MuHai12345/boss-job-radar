import { classifyPageUrl } from '../page-context';
import type { ManualDomProbeResult } from './dom-probe-types';

export interface ManualProbeTab {
  id?: number;
  url?: string;
}

export type ManualProbeFailureCode =
  | 'not_boss_page'
  | 'missing_tab_id'
  | 'scripting_failed'
  | 'missing_probe_result'
  | 'page_navigated';

export type ManualProbeRequestOutcome =
  | { ok: true; result: ManualDomProbeResult }
  | {
      ok: false;
      code: ManualProbeFailureCode;
      message: string;
    };

export type ExecuteManualProbe = (
  tabId: number,
) => Promise<ManualDomProbeResult | undefined>;

export async function requestManualDomProbe(
  tab: ManualProbeTab,
  executeProbe: ExecuteManualProbe,
): Promise<ManualProbeRequestOutcome> {
  if (classifyPageUrl(tab.url).kind !== 'boss') {
    return {
      ok: false,
      code: 'not_boss_page',
      message: '仅可在当前活动的 BOSS直聘页面运行人工验证。',
    };
  }

  if (tab.id === undefined) {
    return {
      ok: false,
      code: 'missing_tab_id',
      message: '无法取得当前标签页标识，请关闭扩展弹窗后重试。',
    };
  }

  let result: ManualDomProbeResult | undefined;
  try {
    result = await executeProbe(tab.id);
  } catch {
    return {
      ok: false,
      code: 'scripting_failed',
      message: '无法读取当前页面。页面可能不允许扩展注入，请保持页面打开后重试。',
    };
  }

  if (result === undefined) {
    return {
      ok: false,
      code: 'missing_probe_result',
      message: '页面没有返回验证结果，请确认页面仍然打开后重新点击。',
    };
  }

  if (new URL(tab.url as string).href !== new URL(result.pageUrl).href) {
    return {
      ok: false,
      code: 'page_navigated',
      message: '页面在验证过程中发生了跳转，请确认当前页面后重新点击。',
    };
  }

  return { ok: true, result };
}
