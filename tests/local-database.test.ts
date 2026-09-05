import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import SqliteDatabase from 'better-sqlite3';
import { afterEach, describe, expect, it } from 'vitest';

import { openLocalDatabase } from '../src/local-service/database/database';

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) =>
      rm(directory, { force: true, recursive: true }),
    ),
  );
});

describe('local SQLite database', () => {
  it('opens an in-memory database with foreign-key enforcement enabled', () => {
    const database = openLocalDatabase({ path: ':memory:' });

    try {
      expect(database.isForeignKeyEnforcementEnabled()).toBe(true);
    } finally {
      database.close();
    }
  });

  it('closes cleanly and allows repeated close calls', () => {
    const database = openLocalDatabase({ path: ':memory:' });

    expect(() => database.close()).not.toThrow();
    expect(() => database.close()).not.toThrow();
  });

  it('persists the migration version and schema across file-backed reopen', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'boss-job-radar-sqlite-'));
    temporaryDirectories.push(directory);
    const databasePath = join(directory, 'observations.sqlite');

    const firstConnection = openLocalDatabase({ path: databasePath });
    firstConnection.close();

    const secondConnection = openLocalDatabase({ path: databasePath });
    secondConnection.close();

    const inspectionConnection = new SqliteDatabase(databasePath, {
      readonly: true,
    });
    try {
      const migration = inspectionConnection
        .prepare(
          'SELECT version, name FROM schema_migrations ORDER BY version',
        )
        .all();
      const observationTable = inspectionConnection
        .prepare(
          "SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?",
        )
        .get('job_observations');

      expect(migration).toEqual([
        { name: 'create_job_observations', version: 1 },
        { name: 'create_job_identity', version: 2 },
        { name: 'create_import_provenance', version: 3 },
        { name: 'create_deterministic_job_analyses', version: 4 },
      ]);
      expect(observationTable).toEqual({ name: 'job_observations' });
      expect(
        inspectionConnection
          .prepare(
            "SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?",
          )
          .get('jobs'),
      ).toEqual({ name: 'jobs' });
      expect(
        inspectionConnection
          .prepare(
            "SELECT name FROM sqlite_master WHERE type = 'table' AND name IN ('import_runs', 'search_runs') ORDER BY name",
          )
          .all(),
      ).toEqual([{ name: 'import_runs' }, { name: 'search_runs' }]);
    } finally {
      inspectionConnection.close();
    }
  });
});
