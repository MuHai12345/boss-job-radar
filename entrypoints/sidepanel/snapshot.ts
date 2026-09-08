import { browser } from 'wxt/browser';
import type { StructuredPageExtractionResult } from '../../src/page-extraction/structured-page-extraction-types';
import { canonicalBossJobUrl } from '../../src/shared/boss-url-policy';
import { canonicalCheckableJobUrl, isIsoTimestamp, type CheckedLinkStatus } from '../../src/shared/job-link-check-types';

const STORAGE_KEY = 'workspace.ui-snapshot.v1';
export const messages = {
  page: '当前页面不支持刷新，你仍可查看上次结果。',
  permission: '无法读取当前页。请点击浏览器工具栏中的扩展图标，再打开工作台后重试。',
  changed: '页面已切换，本次读取未应用。上次结果仍然保留。',
  empty: '没有读取到可展示的岗位，请等待页面加载完成后重试。',
  service: '本地服务未启动或无法连接。',
  save: '本次未能确认保存成功，请稍后重新保存。',
  analysis: '本次未能确认 AI 分析成功，请稍后查看本地记录；不会自动重试。手动再次点击 AI 分析会开始一次新的分析尝试，可能再次发起远程请求并产生 API 费用。',
  job_not_found: '请先把当前岗位保存到本地，再进行 AI 分析。',
  analysis_unavailable: '当前岗位缺少完整职位描述，请重新保存岗位详情。',
  analysis_not_configured: '本地 AI 分析尚未配置。',
  canonical: 'AI 分析支持当前 BOSS 岗位详情页，发送前会使用去除页面参数后的岗位标准链接。',
  link_check: '当前页面无法可靠判断岗位链接状态。',
  interrupted: '上次请求的完成状态尚未确认，最近已确认结果仍保留；不会自动重试。',
} as const;
export type ErrorCode = keyof typeof messages;
export type Action = 'refresh' | 'parse' | 'save' | 'link_check' | 'analyze';

export interface JobSummary {
  jobUrl: string;
  title: string | null;
  companyName: string | null;
  salaryText: string | null;
  locationText: string | null;
  experienceText: string | null;
  educationText: string | null;
  tags: string[];
  hasFullDescription: boolean;
}

export interface UiSnapshot {
  version: 1;
  lastJobUrl: string | null;
  jobs: JobSummary[];
  parsedAt: string | null;
  parsedCount: number;
  pageType: 'job_detail' | 'search_results' | null;
  saved: { jobUrl: string; count: number; at: string } | null;
  analysis: { jobUrl: string; id: number; at: string } | null;
  linkCheck: { jobUrl: string; status: CheckedLinkStatus; at: string } | null;
  lastOperationAt: string | null;
  viewingPrevious: boolean;
  error: ErrorCode | null;
  pending: Action | null;
}

export function emptySnapshot(): UiSnapshot {
  return {
    version: 1, lastJobUrl: null, jobs: [], parsedAt: null, parsedCount: 0,
    pageType: null, saved: null, analysis: null, linkCheck: null, lastOperationAt: null,
    viewingPrevious: true, error: null, pending: null,
  };
}

function record(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown> : {};
}

// Display fields only, never snippets of JD/raw text. Reject rather than truncate
// oversized or credential/URL-shaped content. No arbitrary object serialization.
function field(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const text = value.trim();
  if (!text || text.length > 120 || /[\r\n<>]|https?:|www\.|[?&#=]|authorization|bearer|cookie|session|securityid|\bka\b|api[_ -]?key|bridge[_ -]?token|\bsk-|[a-f0-9]{32,}/iu.test(text)) return null;
  return text;
}

export function jobUrl(value: unknown): string | null {
  if (typeof value !== 'string' || value.length > 500) return null;
  const canonical = canonicalBossJobUrl(value);
  if (!canonical) return null;
  // The verified BOSS identity is a single opaque ID; reject encoded delimiters.
  return /^https?:\/\/(?:[a-z0-9-]+\.)*zhipin\.com\/job_detail\/[a-z0-9_-]+\.html$/iu.test(canonical)
    ? canonical : null;
}

function positive(value: unknown): number | null {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0 ? value : null;
}

function summary(value: unknown): JobSummary | null {
  const row = record(value);
  const canonical = jobUrl(row.jobUrl);
  if (!canonical) return null;
  return {
    jobUrl: canonical, title: field(row.title), companyName: field(row.companyName),
    salaryText: field(row.salaryText), locationText: field(row.locationText),
    experienceText: field(row.experienceText), educationText: field(row.educationText),
    tags: Array.isArray(row.tags) ? row.tags.slice(0, 8).map(field).filter((tag): tag is string => tag !== null) : [],
    hasFullDescription: row.hasFullDescription === true,
  };
}

/** Reconstruct an allowlisted value on BOTH read and write. */
export function sanitizeSnapshot(value: unknown): UiSnapshot {
  const row = record(value);
  const clean = emptySnapshot();
  if (row.version !== 1) return clean;
  clean.lastJobUrl = jobUrl(row.lastJobUrl);
  clean.jobs = Array.isArray(row.jobs)
    ? row.jobs.slice(0, 8).map(summary).filter((job): job is JobSummary => job !== null) : [];
  clean.parsedAt = isIsoTimestamp(row.parsedAt) ? row.parsedAt : null;
  clean.parsedCount = Math.min(positive(row.parsedCount) ?? 0, 100);
  clean.pageType = row.pageType === 'job_detail' || row.pageType === 'search_results' ? row.pageType : null;
  const saved = record(row.saved);
  const savedUrl = jobUrl(saved.jobUrl);
  const count = positive(saved.count);
  if (savedUrl && count && isIsoTimestamp(saved.at)) clean.saved = { jobUrl: savedUrl, count, at: saved.at };
  const analysis = record(row.analysis);
  const analysisUrl = jobUrl(analysis.jobUrl);
  const id = positive(analysis.id);
  if (analysisUrl && id && isIsoTimestamp(analysis.at)) clean.analysis = { jobUrl: analysisUrl, id, at: analysis.at };
  const linkCheck = record(row.linkCheck);
  const linkCheckUrl = canonicalCheckableJobUrl(linkCheck.jobUrl);
  if (linkCheckUrl && isIsoTimestamp(linkCheck.at)
    && (linkCheck.status === 'available' || linkCheck.status === 'explicitly_unavailable' || linkCheck.status === 'unknown')) {
    clean.linkCheck = { jobUrl: linkCheckUrl, status: linkCheck.status, at: linkCheck.at };
  }
  clean.lastOperationAt = isIsoTimestamp(row.lastOperationAt) ? row.lastOperationAt : null;
  clean.viewingPrevious = row.viewingPrevious !== false;
  clean.error = typeof row.error === 'string' && Object.hasOwn(messages, row.error) ? row.error as ErrorCode : null;
  clean.pending = row.pending === 'refresh' || row.pending === 'parse' || row.pending === 'save' || row.pending === 'link_check' || row.pending === 'analyze' ? row.pending : null;
  return clean;
}

export function summarizeExtraction(result: StructuredPageExtractionResult): JobSummary[] {
  const candidates = result.pageType === 'job_detail' && result.detail ? [result.detail] : result.cards;
  return candidates.slice(0, 8).map((candidate) => summary({
    jobUrl: candidate.jobUrl, title: candidate.title, companyName: candidate.companyName,
    salaryText: candidate.salaryText, locationText: candidate.locationText,
    experienceText: candidate.experienceText, educationText: candidate.educationText,
    tags: candidate.tags,
    hasFullDescription: 'fullJdText' in candidate && typeof candidate.fullJdText === 'string' && candidate.fullJdText.trim().length > 0,
  })).filter((job): job is JobSummary => job !== null);
}

export async function loadSnapshot(): Promise<UiSnapshot> {
  const stored = await browser.storage.local.get(STORAGE_KEY);
  const snapshot = sanitizeSnapshot(stored[STORAGE_KEY]);
  snapshot.viewingPrevious = true;
  if (snapshot.pending) snapshot.error = 'interrupted';
  snapshot.pending = null;
  return snapshot;
}

let writeQueue: Promise<void> = Promise.resolve();
export function saveSnapshot(snapshot: UiSnapshot): Promise<void> {
  const clean = sanitizeSnapshot(snapshot);
  const write = writeQueue.then(() => browser.storage.local.set({ [STORAGE_KEY]: clean }));
  // A failed write must not prevent a later successful operation being retained.
  writeQueue = write.catch(() => undefined);
  return write;
}
