import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  LOCAL_SERVICE_BASE_URL,
  saveImportRequestToLocalService,
} from '../src/bridge/local-service-client';
import type { ImportRequest } from '../src/shared/import-request-types';

const token = 'a'.repeat(64);
const importRequest: ImportRequest = {
  clientImportId: '9c7f47eb-4804-4eb5-a39d-02e1bbbe14df',
  source: {
    pageType: 'job_detail',
    pageUrl: 'https://www.zhipin.com/job_detail/example.html',
    capturedAt: '2026-09-04T01:02:03.000Z',
    matchedCardCount: null,
    warnings: [],
  },
  observations: [
    {
      capturedAt: '2026-09-04T01:02:03.000Z',
      pageType: 'job_detail',
      sourcePageUrl: 'https://www.zhipin.com/job_detail/example.html',
      jobHrefRaw: null,
      jobUrl: 'https://www.zhipin.com/job_detail/example.html',
      title: '示例岗位',
      companyName: '',
      salaryText: null,
      locationText: '上海',
      experienceText: null,
      educationText: null,
      tags: ['电商', '电商'],
      recruiterActivityText: null,
      publishedText: null,
      fullJdText: 'JD',
      rawText: 'raw',
      missingFields: [],
      warnings: [],
    },
  ],
};

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

describe('saveImportRequestToLocalService', () => {
  it('gets a protocol 2 session before posting the exact envelope', async () => {
    const fetchImplementation = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse({ protocolVersion: 2, token }, 200))
      .mockResolvedValueOnce(jsonResponse({ ids: [41] }, 201));

    const result = await saveImportRequestToLocalService(
      importRequest,
      fetchImplementation,
    );

    expect(result).toEqual({ ok: true, count: 1 });
    expect(fetchImplementation).toHaveBeenCalledTimes(2);
    expect(fetchImplementation.mock.calls[0]?.[0]).toBe(
      `${LOCAL_SERVICE_BASE_URL}/bridge/session`,
    );
    expect(fetchImplementation.mock.calls[0]?.[1]).toMatchObject({
      method: 'GET',
      cache: 'no-store',
    });
    expect(fetchImplementation.mock.calls[1]?.[0]).toBe(
      `${LOCAL_SERVICE_BASE_URL}/observations`,
    );
    expect(fetchImplementation.mock.calls[1]?.[1]).toMatchObject({
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Boss-Job-Radar-Token': token,
      },
      body: JSON.stringify(importRequest),
    });
  });

  it('accepts protocol 2 only and does not POST for protocol 1', async () => {
    const fetchImplementation = vi
      .fn<typeof fetch>()
      .mockResolvedValue(jsonResponse({ protocolVersion: 1, token }, 200));

    await expect(
      saveImportRequestToLocalService(importRequest, fetchImplementation),
    ).resolves.toEqual({
      ok: false,
      code: 'incompatible_version',
      message: '本地服务版本与扩展不兼容。',
    });
    expect(fetchImplementation).toHaveBeenCalledTimes(1);
  });

  it.each([
    { protocolVersion: 2, token: 'short' },
    { protocolVersion: 2, token: 'A'.repeat(64) },
    { protocolVersion: 2, token: 42 },
    { protocolVersion: 2 },
  ])('rejects an invalid session token without posting', async (body) => {
    const fetchImplementation = vi
      .fn<typeof fetch>()
      .mockResolvedValue(jsonResponse(body, 200));

    await expect(
      saveImportRequestToLocalService(importRequest, fetchImplementation),
    ).resolves.toMatchObject({ ok: false, code: 'invalid_response' });
    expect(fetchImplementation).toHaveBeenCalledTimes(1);
  });

  it('requires an application/json session response', async () => {
    const fetchImplementation = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(JSON.stringify({ protocolVersion: 2, token }), {
        status: 200,
        headers: { 'Content-Type': 'text/plain' },
      }),
    );

    await expect(
      saveImportRequestToLocalService(importRequest, fetchImplementation),
    ).resolves.toMatchObject({ ok: false, code: 'invalid_response' });
    expect(fetchImplementation).toHaveBeenCalledTimes(1);
  });

  it.each([
    { ids: [0] },
    { ids: [-1] },
    { ids: [1.5] },
    { ids: [Number.MAX_SAFE_INTEGER + 1] },
    { ids: ['1'] },
    { ids: [1], extra: true },
    { ids: [1, 2] },
  ])('rejects invalid success IDs', async (body) => {
    const fetchImplementation = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse({ protocolVersion: 2, token }, 200))
      .mockResolvedValueOnce(jsonResponse(body, 201));

    await expect(
      saveImportRequestToLocalService(importRequest, fetchImplementation),
    ).resolves.toMatchObject({ ok: false, code: 'invalid_response' });
  });

  it('requires an application/json success response', async () => {
    const fetchImplementation = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse({ protocolVersion: 2, token }, 200))
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ ids: [1] }), {
          status: 201,
          headers: { 'Content-Type': 'text/plain' },
        }),
      );

    await expect(
      saveImportRequestToLocalService(importRequest, fetchImplementation),
    ).resolves.toMatchObject({ ok: false, code: 'invalid_response' });
    expect(fetchImplementation).toHaveBeenCalledTimes(2);
  });

  it.each([
    [400, 'invalid_data', '当前岗位数据格式不兼容，未保存。'],
    [403, 'invalid_session', '本地服务会话无效，请重新保存。'],
    [409, 'import_conflict', '本次保存请求与本地记录冲突，请重新保存。'],
    [413, 'payload_too_large', '当前岗位数据过大，未保存。'],
    [500, 'save_failed', '本地服务保存失败。'],
  ])('maps HTTP %i without retrying', async (status, code, message) => {
    const fetchImplementation = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse({ protocolVersion: 2, token }, 200))
      .mockResolvedValueOnce(
        jsonResponse({ private: 'must not surface' }, status),
      );

    expect(
      await saveImportRequestToLocalService(
        importRequest,
        fetchImplementation,
      ),
    ).toEqual({ ok: false, code, message });
    expect(fetchImplementation).toHaveBeenCalledTimes(2);
  });

  it('does not retry a session connection failure', async () => {
    const fetchImplementation = vi
      .fn<typeof fetch>()
      .mockRejectedValue(new Error('private network detail'));

    await expect(
      saveImportRequestToLocalService(importRequest, fetchImplementation),
    ).resolves.toMatchObject({ ok: false, code: 'unavailable' });
    expect(fetchImplementation).toHaveBeenCalledTimes(1);
  });

  it('retries one unknown POST outcome with the same payload and client ID', async () => {
    const fetchImplementation = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse({ protocolVersion: 2, token }, 200))
      .mockRejectedValueOnce(new TypeError('connection reset'))
      .mockResolvedValueOnce(jsonResponse({ ids: [71] }, 201));

    await expect(
      saveImportRequestToLocalService(importRequest, fetchImplementation),
    ).resolves.toEqual({ ok: true, count: 1 });

    expect(fetchImplementation).toHaveBeenCalledTimes(3);
    const firstPost = fetchImplementation.mock.calls[1]?.[1];
    const replayPost = fetchImplementation.mock.calls[2]?.[1];
    expect(replayPost?.body).toBe(firstPost?.body);
    expect(replayPost?.headers).toEqual(firstPost?.headers);
    expect(replayPost?.body).toContain(importRequest.clientImportId);
  });

  it('stops after one retry when both POST outcomes are unknown', async () => {
    const fetchImplementation = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse({ protocolVersion: 2, token }, 200))
      .mockRejectedValue(new TypeError('connection reset'));

    await expect(
      saveImportRequestToLocalService(importRequest, fetchImplementation),
    ).resolves.toMatchObject({ ok: false, code: 'unavailable' });
    expect(fetchImplementation).toHaveBeenCalledTimes(3);
  });

  it('retries when the successful POST response body is lost after headers', async () => {
    const fetchImplementation = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse({ protocolVersion: 2, token }, 200))
      .mockResolvedValueOnce(new Response(new ReadableStream({
        start(controller) { controller.error(new TypeError('connection reset')); },
      }), { status: 201, headers: { 'Content-Type': 'application/json' } }))
      .mockResolvedValueOnce(jsonResponse({ ids: [71] }, 201));

    await expect(saveImportRequestToLocalService(importRequest, fetchImplementation))
      .resolves.toEqual({ ok: true, count: 1 });
    expect(fetchImplementation).toHaveBeenCalledTimes(3);
    expect(fetchImplementation.mock.calls[2]?.[1]?.body)
      .toBe(fetchImplementation.mock.calls[1]?.[1]?.body);
  });

  it('keeps the timeout active while receiving the body and retries at most once', async () => {
    vi.useFakeTimers();
    const fetchImplementation = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse({ protocolVersion: 2, token }, 200))
      .mockImplementation(async (_input, init) => new Response(new ReadableStream({
        start(controller) {
          init?.signal?.addEventListener('abort', () =>
            controller.error(new DOMException('Timed out', 'AbortError')));
        },
      }), { status: 201, headers: { 'Content-Type': 'application/json' } }));

    const pending = saveImportRequestToLocalService(importRequest, fetchImplementation);
    await vi.advanceTimersByTimeAsync(10_001);
    expect(fetchImplementation).toHaveBeenCalledTimes(3);
    await expect(pending).resolves.toMatchObject({ ok: false, code: 'unavailable' });
  });

  it('does not retry a complete but malformed JSON success response', async () => {
    const fetchImplementation = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse({ protocolVersion: 2, token }, 200))
      .mockResolvedValueOnce(new Response('{invalid', {
        status: 201, headers: { 'Content-Type': 'application/json' },
      }));

    await expect(saveImportRequestToLocalService(importRequest, fetchImplementation))
      .resolves.toMatchObject({ ok: false, code: 'invalid_response' });
    expect(fetchImplementation).toHaveBeenCalledTimes(2);
  });

  it('performs a new handshake for every separate save action', async () => {
    const secondToken = 'b'.repeat(64);
    const fetchImplementation = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse({ protocolVersion: 2, token }, 200))
      .mockResolvedValueOnce(jsonResponse({ ids: [1] }, 201))
      .mockResolvedValueOnce(
        jsonResponse({ protocolVersion: 2, token: secondToken }, 200),
      )
      .mockResolvedValueOnce(jsonResponse({ ids: [2] }, 201));

    await saveImportRequestToLocalService(importRequest, fetchImplementation);
    await saveImportRequestToLocalService(
      {
        ...importRequest,
        clientImportId: '9cd691fa-01d8-4f06-a874-7af308a86f51',
      },
      fetchImplementation,
    );

    expect(fetchImplementation.mock.calls[0]?.[0]).toContain('/bridge/session');
    expect(fetchImplementation.mock.calls[2]?.[0]).toContain('/bridge/session');
    expect(fetchImplementation.mock.calls[1]?.[1]?.headers).toMatchObject({
      'X-Boss-Job-Radar-Token': token,
    });
    expect(fetchImplementation.mock.calls[3]?.[1]?.headers).toMatchObject({
      'X-Boss-Job-Radar-Token': secondToken,
    });
  });
});
