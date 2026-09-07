import { request } from 'node:http';
import { describe, expect, it, vi } from 'vitest';

import {
  LOCAL_SERVICE_HOST,
  startLocalService,
  type ImportBatchWriter,
  type JobLinkCheckWriter,
} from '../src/local-service/server';

const IMPORTS: ImportBatchWriter = {
  importBatch() {
    return { ids: [] };
  },
};

interface ResponseValue {
  body: string;
  statusCode: number | undefined;
}

function send(
  port: number,
  method: string,
  path: string,
  headers: Record<string, string> = {},
  body = '',
): Promise<ResponseValue> {
  return new Promise((resolve, reject) => {
    const client = request({
      host: LOCAL_SERVICE_HOST,
      port,
      method,
      path,
      headers,
    }, (response) => {
      const chunks: Buffer[] = [];
      response.on('data', (chunk: Buffer) => chunks.push(chunk));
      response.on('end', () => resolve({
        body: Buffer.concat(chunks).toString('utf8'),
        statusCode: response.statusCode,
      }));
    });
    client.on('error', reject);
    client.end(body);
  });
}

async function sessionToken(port: number): Promise<string> {
  const response = await send(port, 'GET', '/bridge/session');
  expect(response.statusCode).toBe(200);
  return (JSON.parse(response.body) as { token: string }).token;
}

function protectedHeaders(token: string): Record<string, string> {
  return {
    'content-type': 'application/json; charset=utf-8',
    origin: 'chrome-extension://synthetic-extension-id',
    'x-boss-job-radar-token': token,
  };
}

const VALID_BODY = JSON.stringify({
  jobUrl: 'https://www.zhipin.com/job_detail/server-example.html',
  observedAt: '2026-09-07T10:00:00.000Z',
  status: 'available',
  markerCode: null,
});

describe('/job-link-checks local bridge', () => {
  it('accepts an authenticated valid request and forwards only the validated fact', async () => {
    const append = vi.fn(() => ({ id: 41 }));
    const linkChecks: JobLinkCheckWriter = { append };
    const service = await startLocalService({ imports: IMPORTS, linkChecks, port: 0 });
    try {
      const token = await sessionToken(service.address.port);
      const response = await send(
        service.address.port,
        'POST',
        '/job-link-checks',
        protectedHeaders(token),
        VALID_BODY,
      );

      expect(response.statusCode).toBe(201);
      expect(JSON.parse(response.body)).toEqual({ id: 41 });
      expect(append).toHaveBeenCalledOnce();
      expect(append).toHaveBeenCalledWith({
        jobUrl: 'https://www.zhipin.com/job_detail/server-example.html',
        observedAt: '2026-09-07T10:00:00.000Z',
        status: 'available',
        markerCode: null,
      });
    } finally {
      await service.close();
    }
  });

  it('returns 404 when the canonical job is not present locally', async () => {
    const service = await startLocalService({
      imports: IMPORTS,
      linkChecks: { append: () => null },
      port: 0,
    });
    try {
      const token = await sessionToken(service.address.port);
      const response = await send(service.address.port, 'POST', '/job-link-checks', protectedHeaders(token), VALID_BODY);
      expect(response.statusCode).toBe(404);
      expect(JSON.parse(response.body)).toEqual({ error: 'job_not_found' });
    } finally {
      await service.close();
    }
  });

  it('rejects missing or wrong bridge tokens before invoking storage', async () => {
    const append = vi.fn(() => ({ id: 1 }));
    const service = await startLocalService({ imports: IMPORTS, linkChecks: { append }, port: 0 });
    try {
      const token = await sessionToken(service.address.port);
      const missing = protectedHeaders(token);
      delete missing['x-boss-job-radar-token'];
      expect((await send(service.address.port, 'POST', '/job-link-checks', missing, VALID_BODY)).statusCode).toBe(403);
      expect((await send(service.address.port, 'POST', '/job-link-checks', protectedHeaders('0'.repeat(64)), VALID_BODY)).statusCode).toBe(403);
      expect(append).not.toHaveBeenCalled();
    } finally {
      await service.close();
    }
  });

  it('rejects non-extension origins and wrong Host headers before invoking storage', async () => {
    const append = vi.fn(() => ({ id: 1 }));
    const service = await startLocalService({ imports: IMPORTS, linkChecks: { append }, port: 0 });
    try {
      const token = await sessionToken(service.address.port);
      expect((await send(service.address.port, 'POST', '/job-link-checks', {
        ...protectedHeaders(token),
        origin: 'https://example.com',
      }, VALID_BODY)).statusCode).toBe(403);
      expect((await send(service.address.port, 'POST', '/job-link-checks', {
        ...protectedHeaders(token),
        host: `localhost:${service.address.port}`,
      }, VALID_BODY)).statusCode).toBe(403);
      expect(append).not.toHaveBeenCalled();
    } finally {
      await service.close();
    }
  });

  it('rejects unsupported media types and malformed link facts', async () => {
    const append = vi.fn(() => ({ id: 1 }));
    const service = await startLocalService({ imports: IMPORTS, linkChecks: { append }, port: 0 });
    try {
      const token = await sessionToken(service.address.port);
      expect((await send(service.address.port, 'POST', '/job-link-checks', {
        ...protectedHeaders(token),
        'content-type': 'text/plain',
      }, VALID_BODY)).statusCode).toBe(415);
      expect((await send(service.address.port, 'POST', '/job-link-checks', protectedHeaders(token), JSON.stringify({
        jobUrl: 'https://www.zhipin.com/job_detail/server-example.html',
        observedAt: 'bad-time',
        status: 'explicitly_unavailable',
        markerCode: null,
      }))).statusCode).toBe(400);
      expect(append).not.toHaveBeenCalled();
    } finally {
      await service.close();
    }
  });

  it('returns a generic internal error when storage fails', async () => {
    const service = await startLocalService({
      imports: IMPORTS,
      linkChecks: { append() { throw new Error('PRIVATE_DATABASE_DETAIL'); } },
      port: 0,
    });
    try {
      const token = await sessionToken(service.address.port);
      const response = await send(service.address.port, 'POST', '/job-link-checks', protectedHeaders(token), VALID_BODY);
      expect(response.statusCode).toBe(500);
      expect(JSON.parse(response.body)).toEqual({ error: 'internal_error' });
      expect(response.body).not.toContain('PRIVATE_DATABASE_DETAIL');
    } finally {
      await service.close();
    }
  });
});
