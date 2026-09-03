import { request } from 'node:http';

import { afterEach, describe, expect, it } from 'vitest';

import {
  openLocalDatabase,
  type LocalDatabase,
} from '../src/local-service/database/database';
import type { JobObservationInput } from '../src/local-service/database/observation-repository';
import {
  LOCAL_SERVICE_HOST,
  startLocalService,
  type LocalService,
} from '../src/local-service/server';

const JSON_HEADERS = { 'content-type': 'application/json' };
const services: LocalService[] = [];
const databases: LocalDatabase[] = [];

interface LocalResponse {
  readonly body: string;
  readonly headers: Record<string, string | string[] | undefined>;
  readonly statusCode: number | undefined;
}

function createObservation(
  overrides: Partial<JobObservationInput> = {},
): JobObservationInput {
  return {
    capturedAt: '2026-09-03T10:00:00.000Z',
    companyName: '合成测试公司',
    educationText: null,
    experienceText: '',
    fullJdText: '仅用于 synthetic test 的完整 JD',
    jobHrefRaw: '/job_detail/synthetic.html',
    jobUrl: 'https://example.invalid/job_detail/synthetic.html',
    locationText: '上海·测试区',
    missingFields: [],
    pageType: 'job_detail',
    publishedText: null,
    rawText: 'synthetic raw observation',
    recruiterActivityText: null,
    salaryText: 'synthetic salary',
    sourcePageUrl: 'https://example.invalid/source',
    tags: ['synthetic', 'test'],
    title: '合成电商运营助理',
    warnings: ['synthetic_only'],
    ...overrides,
  };
}

async function startTestService(
  observations?: {
    appendMany(inputs: readonly JobObservationInput[]): { ids: number[] };
  },
): Promise<{ database?: LocalDatabase; service: LocalService }> {
  let database: LocalDatabase | undefined;
  if (observations === undefined) {
    database = openLocalDatabase({ path: ':memory:' });
    databases.push(database);
    observations = database.observations;
  }

  const service = await startLocalService({
    observations,
    port: 0,
  });
  services.push(service);
  return { database, service };
}

function sendLocalRequest(options: {
  readonly body?: Buffer | string;
  readonly chunks?: readonly Buffer[];
  readonly headers?: Record<string, string>;
  readonly method: string;
  readonly path: string;
  readonly port: number;
  readonly setHost?: boolean;
}): Promise<LocalResponse> {
  return new Promise((resolve, reject) => {
    const clientRequest = request(
      {
        headers: options.headers,
        host: LOCAL_SERVICE_HOST,
        method: options.method,
        path: options.path,
        port: options.port,
        setHost: options.setHost,
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
    if (options.body !== undefined) {
      clientRequest.write(options.body);
    }
    for (const chunk of options.chunks ?? []) {
      clientRequest.write(chunk);
    }
    clientRequest.end();
  });
}

async function getSession(service: LocalService): Promise<{
  readonly protocolVersion: number;
  readonly token: string;
}> {
  const response = await sendLocalRequest({
    method: 'GET',
    path: '/bridge/session',
    port: service.address.port,
  });
  expect(response.statusCode).toBe(200);
  expect(response.headers['content-type']).toBe(
    'application/json; charset=utf-8',
  );
  expect(response.headers['cache-control']).toBe('no-store');
  expect(response.headers['access-control-allow-origin']).toBeUndefined();
  return JSON.parse(response.body) as {
    protocolVersion: number;
    token: string;
  };
}

async function postObservations(options: {
  readonly body?: Buffer | string;
  readonly chunks?: readonly Buffer[];
  readonly headers?: Record<string, string>;
  readonly service: LocalService;
  readonly token: string;
}): Promise<LocalResponse> {
  return sendLocalRequest({
    body: options.body,
    chunks: options.chunks,
    headers: {
      ...JSON_HEADERS,
      'x-boss-job-radar-token': options.token,
      ...options.headers,
    },
    method: 'POST',
    path: '/observations',
    port: options.service.address.port,
  });
}

afterEach(async () => {
  await Promise.all(services.splice(0).map((service) => service.close()));
  for (const database of databases.splice(0)) {
    database.close();
  }
});

describe('secured loopback observation ingestion', () => {
  it('creates a different high-entropy in-memory token for each service instance', async () => {
    const first = await startTestService();
    const second = await startTestService();

    const firstSession = await getSession(first.service);
    const secondSession = await getSession(second.service);

    expect(firstSession).toEqual({
      protocolVersion: 1,
      token: expect.stringMatching(/^[0-9a-f]{64}$/),
    });
    expect(secondSession.token).toMatch(/^[0-9a-f]{64}$/);
    expect(secondSession.token).not.toBe(firstSession.token);
  });

  it('does not expose the bridge token through the stable health response', async () => {
    const { service } = await startTestService();
    const { token } = await getSession(service);
    const response = await sendLocalRequest({
      method: 'GET',
      path: '/health',
      port: service.address.port,
    });

    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response.body)).toEqual({
      service: 'boss-job-radar-local',
      status: 'ok',
    });
    expect(response.body).not.toContain(token);
  });

  it.each([undefined, 'wrong-synthetic-token'])(
    'rejects a missing or wrong bridge token with 403',
    async (token) => {
      const { service } = await startTestService();
      const response = await sendLocalRequest({
        body: JSON.stringify({ observations: [createObservation()] }),
        headers: {
          ...JSON_HEADERS,
          ...(token === undefined
            ? {}
            : { 'x-boss-job-radar-token': token }),
        },
        method: 'POST',
        path: '/observations',
        port: service.address.port,
      });

      expect(response.statusCode).toBe(403);
      expect(response.body).not.toContain('wrong-synthetic-token');
    },
  );

  it.each([
    'https://example.com',
    'http://example.com',
    'http://127.0.0.1',
    'null',
    'file:///synthetic.html',
  ])('rejects a web or opaque Origin: %s', async (origin) => {
    const { service } = await startTestService();
    const { token } = await getSession(service);
    const response = await postObservations({
      body: JSON.stringify({ observations: [createObservation()] }),
      headers: { origin },
      service,
      token,
    });

    expect(response.statusCode).toBe(403);
  });

  it('allows a syntactically valid Chrome extension Origin', async () => {
    const { service } = await startTestService();
    const { token } = await getSession(service);
    const response = await postObservations({
      body: JSON.stringify({ observations: [createObservation()] }),
      headers: { origin: 'chrome-extension://synthetic-extension-id' },
      service,
      token,
    });

    expect(response.statusCode).toBe(201);
  });

  it.each([
    'chrome-extension://',
    'chrome-extension:///missing-host',
    'chrome-extension://synthetic-id/path',
    'chrome-extension://synthetic-id?query=1',
    'chrome-extension://synthetic-id#fragment',
  ])('rejects a malformed extension Origin: %s', async (origin) => {
    const { service } = await startTestService();
    const { token } = await getSession(service);
    const response = await postObservations({
      body: JSON.stringify({ observations: [createObservation()] }),
      headers: { origin },
      service,
      token,
    });

    expect(response.statusCode).toBe(403);
  });

  it('rejects a wrong Host without trusting forwarded host headers', async () => {
    const { service } = await startTestService();
    const { token } = await getSession(service);
    const response = await postObservations({
      body: JSON.stringify({ observations: [createObservation()] }),
      headers: {
        forwarded: `host=127.0.0.1:${service.address.port}`,
        host: 'attacker.example',
        'x-forwarded-host': `127.0.0.1:${service.address.port}`,
      },
      service,
      token,
    });

    expect(response.statusCode).toBe(403);
  });

  it('rejects a wrong Host when reading the bridge session', async () => {
    const { service } = await startTestService();
    const response = await sendLocalRequest({
      headers: { host: 'attacker.example' },
      method: 'GET',
      path: '/bridge/session',
      port: service.address.port,
    });

    expect(response.statusCode).toBe(403);
    expect(response.body).not.toMatch(/[0-9a-f]{64}/u);
  });

  it('rejects a missing Host on protected routes', async () => {
    const { service } = await startTestService();
    const sessionResponse = await sendLocalRequest({
      method: 'GET',
      path: '/bridge/session',
      port: service.address.port,
      setHost: false,
    });
    const postResponse = await sendLocalRequest({
      body: JSON.stringify({ observations: [createObservation()] }),
      headers: JSON_HEADERS,
      method: 'POST',
      path: '/observations',
      port: service.address.port,
      setHost: false,
    });

    // Node's HTTP/1.1 parser rejects a missing Host before dispatching the
    // request handler, so the protected routes are never reached.
    expect(sessionResponse.statusCode).toBe(400);
    expect(postResponse.statusCode).toBe(400);
  });

  it('does not authorize OPTIONS preflight or emit permissive CORS headers', async () => {
    const { service } = await startTestService();
    const response = await sendLocalRequest({
      headers: {
        origin: 'https://example.com',
        'access-control-request-headers': 'x-boss-job-radar-token',
        'access-control-request-method': 'POST',
      },
      method: 'OPTIONS',
      path: '/observations',
      port: service.address.port,
    });

    expect(response.statusCode).toBe(405);
    expect(response.headers.allow).toBe('POST');
    expect(response.headers['access-control-allow-origin']).toBeUndefined();
    expect(response.headers['access-control-allow-headers']).toBeUndefined();
    expect(response.headers['access-control-allow-methods']).toBeUndefined();
  });

  it.each(['text/plain', 'application/x-www-form-urlencoded'])(
    'rejects safelisted form content type %s even when the body is valid JSON',
    async (contentType) => {
      const { service } = await startTestService();
      const { token } = await getSession(service);
      const response = await postObservations({
        body: JSON.stringify({ observations: [createObservation()] }),
        headers: { 'content-type': contentType },
        service,
        token,
      });

      expect(response.statusCode).toBe(415);
    },
  );

  it('rejects a missing Content-Type', async () => {
    const { service } = await startTestService();
    const { token } = await getSession(service);
    const response = await sendLocalRequest({
      body: JSON.stringify({ observations: [createObservation()] }),
      headers: { 'x-boss-job-radar-token': token },
      method: 'POST',
      path: '/observations',
      port: service.address.port,
    });

    expect(response.statusCode).toBe(415);
  });

  it('accepts application/json with a utf-8 charset parameter', async () => {
    const { service } = await startTestService();
    const { token } = await getSession(service);
    const response = await postObservations({
      body: JSON.stringify({ observations: [createObservation()] }),
      headers: { 'content-type': 'application/json; charset=utf-8' },
      service,
      token,
    });

    expect(response.statusCode).toBe(201);
  });

  it('rejects compressed request bodies', async () => {
    const { service } = await startTestService();
    const { token } = await getSession(service);
    const response = await postObservations({
      body: JSON.stringify({ observations: [createObservation()] }),
      headers: { 'content-encoding': 'gzip' },
      service,
      token,
    });

    expect(response.statusCode).toBe(415);
  });

  it('rejects Content-Length greater than 1 MiB before parsing', async () => {
    const { service } = await startTestService();
    const { token } = await getSession(service);
    const body = Buffer.alloc(1_048_577, 0x20);
    const response = await postObservations({
      body,
      headers: { 'content-length': String(body.length) },
      service,
      token,
    });

    expect(response.statusCode).toBe(413);
  });

  it('counts actual chunked bytes and rejects more than 1 MiB', async () => {
    const { service } = await startTestService();
    const { token } = await getSession(service);
    const response = await postObservations({
      chunks: [Buffer.alloc(700_000, 0x20), Buffer.alloc(400_000, 0x20)],
      service,
      token,
    });

    expect(response.statusCode).toBe(413);
  });

  it('rejects malformed JSON with a generic 400 response', async () => {
    const { service } = await startTestService();
    const { token } = await getSession(service);
    const response = await postObservations({
      body: '{"observations":[',
      service,
      token,
    });

    expect(response.statusCode).toBe(400);
    expect(JSON.parse(response.body)).toEqual({ error: 'invalid_request' });
  });

  it.each([
    ['empty batch', { observations: [] }],
    [
      'more than 100 observations',
      { observations: Array.from({ length: 101 }, () => createObservation()) },
    ],
    [
      'unsupported page type',
      { observations: [createObservation({ pageType: 'unknown' as 'job_detail' })] },
    ],
    [
      'wrong nullable field type',
      { observations: [createObservation({ title: 42 as unknown as string })] },
    ],
    [
      'invalid string array',
      { observations: [createObservation({ tags: ['ok', 42] as string[] })] },
    ],
    [
      'missing required field',
      {
        observations: [
          Object.fromEntries(
            Object.entries(createObservation()).filter(
              ([key]) => key !== 'capturedAt',
            ),
          ),
        ],
      },
    ],
    [
      'unknown top-level key',
      { observations: [createObservation()], protocolVersion: 1 },
    ],
  ])('rejects invalid DTO shape: %s', async (_name, payload) => {
    const { service } = await startTestService();
    const { token } = await getSession(service);
    const response = await postObservations({
      body: JSON.stringify(payload),
      service,
      token,
    });

    expect(response.statusCode).toBe(400);
    expect(JSON.parse(response.body)).toEqual({ error: 'invalid_request' });
  });

  it('appends a complete valid observation and returns only its id', async () => {
    const { database, service } = await startTestService();
    const { token } = await getSession(service);
    const observation = createObservation();
    const response = await postObservations({
      body: JSON.stringify({ observations: [observation] }),
      service,
      token,
    });

    expect(response.statusCode).toBe(201);
    expect(response.headers['content-type']).toBe(
      'application/json; charset=utf-8',
    );
    expect(response.headers['access-control-allow-origin']).toBeUndefined();
    const responseBody = JSON.parse(response.body) as { ids: number[] };
    expect(responseBody).toEqual({ ids: [expect.any(Number)] });
    expect(database?.observations.getById(responseBody.ids[0]!)).toEqual({
      id: responseBody.ids[0],
      ...observation,
    });
    expect(response.body).not.toContain(observation.rawText);
  });

  it('returns batch ids in input order and keeps duplicates distinct', async () => {
    const { database, service } = await startTestService();
    const { token } = await getSession(service);
    const first = createObservation({ title: 'first synthetic' });
    const duplicate = createObservation({ title: 'duplicate synthetic' });
    const response = await postObservations({
      body: JSON.stringify({ observations: [first, duplicate, duplicate] }),
      service,
      token,
    });

    expect(response.statusCode).toBe(201);
    const { ids } = JSON.parse(response.body) as { ids: number[] };
    expect(ids).toHaveLength(3);
    expect(new Set(ids).size).toBe(3);
    expect(database?.observations.getById(ids[0]!)?.title).toBe(first.title);
    expect(database?.observations.getById(ids[1]!)?.title).toBe(duplicate.title);
    expect(database?.observations.getById(ids[2]!)?.title).toBe(duplicate.title);
  });

  it('returns a generic 500 without leaking database errors or request data', async () => {
    const sqlSentinel = 'SQLITE_SYNTHETIC_FAILURE';
    const pathSentinel = 'C:\\synthetic-secret\\database.sqlite3';
    const payloadSentinel = 'synthetic-sensitive-payload';
    const { service } = await startTestService({
      appendMany() {
        throw new Error(`${sqlSentinel} at ${pathSentinel}`);
      },
    });
    const { token } = await getSession(service);
    const response = await postObservations({
      body: JSON.stringify({
        observations: [createObservation({ rawText: payloadSentinel })],
      }),
      service,
      token,
    });

    expect(response.statusCode).toBe(500);
    expect(JSON.parse(response.body)).toEqual({ error: 'internal_error' });
    expect(response.body).not.toContain(sqlSentinel);
    expect(response.body).not.toContain(pathSentinel);
    expect(response.body).not.toContain(payloadSentinel);
    expect(response.body).not.toContain(token);
  });

  it.each([
    ['POST', '/bridge/session', 'GET'],
    ['GET', '/observations', 'POST'],
  ])(
    'returns 405 and Allow for %s %s',
    async (method, path, allow) => {
      const { service } = await startTestService();
      const response = await sendLocalRequest({
        method,
        path,
        port: service.address.port,
      });

      expect(response.statusCode).toBe(405);
      expect(response.headers.allow).toBe(allow);
    },
  );

  it('returns 404 for an unknown route without CORS headers', async () => {
    const { service } = await startTestService();
    const response = await sendLocalRequest({
      method: 'GET',
      path: '/synthetic-unknown',
      port: service.address.port,
    });

    expect(response.statusCode).toBe(404);
    expect(response.headers['access-control-allow-origin']).toBeUndefined();
  });
});
