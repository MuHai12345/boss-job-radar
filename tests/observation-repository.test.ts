import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import SqliteDatabase from 'better-sqlite3';
import { afterEach, describe, expect, it } from 'vitest';

import { openLocalDatabase } from '../src/local-service/database/database';
import {
  createJobObservationRepository,
  type JobObservationInput,
} from '../src/local-service/database/observation-repository';
import { runMigrations } from '../src/local-service/database/migrations';

const temporaryDirectories: string[] = [];

function createObservation(
  overrides: Partial<JobObservationInput> = {},
): JobObservationInput {
  return {
    capturedAt: '2026-09-03T08:30:00.000Z',
    companyName: "'); DROP TABLE job_observations; --",
    educationText: '大专',
    experienceText: null,
    fullJdText: '负责合成商品资料。\n第二行保持换行。',
    jobHrefRaw: "/job_detail/synthetic-o'reilly.html?source=test",
    jobUrl: "https://example.invalid/jobs/synthetic-o'reilly?source=test",
    locationText: '上海·浦东新区',
    missingFields: [],
    pageType: 'job_detail',
    publishedText: '',
    rawText: "O'Reilly 合成原始文本\n'); DROP TABLE job_observations; --",
    recruiterActivityText: null,
    salaryText: '',
    sourcePageUrl: 'https://example.invalid/source?query=合成岗位',
    tags: ['运营', '运营', '可学习'],
    title: "O'Reilly 电商运营助理",
    warnings: ['synthetic_warning', '字段仅供测试'],
    ...overrides,
  };
}

async function createTemporaryDatabasePath(): Promise<string> {
  const directory = await mkdtemp(
    join(tmpdir(), 'boss-job-radar-observation-'),
  );
  temporaryDirectories.push(directory);
  return join(directory, 'observations.sqlite');
}

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) =>
      rm(directory, { force: true, recursive: true }),
    ),
  );
});

describe('job observation repository', () => {
  it('appends and reads a complete observation without changing facts', () => {
    const database = openLocalDatabase({ path: ':memory:' });
    const input = createObservation();

    try {
      const { id } = database.observations.append(input);

      expect(Number.isSafeInteger(id)).toBe(true);
      expect(id).toBeGreaterThan(0);
      expect(database.observations.getById(id)).toEqual({
        id,
        importRunId: null,
        jobId: expect.any(Number),
        ...input,
      });
    } finally {
      database.close();
    }
  });

  it('always appends duplicate observations as separate rows', () => {
    const database = openLocalDatabase({ path: ':memory:' });
    const input = createObservation({ pageType: 'search_results' });

    try {
      const first = database.observations.append(input);
      const second = database.observations.append(input);

      expect(second.id).not.toBe(first.id);
      expect(database.observations.getById(first.id)).toEqual({
        id: first.id,
        importRunId: null,
        jobId: expect.any(Number),
        ...input,
      });
      expect(database.observations.getById(second.id)).toEqual({
        id: second.id,
        importRunId: null,
        jobId: expect.any(Number),
        ...input,
      });
    } finally {
      database.close();
    }
  });

  it('appends a batch in input order and returns matching ids', () => {
    const database = openLocalDatabase({ path: ':memory:' });
    const first = createObservation({ title: 'first synthetic title' });
    const second = createObservation({ title: 'second synthetic title' });

    try {
      const { ids } = database.observations.appendMany([first, second]);

      expect(ids).toHaveLength(2);
      expect(ids[1]).toBeGreaterThan(ids[0]!);
      expect(database.observations.getById(ids[0]!)).toEqual({
        id: ids[0],
        importRunId: null,
        jobId: expect.any(Number),
        ...first,
      });
      expect(database.observations.getById(ids[1]!)).toEqual({
        id: ids[1],
        importRunId: null,
        jobId: expect.any(Number),
        ...second,
      });
    } finally {
      database.close();
    }
  });

  it('keeps duplicate observations as distinct rows within one batch', () => {
    const database = openLocalDatabase({ path: ':memory:' });
    const input = createObservation();

    try {
      const { ids } = database.observations.appendMany([input, input]);

      expect(ids).toHaveLength(2);
      expect(new Set(ids).size).toBe(2);
    } finally {
      database.close();
    }
  });

  it('rolls back every row when a batch insert fails', () => {
    const sqlite = new SqliteDatabase(':memory:');
    runMigrations(sqlite);
    sqlite.exec(`
      CREATE TRIGGER fail_synthetic_observation
      BEFORE INSERT ON job_observations
      WHEN NEW.title = 'force synthetic failure'
      BEGIN
        SELECT RAISE(ABORT, 'synthetic insert failure');
      END;
    `);
    const repository = createJobObservationRepository(sqlite);

    try {
      expect(() =>
        repository.appendMany([
          createObservation({ title: 'would otherwise persist' }),
          createObservation({ title: 'force synthetic failure' }),
        ]),
      ).toThrow('synthetic insert failure');
      expect(
        sqlite
          .prepare('SELECT COUNT(*) AS count FROM job_observations')
          .get(),
      ).toEqual({ count: 0 });
      expect(
        sqlite.prepare('SELECT COUNT(*) AS count FROM jobs').get(),
      ).toEqual({ count: 0 });
    } finally {
      sqlite.close();
    }
  });

  it('returns null when a valid observation id is not found', () => {
    const database = openLocalDatabase({ path: ':memory:' });

    try {
      expect(database.observations.getById(1)).toBeNull();
    } finally {
      database.close();
    }
  });

  it.each([0, -1, Number.NaN, Number.POSITIVE_INFINITY, 1.5, 2 ** 53])(
    'rejects invalid observation id %s before querying SQLite',
    (id) => {
      const database = openLocalDatabase({ path: ':memory:' });

      try {
        expect(() => database.observations.getById(id)).toThrow(
          'Observation id must be a positive safe integer',
        );
      } finally {
        database.close();
      }
    },
  );

  it('fails repository operations after the database is closed', () => {
    const database = openLocalDatabase({ path: ':memory:' });
    database.close();

    expect(() => database.observations.append(createObservation())).toThrow();
    expect(() => database.observations.getById(1)).toThrow();
    expect(() => database.close()).not.toThrow();
  });

  it('preserves observations across close and reopen without rerunning migrations', async () => {
    const databasePath = await createTemporaryDatabasePath();
    const input = createObservation();
    const firstConnection = openLocalDatabase({ path: databasePath });
    let firstId: number;
    try {
      firstId = firstConnection.observations.append(input).id;
    } finally {
      firstConnection.close();
    }

    const secondConnection = openLocalDatabase({ path: databasePath });
    let recovered;
    let secondId: number;
    try {
      recovered = secondConnection.observations.getById(firstId);
      secondId = secondConnection.observations.append(input).id;
    } finally {
      secondConnection.close();
    }

    expect(recovered).toEqual({
      id: firstId,
      importRunId: null,
      jobId: expect.any(Number),
      ...input,
    });
    expect(secondId).not.toBe(firstId);

    const inspectionConnection = new SqliteDatabase(databasePath, {
      readonly: true,
    });
    try {
      expect(
        inspectionConnection
          .prepare('SELECT version, name FROM schema_migrations ORDER BY version')
          .all(),
      ).toEqual([
        { name: 'create_job_observations', version: 1 },
        { name: 'create_job_identity', version: 2 },
        { name: 'create_import_provenance', version: 3 },
        { name: 'create_deterministic_job_analyses', version: 4 },
      ]);
      expect(
        inspectionConnection
          .prepare('SELECT COUNT(*) AS count FROM job_observations')
          .get(),
      ).toEqual({ count: 2 });
    } finally {
      inspectionConnection.close();
    }
  });

  it('stores SQL-looking text as ordinary bound values', () => {
    const database = openLocalDatabase({ path: ':memory:' });
    const input = createObservation();

    try {
      const first = database.observations.append(input);
      expect(database.observations.getById(first.id)).toEqual({
        id: first.id,
        importRunId: null,
        jobId: expect.any(Number),
        ...input,
      });

      const second = database.observations.append(
        createObservation({ companyName: 'still available' }),
      );
      expect(database.observations.getById(second.id)?.companyName).toBe(
        'still available',
      );
    } finally {
      database.close();
    }
  });

  it('rolls back observations and jobs when Job lifecycle update fails', () => {
    const sqlite = new SqliteDatabase(':memory:');
    sqlite.pragma('foreign_keys = ON');
    runMigrations(sqlite);
    sqlite.exec(`
      CREATE TRIGGER fail_synthetic_job_update
      BEFORE UPDATE ON jobs
      WHEN NEW.last_seen_at = '2026-09-04T12:00:00.000Z'
      BEGIN
        SELECT RAISE(ABORT, 'synthetic Job update failure');
      END;
    `);
    const repository = createJobObservationRepository(sqlite);

    try {
      expect(() =>
        repository.appendMany([
          createObservation({
            jobUrl: 'https://example.invalid/jobs/update-will-rollback',
            title: 'would otherwise persist',
          }),
          createObservation({
            capturedAt: '2026-09-04T12:00:00.000Z',
            jobUrl: 'https://example.invalid/jobs/update-will-rollback',
            title: 'force synthetic Job update failure',
          }),
        ]),
      ).toThrow('synthetic Job update failure');
      expect(
        sqlite.prepare('SELECT COUNT(*) AS count FROM job_observations').get(),
      ).toEqual({ count: 0 });
      expect(
        sqlite.prepare('SELECT COUNT(*) AS count FROM jobs').get(),
      ).toEqual({ count: 0 });
    } finally {
      sqlite.close();
    }
  });

  it('fails closed when stored JSON is malformed', async () => {
    const databasePath = await createTemporaryDatabasePath();
    const database = openLocalDatabase({ path: databasePath });
    let id: number;
    try {
      id = database.observations.append(createObservation()).id;
    } finally {
      database.close();
    }

    const corruptionConnection = new SqliteDatabase(databasePath);
    try {
      corruptionConnection
        .prepare('UPDATE job_observations SET tags_json = ? WHERE id = ?')
        .run('not valid JSON', id);
    } finally {
      corruptionConnection.close();
    }

    const reopenedDatabase = openLocalDatabase({ path: databasePath });
    try {
      expect(() => reopenedDatabase.observations.getById(id)).toThrow(
        'Invalid tags_json for job observation',
      );
    } finally {
      reopenedDatabase.close();
    }
  });

  it('fails closed when stored JSON is not an array of strings', async () => {
    const databasePath = await createTemporaryDatabasePath();
    const database = openLocalDatabase({ path: databasePath });
    let id: number;
    try {
      id = database.observations.append(createObservation()).id;
    } finally {
      database.close();
    }

    const corruptionConnection = new SqliteDatabase(databasePath);
    try {
      corruptionConnection
        .prepare('UPDATE job_observations SET warnings_json = ? WHERE id = ?')
        .run('[1]', id);
    } finally {
      corruptionConnection.close();
    }

    const reopenedDatabase = openLocalDatabase({ path: databasePath });
    try {
      expect(() => reopenedDatabase.observations.getById(id)).toThrow(
        'Invalid warnings_json for job observation',
      );
    } finally {
      reopenedDatabase.close();
    }
  });
});
