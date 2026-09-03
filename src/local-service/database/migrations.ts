import type SqliteDatabase from 'better-sqlite3';

export interface Migration {
  readonly version: number;
  readonly name: string;
  readonly up: (database: SqliteDatabase.Database) => void;
}

const MIGRATIONS: readonly Migration[] = [
  {
    version: 1,
    name: 'create_job_observations',
    up(database) {
      database.exec(`
        CREATE TABLE job_observations (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          captured_at TEXT NOT NULL,
          page_type TEXT NOT NULL CHECK (
            page_type IN ('search_results', 'job_detail')
          ),
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
    },
  },
];

export const CURRENT_SCHEMA_VERSION = 1;

interface MaximumVersionRow {
  readonly version: number | null;
}

interface AppliedVersionRow {
  readonly version: number;
}

function createMigrationLedger(database: SqliteDatabase.Database): void {
  database.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      applied_at TEXT NOT NULL
    );
  `);
}

export function runMigrations(
  database: SqliteDatabase.Database,
  migrations: readonly Migration[] = MIGRATIONS,
): void {
  const orderedMigrations = [...migrations].sort(
    (left, right) => left.version - right.version,
  );
  const maximumKnownVersion =
    orderedMigrations.at(-1)?.version ?? 0;

  createMigrationLedger(database);

  const maximumAppliedVersion = database
    .prepare('SELECT MAX(version) AS version FROM schema_migrations')
    .get() as MaximumVersionRow;
  if (
    maximumAppliedVersion.version !== null &&
    maximumAppliedVersion.version > maximumKnownVersion
  ) {
    throw new Error(
      `Database schema version ${maximumAppliedVersion.version} is newer than supported version ${maximumKnownVersion}`,
    );
  }

  const appliedVersions = new Set(
    (
      database
        .prepare('SELECT version FROM schema_migrations')
        .all() as AppliedVersionRow[]
    ).map(({ version }) => version),
  );
  const recordMigration = database.prepare(`
    INSERT INTO schema_migrations (version, name, applied_at)
    VALUES (?, ?, ?)
  `);

  for (const migration of orderedMigrations) {
    if (appliedVersions.has(migration.version)) {
      continue;
    }

    database.transaction(() => {
      migration.up(database);
      recordMigration.run(
        migration.version,
        migration.name,
        new Date().toISOString(),
      );
    })();
  }
}
