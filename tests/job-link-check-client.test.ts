import { describe, expect, it, vi } from 'vitest';

import {
  LOCAL_SERVICE_BASE_URL,
  saveJobLinkCheckToLocalService,
} from '../src/bridge/local-service-client';
import type { JobLinkCheckRequest } from '../src/shared/job-link-check-types';

const REQUEST: JobLinkCheckRequest = {
  jobUrl: 'https://www.zhipin.com/job_detail/client-example.html',
  observedAt: '2026-09-07T10:00:00.000Z',
  status: 'available',
  markerCode: null,
};
const TOKEN = 'a'.repeat(64);

function jsonResponse(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  });
}

describe('local service job link check client', () => {
  it('uses a fresh session followed by one authenticated POST', async () => {
    const fetchImplementation = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ protocolVersion: 2, token: TOKEN }, 200))
      .mockResolvedValueOnce(jsonResponse({ id: 9 }, 201));

    await expect(saveJobLinkCheckToLocalService(
      REQUEST,
      fetchImplementation as unknown as typeof fetch,
    )).resolves.toEqual({ ok: true });

    expect(fetchImplementation).toHaveBeenCalledTimes(2);
    expect(fetchImplementation.mock.calls[0]?.[0]).toBe(`${LOCAL_SERVICE_BASE_URL}/bridge/session`);
    expect(fetchImplementation.mock.calls[0]?.[1]).toMatchObject({
      method: 'GET',
      cache: 'no-store',
      redirect: 'error',
      credentials: 'omit',
    });
    expect(fetchImplementation.mock.calls[1]?.[0]).toBe(`${LOCAL_SERVICE_BASE_URL}/job-link-checks`);
    expect(fetchImplementation.mock.calls[1]?.[1]).toMatchObject({
      method: 'POST',
      redirect: 'error',
      credentials: 'omit',
      body: JSON.stringify(REQUEST),
    });
  });

  it('starts a new session for each separate click-equivalent call', async () => {
    const fetchImplementation = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ protocolVersion: 2, token: 'a'.repeat(64) }, 200))
      .mockResolvedValueOnce(jsonResponse({ id: 1 }, 201))
      .mockResolvedValueOnce(jsonResponse({ protocolVersion: 2, token: 'b'.repeat(64) }, 200))
      .mockResolvedValueOnce(jsonResponse({ id: 2 }, 201));

    await saveJobLinkCheckToLocalService(REQUEST, fetchImplementation as unknown as typeof fetch);
    await saveJobLinkCheckToLocalService(REQUEST, fetchImplementation as unknown as typeof fetch);

    expect(fetchImplementation).toHaveBeenCalledTimes(4);
    expect(fetchImplementation.mock.calls[0]?.[0]).toBe(`${LOCAL_SERVICE_BASE_URL}/bridge/session`);
    expect(fetchImplementation.mock.calls[2]?.[0]).toBe(`${LOCAL_SERVICE_BASE_URL}/bridge/session`);
  });

  it('does not retry a link-check POST after a transport failure', async () => {
    const fetchImplementation = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ protocolVersion: 2, token: TOKEN }, 200))
      .mockRejectedValueOnce(new Error('connection reset'));

    await expect(saveJobLinkCheckToLocalService(
      REQUEST,
      fetchImplementation as unknown as typeof fetch,
    )).resolves.toEqual({ ok: false, message: '本地服务未启动或无法连接。' });
    expect(fetchImplementation).toHaveBeenCalledTimes(2);
  });

  it('maps a missing local job to the explicit not-saved message', async () => {
    const fetchImplementation = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ protocolVersion: 2, token: TOKEN }, 200))
      .mockResolvedValueOnce(jsonResponse({ error: 'job_not_found' }, 404));

    await expect(saveJobLinkCheckToLocalService(
      REQUEST,
      fetchImplementation as unknown as typeof fetch,
    )).resolves.toEqual({ ok: false, message: '该岗位尚未保存到本地。' });
  });

  it('rejects invalid requests before opening a bridge session', async () => {
    const fetchImplementation = vi.fn();
    await expect(saveJobLinkCheckToLocalService(
      { ...REQUEST, jobUrl: 'https://example.com/job_detail/client-example.html' },
      fetchImplementation as unknown as typeof fetch,
    )).resolves.toEqual({ ok: false, message: '本地服务未能保存岗位链接状态。' });
    expect(fetchImplementation).not.toHaveBeenCalled();
  });

  it('fails closed on malformed sessions and malformed success responses', async () => {
    const malformedSession = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ protocolVersion: 2, token: 'short' }, 200));
    await expect(saveJobLinkCheckToLocalService(
      REQUEST,
      malformedSession as unknown as typeof fetch,
    )).resolves.toEqual({ ok: false, message: '本地服务未能保存岗位链接状态。' });

    const malformedSuccess = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ protocolVersion: 2, token: TOKEN }, 200))
      .mockResolvedValueOnce(jsonResponse({ id: 0 }, 201));
    await expect(saveJobLinkCheckToLocalService(
      REQUEST,
      malformedSuccess as unknown as typeof fetch,
    )).resolves.toEqual({ ok: false, message: '本地服务未能保存岗位链接状态。' });
  });
});
