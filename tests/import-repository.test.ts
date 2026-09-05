import { createHash } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import SqliteDatabase from 'better-sqlite3';
import { describe, expect, it } from 'vitest';

import { fingerprintImportRequest } from '../src/local-service/database/import-fingerprint';
import {
  createImportRepository,
  ImportConflictError,
} from '../src/local-service/database/import-repository';
import { runMigrations } from '../src/local-service/database/migrations';
import { createJobObservationRepository } from '../src/local-service/database/observation-repository';
import type { ImportRequest } from '../src/shared/import-request-types';
import type { JobObservationInput } from '../src/shared/job-observation-types';
import { openLocalDatabase } from '../src/local-service/database/database';

function createObservation(
  overrides: Partial<JobObservationInput> = {},
): JobObservationInput {
  return {
    capturedAt: '2026-09-04T12:00:00.000Z',
    pageType: 'search_results',
    sourcePageUrl: 'https://www.zhipin.com/web/geek/jobs',
    jobHrefRaw: '/job_detail/example.html',
    jobUrl: 'https://www.zhipin.com/job_detail/example.html',
    title: '电商运营助理',
    companyName: '示例公司',
    salaryText: '8-10K',
    locationText: '上海',
    experienceText: '经验不限',
    educationText: '大专',
    tags: ['电商', '助理'],
    recruiterActivityText: null,
    publishedText: null,
    fullJdText: null,
    rawText: '原始卡片文本',
    missingFields: ['publishedText'],
    warnings: ['card_warning'],
    ...overrides,
  };
}

function createRequest(overrides: {
  readonly clientImportId?: string;
  readonly matchedCardCount?: number | null;
  readonly observations?: JobObservationInput[];
  readonly pageType?: 'search_results' | 'job_detail';
  readonly warnings?: string[];
} = {}): ImportRequest {
  const pageType = overrides.pageType ?? 'search_results';
  const capturedAt = '2026-09-04T12:00:00.000Z';
  const pageUrl = pageType === 'search_results'
    ? 'https://www.zhipin.com/web/geek/jobs'
    : 'https://www.zhipin.com/job_detail/example.html';
  const observations = overrides.observations ?? [
    createObservation({
      capturedAt,
      pageType,
      sourcePageUrl: pageUrl,
      fullJdText: pageType === 'job_detail' ? '完整 JD' : null,
    }),
  ];

  return {
    clientImportId:
      overrides.clientImportId ?? 'ce0f71ec-5a19-4a02-b0e3-956493673d3e',
    source: {
      pageType,
      pageUrl,
      capturedAt,
      matchedCardCount:
        overrides.matchedCardCount ??
        (pageType === 'search_results' ? observations.length : null),
      warnings: overrides.warnings ?? ['card_limit_reached', 'second_warning'],
    },
    observations,
  };
}

function openRepository(): {
  readonly database: InstanceType<typeof SqliteDatabase>;
  readonly repository: ReturnType<typeof createImportRepository>;
} {
  const database = new SqliteDatabase(':memory:');
  database.pragma('foreign_keys = ON');
  runMigrations(database);
  const observations = createJobObservationRepository(database);
  return {
    database,
    repository: createImportRepository(database, observations),
  };
}

describe('fingerprintImportRequest', () => {
  it('uses deterministic fixed-field SHA-256 over source and observations only', () => {
    const request = createRequest({ warnings: ['warning_a', 'warning_b'] });
    const canonicalPayload = JSON.stringify({
      source: {
        pageType: request.source.pageType,
        pageUrl: request.source.pageUrl,
        capturedAt: request.source.capturedAt,
        matchedCardCount: request.source.matchedCardCount,
        warnings: request.source.warnings,
      },
      observations: request.observations.map((observation) => ({
        capturedAt: observation.capturedAt,
        pageType: observation.pageType,
        sourcePageUrl: observation.sourcePageUrl,
        jobHrefRaw: observation.jobHrefRaw,
        jobUrl: observation.jobUrl,
        title: observation.title,
        companyName: observation.companyName,
        salaryText: observation.salaryText,
        locationText: observation.locationText,
        experienceText: observation.experienceText,
        educationText: observation.educationText,
        tags: observation.tags,
        recruiterActivityText: observation.recruiterActivityText,
        publishedText: observation.publishedText,
        fullJdText: observation.fullJdText,
        rawText: observation.rawText,
        missingFields: observation.missingFields,
        warnings: observation.warnings,
      })),
    });
    const expected = createHash('sha256')
      .update(canonicalPayload, 'utf8')
      .digest('hex');

    expect(fingerprintImportRequest(request)).toBe(expected);
    const reordered = JSON.parse(JSON.stringify(request), (_key, value: unknown) =>
      value !== null && typeof value === 'object' && !Array.isArray(value)
        ? Object.fromEntries(Object.entries(value).reverse())
        : value,
    ) as ImportRequest;
    expect(fingerprintImportRequest(reordered)).toBe(expected);
    expect(fingerprintImportRequest({
      ...request,
      observations: request.observations.map((observation) => ({
        ...observation, rawText: `${observation.rawText} changed`,
      })),
    })).not.toBe(expected);
    expect(
      fingerprintImportRequest({
        ...request,
        clientImportId: '9a084763-bebd-48cc-b434-8c695b325262',
      }),
    ).toBe(expected);
    expect(
      fingerprintImportRequest({
        ...request,
        source: { ...request.source, warnings: ['warning_b', 'warning_a'] },
      }),
    ).not.toBe(expected);
  });
});

describe('ImportRepository', () => {
  it('replays the original ordered IDs after a file-backed close and reopen', () => {
    const directory = mkdtempSync(join(tmpdir(), 'boss-import-replay-'));
    const path = join(directory, 'test.sqlite3');
    const request = createRequest({ observations: [
      createObservation(), createObservation({ jobUrl: null }),
    ] });
    let database = openLocalDatabase({ path });
    try {
      const original = database.imports.importBatch(request);
      const records = original.ids.map((id) => database.observations.getById(id));
      database.close();
      database = openLocalDatabase({ path });
      expect(database.imports.importBatch(request)).toEqual(original);
      expect(original.ids.map((id) => database.observations.getById(id))).toEqual(records);
      expect(records.every((record) => record?.importRunId !== null)).toBe(true);
      expect(database.observations.getById(Math.max(...original.ids) + 1)).toBeNull();
      expect(database.jobs.getById(3)).toBeNull();
    } finally {
      database.close();
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it.each(['search_insert', 'observation_insert', 'job_update'])(
    'rolls back provenance and existing Job lifecycle on %s failure', (failurePoint) => {
      const { database, repository } = openRepository();
      const observations = createJobObservationRepository(database);
      observations.append(createObservation({ capturedAt: '2026-09-03T12:00:00.000Z' }));
      const beforeJobs = database.prepare('SELECT * FROM jobs').all();
      const beforeObservations = database.prepare('SELECT * FROM job_observations').all();
      const trigger = {
        search_insert: 'BEFORE INSERT ON search_runs',
        observation_insert: "BEFORE INSERT ON job_observations WHEN NEW.title = 'fail'",
        job_update: "BEFORE UPDATE ON jobs WHEN NEW.job_url = 'https://www.zhipin.com/job_detail/example.html'",
      }[failurePoint];
      database.exec(`CREATE TRIGGER fail_import ${trigger}
        BEGIN SELECT RAISE(FAIL, 'forced import failure'); END;`);
      const request = createRequest({ observations: [
        createObservation({ jobUrl: 'https://www.zhipin.com/job_detail/new.html' }),
        createObservation(),
        createObservation({ title: 'fail' }),
      ] });
      try {
        expect(() => repository.importBatch(request)).toThrow('forced import failure');
        expect(database.prepare('SELECT * FROM jobs').all()).toEqual(beforeJobs);
        expect(database.prepare('SELECT * FROM job_observations').all()).toEqual(beforeObservations);
        expect(database.prepare('SELECT * FROM import_runs').all()).toEqual([]);
        expect(database.prepare('SELECT * FROM search_runs').all()).toEqual([]);
        expect(database.prepare('PRAGMA foreign_key_check').all()).toEqual([]);
      } finally {
        database.close();
      }
    },
  );

  it('validates source consistency before recording an import', () => {
    const { database, repository } = openRepository();
    const request = createRequest();
    try {
      expect(() => repository.importBatch({
        ...request,
        source: { ...request.source, capturedAt: 'inconsistent' },
      })).toThrow();
      expect(database.prepare('SELECT COUNT(*) AS count FROM import_runs').get())
        .toEqual({ count: 0 });
      expect(database.prepare('SELECT COUNT(*) AS count FROM jobs').get())
        .toEqual({ count: 0 });
    } finally {
      database.close();
    }
  });
  it('creates one ImportRun, SearchRun, linked observations, and preserves 143/100 counts', () => {
    const { database, repository } = openRepository();
    const observations = Array.from({ length: 100 }, (_, index) =>
      createObservation({
        jobHrefRaw: `/job_detail/${index}.html`,
        jobUrl: `https://www.zhipin.com/job_detail/${index}.html`,
        title: `岗位 ${index}`,
      }),
    );
    const request = createRequest({
      matchedCardCount: 143,
      observations,
      warnings: ['card_limit_reached', 'warning_after_limit'],
    });

    try {
      const result = repository.importBatch(request);

      expect(result.ids).toHaveLength(100);
      expect(database.prepare(`
        SELECT client_import_id, page_type, source_page_url, captured_at,
               matched_card_count, extraction_warnings_json,
               observation_count
        FROM import_runs
      `).get()).toEqual({
        client_import_id: request.clientImportId,
        page_type: 'search_results',
        source_page_url: request.source.pageUrl,
        captured_at: request.source.capturedAt,
        matched_card_count: 143,
        extraction_warnings_json:
          '["card_limit_reached","warning_after_limit"]',
        observation_count: 100,
      });
      expect(database.prepare(`
        SELECT matched_card_count, saved_observation_count,
               extraction_warnings_json
        FROM search_runs
      `).get()).toEqual({
        matched_card_count: 143,
        saved_observation_count: 100,
        extraction_warnings_json:
          '["card_limit_reached","warning_after_limit"]',
      });
      expect(database.prepare(`
        SELECT observation.id, observation.import_run_id, observation.job_id
        FROM search_runs AS search
        JOIN job_observations AS observation
          ON observation.import_run_id = search.import_run_id
        ORDER BY observation.id
      `).all()).toHaveLength(100);
      expect(database.prepare('PRAGMA foreign_key_check').all()).toEqual([]);
    } finally {
      database.close();
    }
  });

  it('returns original IDs for an identical replay without changing observations or Jobs', () => {
    const { database, repository } = openRepository();
    const request = createRequest();

    try {
      const first = repository.importBatch(request);
      const replay = repository.importBatch(structuredClone(request));

      expect(replay.ids).toEqual(first.ids);
      expect(database.prepare('SELECT COUNT(*) AS count FROM import_runs').get())
        .toEqual({ count: 1 });
      expect(database.prepare('SELECT COUNT(*) AS count FROM search_runs').get())
        .toEqual({ count: 1 });
      expect(database.prepare('SELECT COUNT(*) AS count FROM job_observations').get())
        .toEqual({ count: 1 });
      expect(database.prepare('SELECT COUNT(*) AS count FROM jobs').get())
        .toEqual({ count: 1 });
    } finally {
      database.close();
    }
  });

  it('fails closed on the same client ID with a different payload', () => {
    const { database, repository } = openRepository();
    const request = createRequest();

    try {
      repository.importBatch(request);

      expect(() => repository.importBatch({
        ...request,
        source: { ...request.source, warnings: ['different_warning'] },
      })).toThrow(ImportConflictError);
      expect(database.prepare('SELECT COUNT(*) AS count FROM import_runs').get())
        .toEqual({ count: 1 });
      expect(database.prepare('SELECT COUNT(*) AS count FROM job_observations').get())
        .toEqual({ count: 1 });
    } finally {
      database.close();
    }
  });

  it('creates new snapshots for a new client ID while reusing canonical Jobs', () => {
    const { database, repository } = openRepository();
    const request = createRequest();

    try {
      const first = repository.importBatch(request);
      const second = repository.importBatch({
        ...structuredClone(request),
        clientImportId: '7fe774d4-2cc4-457e-93b1-aa9440c75640',
      });

      expect(second.ids).not.toEqual(first.ids);
      expect(database.prepare('SELECT COUNT(*) AS count FROM import_runs').get())
        .toEqual({ count: 2 });
      expect(database.prepare('SELECT COUNT(*) AS count FROM job_observations').get())
        .toEqual({ count: 2 });
      expect(database.prepare('SELECT COUNT(*) AS count FROM jobs').get())
        .toEqual({ count: 1 });
    } finally {
      database.close();
    }
  });

  it('creates detail ImportRun provenance without a SearchRun', () => {
    const { database, repository } = openRepository();
    const request = createRequest({
      pageType: 'job_detail',
      matchedCardCount: null,
      warnings: [],
    });

    try {
      repository.importBatch(request);

      expect(database.prepare(`
        SELECT page_type, matched_card_count, observation_count
        FROM import_runs
      `).get()).toEqual({
        page_type: 'job_detail',
        matched_card_count: null,
        observation_count: 1,
      });
      expect(database.prepare('SELECT COUNT(*) AS count FROM search_runs').get())
        .toEqual({ count: 0 });
    } finally {
      database.close();
    }
  });

  it('rolls back ImportRun, SearchRun, observation, and Job mutation after an insert failure', () => {
    const { database, repository } = openRepository();
    database.exec(`
      CREATE TRIGGER fail_second_import_observation
      BEFORE INSERT ON job_observations
      WHEN NEW.title = '触发失败'
      BEGIN
        SELECT RAISE(FAIL, 'forced observation failure');
      END;
    `);
    const request = createRequest({
      observations: [
        createObservation({
          jobUrl: 'https://www.zhipin.com/job_detail/created-before-failure.html',
        }),
        createObservation({
          jobUrl: 'https://www.zhipin.com/job_detail/failure.html',
          title: '触发失败',
        }),
      ],
      matchedCardCount: 2,
    });

    try {
      expect(() => repository.importBatch(request)).toThrow(
        'forced observation failure',
      );
      for (const table of [
        'import_runs',
        'search_runs',
        'job_observations',
        'jobs',
      ]) {
        expect(
          database.prepare(`SELECT COUNT(*) AS count FROM ${table}`).get(),
        ).toEqual({ count: 0 });
      }
    } finally {
      database.close();
    }
  });
});
