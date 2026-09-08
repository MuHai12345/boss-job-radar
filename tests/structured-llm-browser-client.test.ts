import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  LOCAL_SERVICE_BASE_URL,
  STRUCTURED_LLM_ANALYSIS_REQUEST_TIMEOUT_MS,
  requestStructuredLlmAnalysisFromLocalService,
} from '../src/bridge/local-service-client';
import type { StructuredLlmAnalysisRequest } from '../src/shared/structured-llm-analysis-request';

const JOB_URL = 'https://www.zhipin.com/job_detail/llm-browser-client.html';
const REQUEST: StructuredLlmAnalysisRequest = { jobUrl: JOB_URL };
const TOKEN = 'a'.repeat(64);

const clientSource = readFileSync(
  fileURLToPath(new URL('../src/bridge/local-service-client.ts', import.meta.url)),
  'utf8',
);

function jsonResponse(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  });
}

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('structured LLM browser client privacy and request contract', () => {
  it('validates the exact canonical request before any network activity', async () => {
    const invalidRequests = [
      { jobUrl: `${JOB_URL}?from=search` },
      { jobUrl: `${JOB_URL}#anchor` },
      { jobUrl: JOB_URL.replace('https://', 'http://') },
      { jobUrl: JOB_URL.replace('www.zhipin.com', 'm.zhipin.com') },
      { jobUrl: JOB_URL, model: 'gpt-5.6-sol' },
      { jobUrl: JOB_URL, apiKey: 'private' },
      { jobUrl: JOB_URL, prompt: 'private' },
      { jobUrl: JOB_URL, fullJdText: 'private' },
    ];

    for (const invalidRequest of invalidRequests) {
      const fetchImplementation = vi.fn();
      await expect(
        requestStructuredLlmAnalysisFromLocalService(
          invalidRequest as unknown as StructuredLlmAnalysisRequest,
          fetchImplementation as unknown as typeof fetch,
        ),
      ).resolves.toEqual({
        ok: false,
        code: 'invalid_request',
        message: '当前岗位无法发起 AI 分析。',
      });
      expect(fetchImplementation).not.toHaveBeenCalled();
    }
  });

  it('uses a fresh protocol-2 session for every action and sends jobUrl only', async () => {
    const firstToken = 'a'.repeat(64);
    const secondToken = 'b'.repeat(64);
    const fetchImplementation = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ protocolVersion: 2, token: firstToken }, 200))
      .mockResolvedValueOnce(jsonResponse({ id: 11 }, 200))
      .mockResolvedValueOnce(jsonResponse({ protocolVersion: 2, token: secondToken }, 200))
      .mockResolvedValueOnce(jsonResponse({ id: 12 }, 200));

    await expect(requestStructuredLlmAnalysisFromLocalService(
      REQUEST,
      fetchImplementation as unknown as typeof fetch,
    )).resolves.toEqual({ ok: true, id: 11 });
    await expect(requestStructuredLlmAnalysisFromLocalService(
      REQUEST,
      fetchImplementation as unknown as typeof fetch,
    )).resolves.toEqual({ ok: true, id: 12 });

    expect(fetchImplementation).toHaveBeenCalledTimes(4);
    expect(fetchImplementation.mock.calls[0]?.[0]).toBe(`${LOCAL_SERVICE_BASE_URL}/bridge/session`);
    expect(fetchImplementation.mock.calls[2]?.[0]).toBe(`${LOCAL_SERVICE_BASE_URL}/bridge/session`);

    for (const [callIndex, expectedToken] of [[1, firstToken], [3, secondToken]] as const) {
      expect(fetchImplementation.mock.calls[callIndex]?.[0]).toBe(
        `${LOCAL_SERVICE_BASE_URL}/structured-llm-analyses`,
      );
      const init = fetchImplementation.mock.calls[callIndex]?.[1] as RequestInit;
      expect(init).toMatchObject({
        method: 'POST',
        redirect: 'error',
        credentials: 'omit',
        headers: {
          'Content-Type': 'application/json',
          'X-Boss-Job-Radar-Token': expectedToken,
        },
      });
      expect(JSON.parse(init.body as string)).toEqual({ jobUrl: JOB_URL });
      expect(Object.keys(JSON.parse(init.body as string))).toEqual(['jobUrl']);
    }
  });

  it('keeps OpenAI secret/model environment names out of the browser client', () => {
    expect(clientSource).not.toContain('BOSS_JOB_RADAR_OPENAI_API_KEY');
    expect(clientSource).not.toContain('BOSS_JOB_RADAR_OPENAI_MODEL');
    expect(clientSource).not.toContain('fullJdText: request');
  });
});

describe('structured LLM browser client session validation', () => {
  it.each([
    [{ protocolVersion: 1, token: TOKEN }, 'incompatible_version'],
    [{ protocolVersion: 2, token: 'short' }, 'invalid_response'],
    [{ protocolVersion: 2, token: 'A'.repeat(64) }, 'invalid_response'],
    [{ protocolVersion: 2, token: TOKEN, extra: true }, 'invalid_response'],
    [{ token: TOKEN }, 'invalid_response'],
  ] as const)('fails closed for malformed session %#', async (session, expectedCode) => {
    const fetchImplementation = vi.fn().mockResolvedValueOnce(jsonResponse(session, 200));
    await expect(requestStructuredLlmAnalysisFromLocalService(
      REQUEST,
      fetchImplementation as unknown as typeof fetch,
    )).resolves.toMatchObject({ ok: false, code: expectedCode });
    expect(fetchImplementation).toHaveBeenCalledTimes(1);
  });

  it('requires application/json for the successful session response', async () => {
    const fetchImplementation = vi.fn().mockResolvedValueOnce(
      new Response(JSON.stringify({ protocolVersion: 2, token: TOKEN }), {
        status: 200,
        headers: { 'Content-Type': 'text/plain' },
      }),
    );
    await expect(requestStructuredLlmAnalysisFromLocalService(
      REQUEST,
      fetchImplementation as unknown as typeof fetch,
    )).resolves.toMatchObject({ ok: false, code: 'invalid_response' });
    expect(fetchImplementation).toHaveBeenCalledTimes(1);
  });
});

describe('structured LLM browser client response mapping', () => {
  it.each([
    [400, 'invalid_request', '当前岗位无法发起 AI 分析。'],
    [403, 'invalid_session', '本地服务会话无效，请重新点击分析。'],
    [404, 'job_not_found', '请先把当前岗位保存到本地，再进行 AI 分析。'],
    [413, 'payload_too_large', 'AI 分析请求数据过大。'],
    [422, 'analysis_unavailable', '当前岗位缺少可分析的完整 JD，请重新保存岗位详情后再试。'],
    [502, 'analysis_failed', 'AI 分析失败，未保存新的分析结果。'],
    [503, 'analysis_not_configured', '本地 AI 分析尚未配置。'],
    [429, 'invalid_response', '本地服务返回了无法识别的 AI 分析响应。'],
    [500, 'invalid_response', '本地服务返回了无法识别的 AI 分析响应。'],
  ] as const)('maps HTTP %i without retrying or reflecting the body', async (status, code, message) => {
    const privateSentinel = `PRIVATE_SERVER_BODY_${status}`;
    const fetchImplementation = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ protocolVersion: 2, token: TOKEN }, 200))
      .mockResolvedValueOnce(jsonResponse({ error: privateSentinel }, status));

    const result = await requestStructuredLlmAnalysisFromLocalService(
      REQUEST,
      fetchImplementation as unknown as typeof fetch,
    );
    expect(result).toEqual({ ok: false, code, message });
    expect(JSON.stringify(result)).not.toContain(privateSentinel);
    expect(fetchImplementation).toHaveBeenCalledTimes(2);
  });

  it.each([
    { id: 0 },
    { id: -1 },
    { id: 1.5 },
    { id: Number.MAX_SAFE_INTEGER + 1 },
    { id: '1' },
    { id: 1, extra: true },
    {},
  ])('rejects malformed HTTP 200 success body %#', async (body) => {
    const fetchImplementation = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ protocolVersion: 2, token: TOKEN }, 200))
      .mockResolvedValueOnce(jsonResponse(body, 200));

    await expect(requestStructuredLlmAnalysisFromLocalService(
      REQUEST,
      fetchImplementation as unknown as typeof fetch,
    )).resolves.toMatchObject({ ok: false, code: 'invalid_response' });
    expect(fetchImplementation).toHaveBeenCalledTimes(2);
  });

  it('requires application/json and valid JSON for HTTP 200', async () => {
    const wrongType = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ protocolVersion: 2, token: TOKEN }, 200))
      .mockResolvedValueOnce(new Response(JSON.stringify({ id: 1 }), {
        status: 200,
        headers: { 'Content-Type': 'text/plain' },
      }));
    await expect(requestStructuredLlmAnalysisFromLocalService(
      REQUEST,
      wrongType as unknown as typeof fetch,
    )).resolves.toMatchObject({ ok: false, code: 'invalid_response' });

    const malformedJson = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ protocolVersion: 2, token: TOKEN }, 200))
      .mockResolvedValueOnce(new Response('{invalid', {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }));
    await expect(requestStructuredLlmAnalysisFromLocalService(
      REQUEST,
      malformedJson as unknown as typeof fetch,
    )).resolves.toMatchObject({ ok: false, code: 'invalid_response' });
    expect(malformedJson).toHaveBeenCalledTimes(2);
  });
});

describe('structured LLM browser client cost boundary', () => {
  it('uses a 50 second analysis deadline and never retries a rejected POST', async () => {
    expect(STRUCTURED_LLM_ANALYSIS_REQUEST_TIMEOUT_MS).toBe(50_000);
    const fetchImplementation = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ protocolVersion: 2, token: TOKEN }, 200))
      .mockRejectedValueOnce(new Error('connection reset after provider may have started'));

    await expect(requestStructuredLlmAnalysisFromLocalService(
      REQUEST,
      fetchImplementation as unknown as typeof fetch,
    )).resolves.toMatchObject({ ok: false, code: 'unavailable' });
    expect(fetchImplementation).toHaveBeenCalledTimes(2);
  });

  it('does not retry when the HTTP 200 response body stream fails', async () => {
    const fetchImplementation = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ protocolVersion: 2, token: TOKEN }, 200))
      .mockResolvedValueOnce(new Response(new ReadableStream({
        start(controller) {
          controller.error(new TypeError('response stream lost'));
        },
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }));

    await expect(requestStructuredLlmAnalysisFromLocalService(
      REQUEST,
      fetchImplementation as unknown as typeof fetch,
    )).resolves.toMatchObject({ ok: false, code: 'unavailable' });
    expect(fetchImplementation).toHaveBeenCalledTimes(2);
  });

  it('times out while consuming a hanging success body and still sends only one POST', async () => {
    vi.useFakeTimers();
    const fetchImplementation = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ protocolVersion: 2, token: TOKEN }, 200))
      .mockResolvedValueOnce(new Response(new ReadableStream({
        start() {
          // Deliberately never close: the analysis deadline must cover body consumption.
        },
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }));

    const pending = requestStructuredLlmAnalysisFromLocalService(
      REQUEST,
      fetchImplementation as unknown as typeof fetch,
    );
    await vi.advanceTimersByTimeAsync(0);
    expect(fetchImplementation).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(50_001);
    await expect(pending).resolves.toMatchObject({ ok: false, code: 'unavailable' });
    expect(fetchImplementation).toHaveBeenCalledTimes(2);
  });
});
