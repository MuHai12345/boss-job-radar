import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  LOCAL_SERVICE_BASE_URL,
  saveObservationsToLocalService,
} from '../src/bridge/local-service-client';
import type { JobObservationInput } from '../src/shared/job-observation-types';

const observation: JobObservationInput = {
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
};

const token = 'a'.repeat(64);

function jsonResponse(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('saveObservationsToLocalService', () => {
  it('gets a fresh session before posting observations to the fixed loopback URL', async () => {
    const fetchImplementation = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse({ protocolVersion: 1, token }, 200))
      .mockResolvedValueOnce(jsonResponse({ ids: [41] }, 201));

    const result = await saveObservationsToLocalService(
      [observation],
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
      body: JSON.stringify({ observations: [observation] }),
    });
  });

  it('rejects an incompatible protocol version without posting', async () => {
    const fetchImplementation = vi
      .fn<typeof fetch>()
      .mockResolvedValue(jsonResponse({ protocolVersion: 2, token }, 200));

    await expect(
      saveObservationsToLocalService([observation], fetchImplementation),
    ).resolves.toEqual({
      ok: false,
      code: 'incompatible_version',
      message: '本地服务版本与扩展不兼容。',
    });
    expect(fetchImplementation).toHaveBeenCalledTimes(1);
  });

  it.each([
    { protocolVersion: 1, token: 'short' },
    { protocolVersion: 1, token: 'A'.repeat(64) },
    { protocolVersion: 1, token: 42 },
    { protocolVersion: 1 },
  ])('rejects an invalid session token without posting', async (body) => {
    const fetchImplementation = vi
      .fn<typeof fetch>()
      .mockResolvedValue(jsonResponse(body, 200));

    const result = await saveObservationsToLocalService(
      [observation],
      fetchImplementation,
    );

    expect(result).toEqual({
      ok: false,
      code: 'invalid_response',
      message: '本地服务返回了无法识别的响应。',
    });
    expect(fetchImplementation).toHaveBeenCalledTimes(1);
  });

  it.each([
    { ids: [0] },
    { ids: [-1] },
    { ids: [1.5] },
    { ids: [Number.MAX_SAFE_INTEGER + 1] },
    { ids: ['1'] },
    { ids: [1], extra: true },
  ])('rejects invalid success IDs', async (body) => {
    const fetchImplementation = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse({ protocolVersion: 1, token }, 200))
      .mockResolvedValueOnce(jsonResponse(body, 201));

    await expect(
      saveObservationsToLocalService([observation], fetchImplementation),
    ).resolves.toMatchObject({ ok: false, code: 'invalid_response' });
  });

  it('rejects a success response whose ID count differs from the batch', async () => {
    const fetchImplementation = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse({ protocolVersion: 1, token }, 200))
      .mockResolvedValueOnce(jsonResponse({ ids: [1, 2] }, 201));

    await expect(
      saveObservationsToLocalService([observation], fetchImplementation),
    ).resolves.toMatchObject({ ok: false, code: 'invalid_response' });
  });

  it.each([
    [400, 'invalid_data', '当前岗位数据格式不兼容，未保存。'],
    [403, 'invalid_session', '本地服务会话无效，请重新保存。'],
    [413, 'payload_too_large', '当前岗位数据过大，未保存。'],
    [500, 'save_failed', '本地服务保存失败。'],
  ])('maps HTTP %i to a stable failure', async (status, code, message) => {
    const fetchImplementation = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse({ protocolVersion: 1, token }, 200))
      .mockResolvedValueOnce(jsonResponse({ private: 'must not surface' }, status));

    expect(
      await saveObservationsToLocalService([observation], fetchImplementation),
    ).toEqual({ ok: false, code, message });
    expect(fetchImplementation).toHaveBeenCalledTimes(2);
  });

  it('returns a stable connection failure and does not retry', async () => {
    const fetchImplementation = vi
      .fn<typeof fetch>()
      .mockRejectedValue(new Error('private network detail'));

    expect(
      await saveObservationsToLocalService([observation], fetchImplementation),
    ).toEqual({
      ok: false,
      code: 'unavailable',
      message: '本地服务未启动或无法连接。',
    });
    expect(fetchImplementation).toHaveBeenCalledTimes(1);
  });

  it('aborts a timed-out request after five seconds without retrying', async () => {
    vi.useFakeTimers();
    const fetchImplementation = vi.fn<typeof fetch>((_input, init) => {
      return new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => {
          reject(new DOMException('Aborted', 'AbortError'));
        });
      });
    });

    const pending = saveObservationsToLocalService(
      [observation],
      fetchImplementation,
    );
    await vi.advanceTimersByTimeAsync(5_000);

    await expect(pending).resolves.toMatchObject({
      ok: false,
      code: 'unavailable',
    });
    expect(fetchImplementation).toHaveBeenCalledTimes(1);
    expect(fetchImplementation.mock.calls[0]?.[1]?.signal?.aborted).toBe(true);
  });

  it('applies an independent five-second timeout to the observations POST', async () => {
    vi.useFakeTimers();
    const fetchImplementation = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse({ protocolVersion: 1, token }, 200))
      .mockImplementationOnce((_input, init) => {
        return new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => {
            reject(new DOMException('Aborted', 'AbortError'));
          });
        });
      });

    const pending = saveObservationsToLocalService(
      [observation],
      fetchImplementation,
    );
    await vi.advanceTimersByTimeAsync(5_000);

    await expect(pending).resolves.toMatchObject({
      ok: false,
      code: 'unavailable',
    });
    expect(fetchImplementation).toHaveBeenCalledTimes(2);
    expect(fetchImplementation.mock.calls[1]?.[1]?.signal?.aborted).toBe(true);
  });

  it('performs a new handshake on every save and does not reuse a token', async () => {
    const secondToken = 'b'.repeat(64);
    const fetchImplementation = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse({ protocolVersion: 1, token }, 200))
      .mockResolvedValueOnce(jsonResponse({ ids: [1] }, 201))
      .mockResolvedValueOnce(
        jsonResponse({ protocolVersion: 1, token: secondToken }, 200),
      )
      .mockResolvedValueOnce(jsonResponse({ ids: [2] }, 201));

    await saveObservationsToLocalService([observation], fetchImplementation);
    await saveObservationsToLocalService([observation], fetchImplementation);

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
