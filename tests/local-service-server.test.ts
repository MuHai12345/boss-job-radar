import { request } from 'node:http';

import { describe, expect, expectTypeOf, it } from 'vitest';

import {
  LOCAL_SERVICE_HOST,
  startLocalService,
  type ImportBatchWriter,
} from '../src/local-service/server';

const TEST_IMPORT_WRITER: ImportBatchWriter = {
  importBatch() {
    return { ids: [] };
  },
};

interface LocalResponse {
  body: string;
  headers: Record<string, string | string[] | undefined>;
  statusCode: number | undefined;
}

function sendLocalRequest(
  port: number,
  method: string,
  path: string,
  headers: Record<string, string> = {},
): Promise<LocalResponse> {
  return new Promise((resolve, reject) => {
    const clientRequest = request(
      {
        headers,
        host: LOCAL_SERVICE_HOST,
        method,
        path,
        port,
      },
      (response) => {
        const chunks: Buffer[] = [];

        response.on('data', (chunk: Buffer) => chunks.push(chunk));
        response.on('end', () => {
          resolve({
            body: Buffer.concat(chunks).toString('utf8'),
            headers: response.headers,
            statusCode: response.statusCode,
          });
        });
      },
    );

    clientRequest.on('error', reject);
    clientRequest.end();
  });
}

describe('loopback-only local service', () => {
  it('exposes a start API with only the port and narrow ingestion dependency', () => {
    expectTypeOf<Parameters<typeof startLocalService>>().toEqualTypeOf<
      [
        options: {
          readonly imports: ImportBatchWriter;
          readonly port: number;
        },
      ]
    >();
  });

  it('always binds the actual listener to IPv4 loopback and supports port 0', async () => {
    const service = await startLocalService({
      host: '0.0.0.0',
      imports: TEST_IMPORT_WRITER,
      port: 0,
    } as unknown as {
      imports: ImportBatchWriter;
      port: number;
    });

    try {
      expect(LOCAL_SERVICE_HOST).toBe('127.0.0.1');
      expect(service.address).toEqual({
        family: 'IPv4',
        host: LOCAL_SERVICE_HOST,
        port: expect.any(Number),
      });
      expect(service.address.port).toBeGreaterThan(0);
    } finally {
      await service.close();
    }
  });

  it('serves the stable health contract without reflecting local or request data', async () => {
    const service = await startLocalService({
      imports: TEST_IMPORT_WRITER,
      port: 0,
    });
    const environmentSentinel = 'environment-secret-sentinel';
    const headerSentinel = 'request-header-secret-sentinel';
    const previousSentinel = process.env.BOSS_JOB_RADAR_TEST_SENTINEL;
    process.env.BOSS_JOB_RADAR_TEST_SENTINEL = environmentSentinel;

    try {
      const response = await sendLocalRequest(
        service.address.port,
        'GET',
        '/health',
        { 'x-test-secret': headerSentinel },
      );

      expect(response.statusCode).toBe(200);
      expect(response.headers['content-type']).toMatch(/^application\/json\b/);
      expect(JSON.parse(response.body)).toEqual({
        service: 'boss-job-radar-local',
        status: 'ok',
      });
      expect(response.body).not.toContain(environmentSentinel);
      expect(response.body).not.toContain(headerSentinel);
      expect(response.body).not.toContain(process.cwd());
      expect(response.headers['access-control-allow-origin']).toBeUndefined();
    } finally {
      if (previousSentinel === undefined) {
        delete process.env.BOSS_JOB_RADAR_TEST_SENTINEL;
      } else {
        process.env.BOSS_JOB_RADAR_TEST_SENTINEL = previousSentinel;
      }
      await service.close();
    }
  });

  it('returns 404 for an unknown route without permissive CORS', async () => {
    const service = await startLocalService({
      imports: TEST_IMPORT_WRITER,
      port: 0,
    });

    try {
      const response = await sendLocalRequest(
        service.address.port,
        'GET',
        '/unknown',
      );

      expect(response.statusCode).toBe(404);
      expect(response.headers['access-control-allow-origin']).toBeUndefined();
    } finally {
      await service.close();
    }
  });

  it('returns 405 and Allow: GET for an unsupported health method', async () => {
    const service = await startLocalService({
      imports: TEST_IMPORT_WRITER,
      port: 0,
    });

    try {
      const response = await sendLocalRequest(
        service.address.port,
        'POST',
        '/health',
      );

      expect(response.statusCode).toBe(405);
      expect(response.headers.allow).toBe('GET');
      expect(response.headers['access-control-allow-origin']).toBeUndefined();
    } finally {
      await service.close();
    }
  });

  it('closes cleanly and releases its listener', async () => {
    const service = await startLocalService({
      imports: TEST_IMPORT_WRITER,
      port: 0,
    });

    await service.close();

    await expect(
      sendLocalRequest(service.address.port, 'GET', '/health'),
    ).rejects.toMatchObject({ code: 'ECONNREFUSED' });
  });
});
