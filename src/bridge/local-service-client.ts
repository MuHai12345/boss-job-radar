import type { ImportRequest } from '../shared/import-request-types';
import { validateJobLinkCheckRequest, type JobLinkCheckRequest } from '../shared/job-link-check-types';
import {
  validateStructuredLlmAnalysisRequest,
  type StructuredLlmAnalysisRequest,
} from '../shared/structured-llm-analysis-request';

export const LOCAL_SERVICE_BASE_URL = 'http://127.0.0.1:32123';
const REQUEST_TIMEOUT_MS = 5_000;
export const STRUCTURED_LLM_ANALYSIS_REQUEST_TIMEOUT_MS = 100_000;
const TOKEN_PATTERN = /^[0-9a-f]{64}$/u;

export type LocalServiceSaveFailureCode =
  | 'unavailable'
  | 'incompatible_version'
  | 'invalid_data'
  | 'invalid_session'
  | 'import_conflict'
  | 'payload_too_large'
  | 'save_failed'
  | 'invalid_response';

export type LocalServiceSaveResult =
  | { readonly ok: true; readonly count: number }
  | {
      readonly ok: false;
      readonly code: LocalServiceSaveFailureCode;
      readonly message: string;
    };

const failures: Record<LocalServiceSaveFailureCode, LocalServiceSaveResult> = {
  unavailable: {
    ok: false,
    code: 'unavailable',
    message: '本地服务未启动或无法连接。',
  },
  incompatible_version: {
    ok: false,
    code: 'incompatible_version',
    message: '本地服务版本与扩展不兼容。',
  },
  invalid_data: {
    ok: false,
    code: 'invalid_data',
    message: '当前岗位数据格式不兼容，未保存。',
  },
  invalid_session: {
    ok: false,
    code: 'invalid_session',
    message: '本地服务会话无效，请重新保存。',
  },
  import_conflict: {
    ok: false,
    code: 'import_conflict',
    message: '本次保存请求与本地记录冲突，请重新保存。',
  },
  payload_too_large: {
    ok: false,
    code: 'payload_too_large',
    message: '当前岗位数据过大，未保存。',
  },
  save_failed: {
    ok: false,
    code: 'save_failed',
    message: '本地服务保存失败。',
  },
  invalid_response: {
    ok: false,
    code: 'invalid_response',
    message: '本地服务返回了无法识别的响应。',
  },
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

async function fetchWithTimeout(
  fetchImplementation: typeof fetch,
  input: string,
  init: RequestInit,
): Promise<{ status: number; body: unknown }> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetchImplementation(input, {
      ...init,
      signal: controller.signal,
    });
    // Consume successful bodies before ending the timeout. HTTP failures are
    // definitive and never depend on reading (or retrying) their error body.
    const body = response.status === (init.method === 'GET' ? 200 : 201)
      ? await readJson(response)
      : undefined;
    return { status: response.status, body };
  } finally {
    clearTimeout(timeout);
  }
}

function failureForStatus(status: number): LocalServiceSaveResult {
  switch (status) {
    case 400:
      return failures.invalid_data;
    case 403:
      return failures.invalid_session;
    case 409:
      return failures.import_conflict;
    case 413:
      return failures.payload_too_large;
    case 500:
      return failures.save_failed;
    default:
      return failures.invalid_response;
  }
}

async function readJson(response: Response): Promise<unknown | undefined> {
  const contentType = response.headers.get('Content-Type');
  if (
    contentType === null ||
    contentType.split(';', 1)[0]?.trim().toLowerCase() !== 'application/json'
  ) {
    return undefined;
  }

  // Stream failures are transport failures; complete invalid JSON is a bad
  // response. Only the former can trigger a POST replay.
  const body = await response.text();
  try {
    return JSON.parse(body) as unknown;
  } catch {
    return undefined;
  }
}

export async function saveImportRequestToLocalService(
  importRequest: ImportRequest,
  fetchImplementation: typeof fetch = globalThis.fetch,
): Promise<LocalServiceSaveResult> {
  const payload = JSON.stringify(importRequest);
  const observationCount = importRequest.observations.length;
  let sessionResponse: Awaited<ReturnType<typeof fetchWithTimeout>>;
  try {
    sessionResponse = await fetchWithTimeout(
      fetchImplementation,
      `${LOCAL_SERVICE_BASE_URL}/bridge/session`,
      { method: 'GET', cache: 'no-store' },
    );
  } catch {
    return failures.unavailable;
  }

  if (sessionResponse.status !== 200) {
    return failureForStatus(sessionResponse.status);
  }

  const session = sessionResponse.body;
  if (
    !isRecord(session) ||
    Object.keys(session).length !== 2 ||
    !Object.hasOwn(session, 'protocolVersion') ||
    !Object.hasOwn(session, 'token')
  ) {
    return failures.invalid_response;
  }
  if (session.protocolVersion !== 2) {
    return failures.incompatible_version;
  }
  if (typeof session.token !== 'string' || !TOKEN_PATTERN.test(session.token)) {
    return failures.invalid_response;
  }

  const postInit: RequestInit = {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Boss-Job-Radar-Token': session.token,
    },
    body: payload,
  };
  let saveResponse: Awaited<ReturnType<typeof fetchWithTimeout>> | undefined;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      saveResponse = await fetchWithTimeout(
        fetchImplementation,
        `${LOCAL_SERVICE_BASE_URL}/observations`,
        postInit,
      );
      break;
    } catch {
      // A sent POST with no response has an unknown result. Protocol v2 makes
      // exactly one replay with the same immutable import request safe.
    }
  }
  if (saveResponse === undefined) {
    return failures.unavailable;
  }

  if (saveResponse.status !== 201) {
    return failureForStatus(saveResponse.status);
  }

  const saveResult = saveResponse.body;
  if (
    !isRecord(saveResult) ||
    Object.keys(saveResult).length !== 1 ||
    !Array.isArray(saveResult.ids) ||
    saveResult.ids.length !== observationCount ||
    !saveResult.ids.every(
      (id) => typeof id === 'number' && Number.isSafeInteger(id) && id > 0,
    )
  ) {
    return failures.invalid_response;
  }

  return { ok: true, count: observationCount };
}

export type LocalServiceLinkCheckResult =
  | { readonly ok: true }
  | { readonly ok: false; readonly message: string };

export async function saveJobLinkCheckToLocalService(
  request: JobLinkCheckRequest,
  fetchImplementation: typeof fetch = globalThis.fetch,
): Promise<LocalServiceLinkCheckResult> {
  const invalid = { ok: false, message: '本地服务未能保存岗位链接状态。' } as const;
  const value = validateJobLinkCheckRequest(request);
  if (value === null) return invalid;
  try {
    const sessionResponse = await fetchWithTimeout(fetchImplementation,
      `${LOCAL_SERVICE_BASE_URL}/bridge/session`, { method: 'GET', cache: 'no-store', redirect: 'error', credentials: 'omit' });
    const session = sessionResponse.body;
    if (sessionResponse.status !== 200 || !isRecord(session) || Object.keys(session).length !== 2
      || !Object.hasOwn(session, 'protocolVersion') || !Object.hasOwn(session, 'token')
      || session.protocolVersion !== 2 || typeof session.token !== 'string' || !TOKEN_PATTERN.test(session.token)) return invalid;
    // Fresh session per click. No retries: unlike imports this append has no replay key.
    const response = await fetchWithTimeout(fetchImplementation, `${LOCAL_SERVICE_BASE_URL}/job-link-checks`, {
      method: 'POST', redirect: 'error', credentials: 'omit',
      headers: { 'Content-Type': 'application/json', 'X-Boss-Job-Radar-Token': session.token },
      body: JSON.stringify(value),
    });
    if (response.status === 404) return { ok: false, message: '该岗位尚未保存到本地。' };
    if (response.status !== 201 || !isRecord(response.body) || Object.keys(response.body).length !== 1
      || typeof response.body.id !== 'number' || !Number.isSafeInteger(response.body.id) || response.body.id <= 0) return invalid;
    return { ok: true };
  } catch {
    return { ok: false, message: '本地服务未启动或无法连接。' };
  }
}

export type LocalServiceStructuredLlmAnalysisFailureCode =
  | 'unavailable'
  | 'incompatible_version'
  | 'invalid_request'
  | 'invalid_session'
  | 'job_not_found'
  | 'analysis_unavailable'
  | 'analysis_not_configured'
  | 'analysis_failed'
  | 'payload_too_large'
  | 'invalid_response';

export type LocalServiceStructuredLlmAnalysisResult =
  | { readonly ok: true; readonly id: number }
  | {
      readonly ok: false;
      readonly code: LocalServiceStructuredLlmAnalysisFailureCode;
      readonly message: string;
    };

const analysisFailureMessages: Record<LocalServiceStructuredLlmAnalysisFailureCode, string> = {
  unavailable: '本地服务未启动或无法连接。',
  incompatible_version: '本地服务版本与扩展不兼容。',
  invalid_request: '当前岗位无法发起 AI 分析。',
  invalid_session: '本地服务会话无效，请重新点击分析。',
  job_not_found: '请先把当前岗位保存到本地，再进行 AI 分析。',
  analysis_unavailable: '当前岗位缺少可分析的完整 JD，请重新保存岗位详情后再试。',
  analysis_not_configured: '本地 AI 分析尚未配置。',
  analysis_failed: 'AI 分析失败，未保存新的分析结果。',
  payload_too_large: 'AI 分析请求数据过大。',
  invalid_response: '本地服务返回了无法识别的 AI 分析响应。',
};

function analysisFailure(
  code: LocalServiceStructuredLlmAnalysisFailureCode,
): LocalServiceStructuredLlmAnalysisResult {
  return { ok: false, code, message: analysisFailureMessages[code] };
}

function analysisFailureForStatus(status: number): LocalServiceStructuredLlmAnalysisResult {
  switch (status) {
    case 400: return analysisFailure('invalid_request');
    case 403: return analysisFailure('invalid_session');
    case 404: return analysisFailure('job_not_found');
    case 413: return analysisFailure('payload_too_large');
    case 422: return analysisFailure('analysis_unavailable');
    case 502: return analysisFailure('analysis_failed');
    case 503: return analysisFailure('analysis_not_configured');
    default: return analysisFailure('invalid_response');
  }
}

async function postStructuredLlmAnalysisWithTimeout(
  fetchImplementation: typeof fetch,
  request: StructuredLlmAnalysisRequest,
  token: string,
): Promise<{ status: number; body: unknown }> {
  const controller = new AbortController();
  let timeout: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<never>((_resolve, reject) => {
    timeout = setTimeout(() => {
      controller.abort();
      reject(new Error('Structured LLM analysis request timed out'));
    }, STRUCTURED_LLM_ANALYSIS_REQUEST_TIMEOUT_MS);
  });

  try {
    // One POST only. The deadline includes body consumption, even if an
    // injected transport does not reject on abort. Error bodies are not read.
    return await Promise.race([
      (async () => {
        const response = await fetchImplementation(
          `${LOCAL_SERVICE_BASE_URL}/structured-llm-analyses`,
          {
            method: 'POST',
            redirect: 'error',
            credentials: 'omit',
            signal: controller.signal,
            headers: {
              'Content-Type': 'application/json',
              'X-Boss-Job-Radar-Token': token,
            },
            body: JSON.stringify({ jobUrl: request.jobUrl }),
          },
        );
        const body = response.status === 200 ? await readJson(response) : undefined;
        return { status: response.status, body };
      })(),
      deadline,
    ]);
  } finally {
    clearTimeout(timeout);
  }
}

export async function requestStructuredLlmAnalysisFromLocalService(
  request: StructuredLlmAnalysisRequest,
  fetchImplementation: typeof fetch = globalThis.fetch,
): Promise<LocalServiceStructuredLlmAnalysisResult> {
  const value = validateStructuredLlmAnalysisRequest(request);
  if (value === null) return analysisFailure('invalid_request');

  try {
    // The token exists only for this explicit action and is never reused.
    const sessionResponse = await fetchWithTimeout(
      fetchImplementation,
      `${LOCAL_SERVICE_BASE_URL}/bridge/session`,
      { method: 'GET', cache: 'no-store', redirect: 'error', credentials: 'omit' },
    );
    if (sessionResponse.status !== 200) {
      return analysisFailureForStatus(sessionResponse.status);
    }
    const session = sessionResponse.body;
    if (
      !isRecord(session) || Reflect.ownKeys(session).length !== 2
      || !Object.hasOwn(session, 'protocolVersion') || !Object.hasOwn(session, 'token')
    ) return analysisFailure('invalid_response');
    if (session.protocolVersion !== 2) return analysisFailure('incompatible_version');
    if (typeof session.token !== 'string' || !TOKEN_PATTERN.test(session.token)) {
      return analysisFailure('invalid_response');
    }

    const response = await postStructuredLlmAnalysisWithTimeout(fetchImplementation, value, session.token);
    if (response.status !== 200) return analysisFailureForStatus(response.status);
    const result = response.body;
    if (
      !isRecord(result) || Reflect.ownKeys(result).length !== 1 || !Object.hasOwn(result, 'id')
      || typeof result.id !== 'number' || !Number.isSafeInteger(result.id) || result.id <= 0
    ) return analysisFailure('invalid_response');
    return { ok: true, id: result.id };
  } catch {
    return analysisFailure('unavailable');
  }
}
