import SqliteDatabase from 'better-sqlite3';
import { describe, expect, it } from 'vitest';

import {
  CURRENT_SCHEMA_VERSION,
  runMigrations,
  type Migration,
} from '../src/local-service/database/migrations';

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

describe('SQLite migrations', () => {
  it('applies schema version 1 to a fresh database and records it', () => {
    const database = new SqliteDatabase(':memory:');

    try {
      runMigrations(database);

      expect(CURRENT_SCHEMA_VERSION).toBe(1);
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
      VALUES (2, 'future_migration', '2026-09-03T00:00:00.000Z');
    `);

    try {
      expect(() => runMigrations(database)).toThrow(
        'Database schema version 2 is newer than supported version 1',
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

describe('job_observations schema version 1', () => {
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
      ]);
    } finally {
      database.close();
    }
  });

  it('rejects unsupported page types at the database boundary', () => {
    const database = openMigratedDatabase();

    try {
      expect(() =>
        database
          .prepare(
            'INSERT INTO job_observations (captured_at, page_type, source_page_url) VALUES (?, ?, ?)',
          )
          .run(
            '2026-09-03T00:00:00.000Z',
            'unsupported',
            'https://example.invalid/source',
          ),
      ).toThrow();
    } finally {
      database.close();
    }
  });

  it('allows duplicate job URLs and nullable platform fields', () => {
    const database = openMigratedDatabase();
    const insert = database.prepare(`
      INSERT INTO job_observations (
        captured_at,
        page_type,
        source_page_url,
        job_url
      ) VALUES (?, ?, ?, ?)
    `);
    const jobUrl = 'https://www.zhipin.com/job_detail/example.html';

    try {
      insert.run(
        '2026-09-03T00:00:00.000Z',
        'search_results',
        'https://www.zhipin.com/web/geek/jobs',
        jobUrl,
      );
      insert.run(
        '2026-09-03T00:01:00.000Z',
        'job_detail',
        jobUrl,
        jobUrl,
      );

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
      database
        .prepare(
          'INSERT INTO job_observations (captured_at, page_type, source_page_url) VALUES (?, ?, ?)',
        )
        .run(
          '2026-09-03T00:00:00.000Z',
          'search_results',
          'https://www.zhipin.com/web/geek/jobs',
        );

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
