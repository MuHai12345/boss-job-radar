import SqliteDatabase from 'better-sqlite3';
import { describe, expect, it } from 'vitest';

import {
  CURRENT_SCHEMA_VERSION,
  runMigrations,
  type Migration,
} from '../src/local-service/database/migrations';
import {
  createJobObservationRepository,
  type JobObservationInput,
} from '../src/local-service/database/observation-repository';

interface TableColumn {
  readonly cid: number;
  readonly dflt_value: string | null;
  readonly name: string;
  readonly notnull: 0 | 1;
  readonly pk: 0 | 1;
  readonly type: string;
}

function openMigratedDatabase(): InstanceType<typeof SqliteDatabase> {
  const database = new SqliteDatabase(':memory:');
  runMigrations(database);
  return database;
}

function createObservation(
  overrides: Partial<JobObservationInput> = {},
): JobObservationInput {
  return {
    capturedAt: '2026-09-03T00:00:00.000Z',
    companyName: null,
    educationText: null,
    experienceText: null,
    fullJdText: null,
    jobHrefRaw: null,
    jobUrl: 'https://www.zhipin.com/job_detail/example.html',
    locationText: null,
    missingFields: [],
    pageType: 'search_results',
    publishedText: null,
    rawText: '',
    recruiterActivityText: null,
    salaryText: null,
    sourcePageUrl: 'https://www.zhipin.com/web/geek/jobs',
    tags: [],
    title: null,
    warnings: [],
    ...overrides,
  };
}

describe('SQLite migrations', () => {
  it('applies schema version 5 to a fresh database and records it', () => {
    const database = new SqliteDatabase(':memory:');

    try {
      runMigrations(database);

      expect(CURRENT_SCHEMA_VERSION).toBe(5);
      expect(
        database
          .prepare(
            'SELECT version, name, applied_at FROM schema_migrations ORDER BY version',
          )
          .all(),
      ).toEqual([
        {
          applied_at: expect.stringMatching(
            /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/,
          ),
          name: 'create_job_observations',
          version: 1,
        },
        {
          applied_at: expect.stringMatching(
            /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/,
          ),
          name: 'create_job_identity',
          version: 2,
        },
        {
          applied_at: expect.stringMatching(
            /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/,
          ),
          name: 'create_import_provenance',
          version: 3,
        },
        {
          applied_at: expect.stringMatching(
            /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/,
          ),
          name: 'create_deterministic_job_analyses',
          version: 4,
        },
        { applied_at: expect.any(String), name: 'create_search_run_salary_decoding', version: 5 },
      ]);
    } finally {
      database.close();
    }
  });

  it('runs ordered migrations once and is a no-op when already current', () => {
    const database = new SqliteDatabase(':memory:');
    const applicationOrder: number[] = [];
    const migrations: readonly Migration[] = [
      {
        name: 'second',
        up: () => applicationOrder.push(2),
        version: 2,
      },
      {
        name: 'first',
        up: () => applicationOrder.push(1),
        version: 1,
      },
    ];

    try {
      runMigrations(database, migrations);
      runMigrations(database, migrations);

      expect(applicationOrder).toEqual([1, 2]);
      expect(
        database
          .prepare('SELECT version, name FROM schema_migrations ORDER BY version')
          .all(),
      ).toEqual([
        { name: 'first', version: 1 },
        { name: 'second', version: 2 },
      ]);
    } finally {
      database.close();
    }
  });

  it('fails closed when the database contains a future migration version', () => {
    const database = new SqliteDatabase(':memory:');
    database.exec(`
      CREATE TABLE schema_migrations (
        version INTEGER PRIMARY KEY,
        name TEXT NOT NULL,
        applied_at TEXT NOT NULL
      );
      INSERT INTO schema_migrations (version, name, applied_at)
      VALUES (6, 'future_migration', '2026-09-03T00:00:00.000Z');
    `);

    try {
      expect(() => runMigrations(database)).toThrow(
        'Database schema version 6 is newer than supported version 5',
      );
      expect(
        database
          .prepare(
            "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'job_observations'",
          )
          .get(),
      ).toBeUndefined();
    } finally {
      database.close();
    }
  });

  it('rolls back a failed migration and does not record it', () => {
    const database = new SqliteDatabase(':memory:');
    const failingMigration: Migration = {
      name: 'failing_migration',
      up(connection) {
        connection.exec('CREATE TABLE must_be_rolled_back (id INTEGER);');
        throw new Error('intentional migration failure');
      },
      version: 1,
    };

    try {
      expect(() => runMigrations(database, [failingMigration])).toThrow(
        'intentional migration failure',
      );
      expect(
        database
          .prepare(
            "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'must_be_rolled_back'",
          )
          .get(),
      ).toBeUndefined();
      expect(
        database.prepare('SELECT * FROM schema_migrations').all(),
      ).toEqual([]);
    } finally {
      database.close();
    }
  });
});

describe('job identity schema version 2', () => {
  it('creates exactly the approved columns, types, nullability, and defaults', () => {
    const database = openMigratedDatabase();

    try {
      const columns = database
        .prepare("PRAGMA table_info('job_observations')")
        .all() as TableColumn[];

      expect(
        columns.map(({ dflt_value, name, notnull, pk, type }) => ({
          dflt_value,
          name,
          notnull,
          pk,
          type,
        })),
      ).toEqual([
        { dflt_value: null, name: 'id', notnull: 0, pk: 1, type: 'INTEGER' },
        { dflt_value: null, name: 'captured_at', notnull: 1, pk: 0, type: 'TEXT' },
        { dflt_value: null, name: 'page_type', notnull: 1, pk: 0, type: 'TEXT' },
        { dflt_value: null, name: 'source_page_url', notnull: 1, pk: 0, type: 'TEXT' },
        { dflt_value: null, name: 'job_href_raw', notnull: 0, pk: 0, type: 'TEXT' },
        { dflt_value: null, name: 'job_url', notnull: 0, pk: 0, type: 'TEXT' },
        { dflt_value: null, name: 'title', notnull: 0, pk: 0, type: 'TEXT' },
        { dflt_value: null, name: 'company_name', notnull: 0, pk: 0, type: 'TEXT' },
        { dflt_value: null, name: 'salary_text', notnull: 0, pk: 0, type: 'TEXT' },
        { dflt_value: null, name: 'location_text', notnull: 0, pk: 0, type: 'TEXT' },
        { dflt_value: null, name: 'experience_text', notnull: 0, pk: 0, type: 'TEXT' },
        { dflt_value: null, name: 'education_text', notnull: 0, pk: 0, type: 'TEXT' },
        { dflt_value: "'[]'", name: 'tags_json', notnull: 1, pk: 0, type: 'TEXT' },
        { dflt_value: null, name: 'recruiter_activity_text', notnull: 0, pk: 0, type: 'TEXT' },
        { dflt_value: null, name: 'published_text', notnull: 0, pk: 0, type: 'TEXT' },
        { dflt_value: null, name: 'full_jd_text', notnull: 0, pk: 0, type: 'TEXT' },
        { dflt_value: "''", name: 'raw_text', notnull: 1, pk: 0, type: 'TEXT' },
        { dflt_value: "'[]'", name: 'missing_fields_json', notnull: 1, pk: 0, type: 'TEXT' },
        { dflt_value: "'[]'", name: 'warnings_json', notnull: 1, pk: 0, type: 'TEXT' },
        { dflt_value: null, name: 'job_id', notnull: 1, pk: 0, type: 'INTEGER' },
        { dflt_value: null, name: 'import_run_id', notnull: 0, pk: 0, type: 'INTEGER' },
      ]);
    } finally {
      database.close();
    }
  });

  it('creates constrained jobs and an indexed observation link', () => {
    const database = openMigratedDatabase();

    try {
      const jobColumns = database
        .prepare("PRAGMA table_info('jobs')")
        .all() as TableColumn[];

      expect(jobColumns.map(({ name, notnull, pk, type }) => ({
        name,
        notnull,
        pk,
        type,
      }))).toEqual([
        { name: 'id', notnull: 0, pk: 1, type: 'INTEGER' },
        { name: 'job_url', notnull: 0, pk: 0, type: 'TEXT' },
        { name: 'unresolved_observation_id', notnull: 0, pk: 0, type: 'INTEGER' },
        { name: 'first_seen_at', notnull: 1, pk: 0, type: 'TEXT' },
        { name: 'last_seen_at', notnull: 1, pk: 0, type: 'TEXT' },
        { name: 'latest_observation_id', notnull: 1, pk: 0, type: 'INTEGER' },
      ]);
      expect(
        database
          .prepare("SELECT name FROM sqlite_master WHERE type = 'index' AND name = 'idx_job_observations_job_id'")
          .get(),
      ).toEqual({ name: 'idx_job_observations_job_id' });
      expect(() =>
        database.prepare(`
          INSERT INTO jobs (
            job_url,
            unresolved_observation_id,
            first_seen_at,
            last_seen_at,
            latest_observation_id
          ) VALUES (NULL, NULL, ?, ?, ?)
        `).run(
          '2026-09-03T00:00:00.000Z',
          '2026-09-03T00:00:00.000Z',
          1,
        ),
      ).toThrow();
    } finally {
      database.close();
    }
  });

  it('backfills duplicate canonical URLs and keeps null URLs unresolved and separate', () => {
    const database = new SqliteDatabase(':memory:');
    database.pragma('foreign_keys = ON');
    database.exec(`
      CREATE TABLE schema_migrations (
        version INTEGER PRIMARY KEY,
        name TEXT NOT NULL,
        applied_at TEXT NOT NULL
      );
      INSERT INTO schema_migrations (version, name, applied_at)
      VALUES (1, 'create_job_observations', '2026-09-03T00:00:00.000Z');
      CREATE TABLE job_observations (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        captured_at TEXT NOT NULL,
        page_type TEXT NOT NULL CHECK (page_type IN ('search_results', 'job_detail')),
        source_page_url TEXT NOT NULL,
        job_href_raw TEXT NULL,
        job_url TEXT NULL,
        title TEXT NULL,
        company_name TEXT NULL,
        salary_text TEXT NULL,
        location_text TEXT NULL,
        experience_text TEXT NULL,
        education_text TEXT NULL,
        tags_json TEXT NOT NULL DEFAULT '[]',
        recruiter_activity_text TEXT NULL,
        published_text TEXT NULL,
        full_jd_text TEXT NULL,
        raw_text TEXT NOT NULL DEFAULT '',
        missing_fields_json TEXT NOT NULL DEFAULT '[]',
        warnings_json TEXT NOT NULL DEFAULT '[]'
      );
    `);
    const insert = database.prepare(`
      INSERT INTO job_observations (
        captured_at,
        page_type,
        source_page_url,
        job_url,
        title
      ) VALUES (?, 'search_results', 'https://example.invalid/source', ?, ?)
    `);
    const urlA = 'https://example.invalid/jobs/A';
    const urlB = 'https://example.invalid/jobs/B';

    try {
      const observationIds = [
        Number(insert.run('2026-09-03T10:00:00.000Z', urlA, 'A old').lastInsertRowid),
        Number(insert.run('2026-09-03T11:00:00.000Z', urlA, 'A newer first').lastInsertRowid),
        Number(insert.run('2026-09-03T11:00:00.000Z', urlA, 'A newer tie').lastInsertRowid),
        Number(insert.run('2026-09-03T09:00:00.000Z', urlB, 'B').lastInsertRowid),
        Number(insert.run('2026-09-03T12:00:00.000Z', null, 'unresolved one').lastInsertRowid),
        Number(insert.run('2026-09-03T12:00:00.000Z', null, 'unresolved two').lastInsertRowid),
      ];

      runMigrations(database);
      runMigrations(database);

      const jobs = database.prepare(`
        SELECT
          id,
          job_url,
          unresolved_observation_id,
          first_seen_at,
          last_seen_at,
          latest_observation_id
        FROM jobs
        ORDER BY id
      `).all() as Array<Record<string, unknown>>;
      const canonicalA = jobs.find((job) => job.job_url === urlA);
      const canonicalB = jobs.find((job) => job.job_url === urlB);
      const unresolved = jobs.filter((job) => job.job_url === null);

      expect(jobs).toHaveLength(4);
      expect(canonicalA).toMatchObject({
        first_seen_at: '2026-09-03T10:00:00.000Z',
        last_seen_at: '2026-09-03T11:00:00.000Z',
        latest_observation_id: observationIds[2],
        unresolved_observation_id: null,
      });
      expect(canonicalB).toMatchObject({
        first_seen_at: '2026-09-03T09:00:00.000Z',
        last_seen_at: '2026-09-03T09:00:00.000Z',
        latest_observation_id: observationIds[3],
      });
      expect(unresolved.map((job) => job.unresolved_observation_id)).toEqual([
        observationIds[4],
        observationIds[5],
      ]);
      expect(
        database.prepare('SELECT id, job_id FROM job_observations ORDER BY id').all(),
      ).toEqual([
        { id: observationIds[0], job_id: canonicalA?.id },
        { id: observationIds[1], job_id: canonicalA?.id },
        { id: observationIds[2], job_id: canonicalA?.id },
        { id: observationIds[3], job_id: canonicalB?.id },
        { id: observationIds[4], job_id: unresolved[0]?.id },
        { id: observationIds[5], job_id: unresolved[1]?.id },
      ]);
      expect(
        database.prepare('SELECT COUNT(*) AS count FROM schema_migrations WHERE version = 2').get(),
      ).toEqual({ count: 1 });
      expect(database.prepare('PRAGMA foreign_key_check').all()).toEqual([]);
    } finally {
      database.close();
    }
  });

  it('rejects unsupported page types at the database boundary', () => {
    const database = openMigratedDatabase();
    const repository = createJobObservationRepository(database);

    try {
      expect(() =>
        repository.append(
          createObservation({
            pageType: 'unsupported' as JobObservationInput['pageType'],
          }),
        ),
      ).toThrow(/CHECK constraint failed/u);
    } finally {
      database.close();
    }
  });

  it('allows duplicate job URLs and nullable platform fields', () => {
    const database = openMigratedDatabase();
    const repository = createJobObservationRepository(database);
    const jobUrl = 'https://www.zhipin.com/job_detail/example.html';

    try {
      repository.append(createObservation({ jobUrl }));
      repository.append(createObservation({
        capturedAt: '2026-09-03T00:01:00.000Z',
        jobUrl,
        pageType: 'job_detail',
        sourcePageUrl: jobUrl,
      }));

      const observations = database
        .prepare(
          `SELECT
            job_url,
            job_href_raw,
            title,
            company_name,
            salary_text,
            location_text,
            experience_text,
            education_text,
            recruiter_activity_text,
            published_text,
            full_jd_text
          FROM job_observations
          ORDER BY id`,
        )
        .all();

      expect(observations).toHaveLength(2);
      expect(observations[0]).toEqual({
        company_name: null,
        education_text: null,
        experience_text: null,
        full_jd_text: null,
        job_href_raw: null,
        job_url: jobUrl,
        location_text: null,
        published_text: null,
        recruiter_activity_text: null,
        salary_text: null,
        title: null,
      });
      expect(observations[1]).toMatchObject({ job_url: jobUrl });
    } finally {
      database.close();
    }
  });

  it('uses approved JSON and raw-text defaults', () => {
    const database = openMigratedDatabase();

    try {
      database.transaction(() => {
        const job = database.prepare(`
          INSERT INTO jobs (
            job_url,
            unresolved_observation_id,
            first_seen_at,
            last_seen_at,
            latest_observation_id
          ) VALUES (?, NULL, ?, ?, 1)
        `).run(
          'https://example.invalid/jobs/defaults',
          '2026-09-03T00:00:00.000Z',
          '2026-09-03T00:00:00.000Z',
        );
        database.prepare(`
          INSERT INTO job_observations (
            id,
            captured_at,
            page_type,
            source_page_url,
            job_id
          ) VALUES (1, ?, 'search_results', ?, ?)
        `).run(
          '2026-09-03T00:00:00.000Z',
          'https://www.zhipin.com/web/geek/jobs',
          job.lastInsertRowid,
        );
      })();

      expect(
        database
          .prepare(
            'SELECT tags_json, raw_text, missing_fields_json, warnings_json FROM job_observations',
          )
          .get(),
      ).toEqual({
        missing_fields_json: '[]',
        raw_text: '',
        tags_json: '[]',
        warnings_json: '[]',
      });
    } finally {
      database.close();
    }
  });
});

describe('import provenance schema version 3', () => {
  it('creates constrained import and search run tables plus the observation link', () => {
    const database = openMigratedDatabase();

    try {
      const importColumns = database
        .prepare("PRAGMA table_info('import_runs')")
        .all() as TableColumn[];
      const searchColumns = database
        .prepare("PRAGMA table_info('search_runs')")
        .all() as TableColumn[];

      expect(importColumns.map(({ name, notnull, pk, type }) => ({
        name,
        notnull,
        pk,
        type,
      }))).toEqual([
        { name: 'id', notnull: 0, pk: 1, type: 'INTEGER' },
        { name: 'client_import_id', notnull: 1, pk: 0, type: 'TEXT' },
        { name: 'payload_sha256', notnull: 1, pk: 0, type: 'TEXT' },
        { name: 'page_type', notnull: 1, pk: 0, type: 'TEXT' },
        { name: 'source_page_url', notnull: 1, pk: 0, type: 'TEXT' },
        { name: 'captured_at', notnull: 1, pk: 0, type: 'TEXT' },
        { name: 'matched_card_count', notnull: 0, pk: 0, type: 'INTEGER' },
        { name: 'extraction_warnings_json', notnull: 1, pk: 0, type: 'TEXT' },
        { name: 'observation_count', notnull: 1, pk: 0, type: 'INTEGER' },
        { name: 'created_at', notnull: 1, pk: 0, type: 'TEXT' },
      ]);
      expect(searchColumns.map(({ name, notnull, pk, type }) => ({
        name,
        notnull,
        pk,
        type,
      }))).toEqual([
        { name: 'id', notnull: 0, pk: 1, type: 'INTEGER' },
        { name: 'import_run_id', notnull: 1, pk: 0, type: 'INTEGER' },
        { name: 'captured_at', notnull: 1, pk: 0, type: 'TEXT' },
        { name: 'source_page_url', notnull: 1, pk: 0, type: 'TEXT' },
        { name: 'matched_card_count', notnull: 1, pk: 0, type: 'INTEGER' },
        { name: 'saved_observation_count', notnull: 1, pk: 0, type: 'INTEGER' },
        { name: 'extraction_warnings_json', notnull: 1, pk: 0, type: 'TEXT' },
        { name: 'created_at', notnull: 1, pk: 0, type: 'TEXT' },
      ]);
      expect(
        database.prepare(
          "SELECT name FROM sqlite_master WHERE type = 'index' AND name = 'idx_job_observations_import_run_id'",
        ).get(),
      ).toEqual({ name: 'idx_job_observations_import_run_id' });
      expect(database.prepare('PRAGMA foreign_key_check').all()).toEqual([]);
    } finally {
      database.close();
    }
  });

  it('migrates version 2 data without changing Jobs, observations, or links', () => {
    const database = new SqliteDatabase(':memory:');
    database.pragma('foreign_keys = ON');
    database.exec(`
      CREATE TABLE schema_migrations (
        version INTEGER PRIMARY KEY,
        name TEXT NOT NULL,
        applied_at TEXT NOT NULL
      );
      INSERT INTO schema_migrations VALUES
        (1, 'create_job_observations', '2026-09-03T00:00:00.000Z'),
        (2, 'create_job_identity', '2026-09-04T00:00:00.000Z');
      CREATE TABLE jobs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        job_url TEXT NULL UNIQUE,
        unresolved_observation_id INTEGER NULL UNIQUE,
        first_seen_at TEXT NOT NULL,
        last_seen_at TEXT NOT NULL,
        latest_observation_id INTEGER NOT NULL,
        CHECK ((job_url IS NOT NULL AND unresolved_observation_id IS NULL) OR (job_url IS NULL AND unresolved_observation_id IS NOT NULL)),
        FOREIGN KEY (unresolved_observation_id) REFERENCES job_observations(id) DEFERRABLE INITIALLY DEFERRED,
        FOREIGN KEY (latest_observation_id) REFERENCES job_observations(id) DEFERRABLE INITIALLY DEFERRED
      );
      CREATE TABLE job_observations (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        captured_at TEXT NOT NULL,
        page_type TEXT NOT NULL CHECK (page_type IN ('search_results', 'job_detail')),
        source_page_url TEXT NOT NULL,
        job_href_raw TEXT NULL,
        job_url TEXT NULL,
        title TEXT NULL,
        company_name TEXT NULL,
        salary_text TEXT NULL,
        location_text TEXT NULL,
        experience_text TEXT NULL,
        education_text TEXT NULL,
        tags_json TEXT NOT NULL DEFAULT '[]',
        recruiter_activity_text TEXT NULL,
        published_text TEXT NULL,
        full_jd_text TEXT NULL,
        raw_text TEXT NOT NULL DEFAULT '',
        missing_fields_json TEXT NOT NULL DEFAULT '[]',
        warnings_json TEXT NOT NULL DEFAULT '[]',
        job_id INTEGER NOT NULL REFERENCES jobs(id)
      );
      BEGIN;
      PRAGMA defer_foreign_keys = ON;
      INSERT INTO jobs VALUES (
        7,
        'https://www.zhipin.com/job_detail/existing.html',
        NULL,
        '2026-09-03T01:00:00.000Z',
        '2026-09-03T01:00:00.000Z',
        11
      );
      INSERT INTO job_observations (
        id, captured_at, page_type, source_page_url, job_url, title,
        tags_json, raw_text, missing_fields_json, warnings_json, job_id
      ) VALUES (
        11, '2026-09-03T01:00:00.000Z', 'search_results',
        'https://www.zhipin.com/web/geek/jobs',
        'https://www.zhipin.com/job_detail/existing.html', '保留岗位',
        '["保留标签"]', '保留原文', '["salaryText"]', '["old_warning"]', 7
      );
      COMMIT;
    `);

    try {
      const beforeJob = database.prepare('SELECT * FROM jobs').get();
      const beforeObservation = database.prepare(`
        SELECT id, captured_at, page_type, source_page_url, job_url, title,
               tags_json, raw_text, missing_fields_json, warnings_json, job_id
        FROM job_observations
      `).get();

      runMigrations(database);
      runMigrations(database);

      expect(database.prepare('SELECT * FROM jobs').get()).toEqual(beforeJob);
      expect(database.prepare(`
        SELECT id, captured_at, page_type, source_page_url, job_url, title,
               tags_json, raw_text, missing_fields_json, warnings_json, job_id
        FROM job_observations
      `).get()).toEqual(beforeObservation);
      expect(
        database.prepare('SELECT import_run_id FROM job_observations').get(),
      ).toEqual({ import_run_id: null });
      expect(
        database.prepare('SELECT COUNT(*) AS count FROM schema_migrations WHERE version = 3').get(),
      ).toEqual({ count: 1 });
      expect(database.prepare('PRAGMA foreign_key_check').all()).toEqual([]);
    } finally {
      database.close();
    }
  });
});
