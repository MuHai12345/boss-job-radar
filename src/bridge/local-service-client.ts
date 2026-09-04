import type { JobObservationInput } from '../shared/job-observation-types';

export const LOCAL_SERVICE_BASE_URL = 'http://127.0.0.1:32123';
const REQUEST_TIMEOUT_MS = 5_000;
const TOKEN_PATTERN = /^[0-9a-f]{64}$/u;

export type LocalServiceSaveFailureCode =
  | 'unavailable'
  | 'incompatible_version'
  | 'invalid_data'
  | 'invalid_session'
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
): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    return await fetchImplementation(input, {
      ...init,
      signal: controller.signal,
    });
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
    case 413:
      return failures.payload_too_large;
    case 500:
      return failures.save_failed;
    default:
      return failures.invalid_response;
  }
}

async function readJson(response: Response): Promise<unknown | undefined> {
  try {
    return (await response.json()) as unknown;
  } catch {
    return undefined;
  }
}

export async function saveObservationsToLocalService(
  observations: readonly JobObservationInput[],
  fetchImplementation: typeof fetch = globalThis.fetch,
): Promise<LocalServiceSaveResult> {
  let sessionResponse: Response;
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

  const session = await readJson(sessionResponse);
  if (
    !isRecord(session) ||
    Object.keys(session).length !== 2 ||
    !Object.hasOwn(session, 'protocolVersion') ||
    !Object.hasOwn(session, 'token')
  ) {
    return failures.invalid_response;
  }
  if (session.protocolVersion !== 1) {
    return failures.incompatible_version;
  }
  if (typeof session.token !== 'string' || !TOKEN_PATTERN.test(session.token)) {
    return failures.invalid_response;
  }

  let saveResponse: Response;
  try {
    saveResponse = await fetchWithTimeout(
      fetchImplementation,
      `${LOCAL_SERVICE_BASE_URL}/observations`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Boss-Job-Radar-Token': session.token,
        },
        body: JSON.stringify({ observations }),
      },
    );
  } catch {
    return failures.unavailable;
  }

  if (saveResponse.status !== 201) {
    return failureForStatus(saveResponse.status);
  }

  const saveResult = await readJson(saveResponse);
  if (
    !isRecord(saveResult) ||
    Object.keys(saveResult).length !== 1 ||
    !Array.isArray(saveResult.ids) ||
    saveResult.ids.length !== observations.length ||
    !saveResult.ids.every(
      (id) => typeof id === 'number' && Number.isSafeInteger(id) && id > 0,
    )
  ) {
    return failures.invalid_response;
  }

  return { ok: true, count: observations.length };
}
