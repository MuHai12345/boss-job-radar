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
  {
    version: 2,
    name: 'create_job_identity',
    up(database) {
      database.exec(`
        PRAGMA defer_foreign_keys = ON;

        CREATE TABLE jobs_v2 (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          job_url TEXT NULL UNIQUE,
          unresolved_observation_id INTEGER NULL UNIQUE,
          first_seen_at TEXT NOT NULL,
          last_seen_at TEXT NOT NULL,
          latest_observation_id INTEGER NOT NULL,
          CHECK (
            (
              job_url IS NOT NULL
              AND unresolved_observation_id IS NULL
            ) OR (
              job_url IS NULL
              AND unresolved_observation_id IS NOT NULL
            )
          ),
          FOREIGN KEY (unresolved_observation_id)
            REFERENCES job_observations_v2(id)
            DEFERRABLE INITIALLY DEFERRED,
          FOREIGN KEY (latest_observation_id)
            REFERENCES job_observations_v2(id)
            DEFERRABLE INITIALLY DEFERRED
        );

        CREATE TABLE job_observations_v2 (
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
          warnings_json TEXT NOT NULL DEFAULT '[]',
          job_id INTEGER NOT NULL REFERENCES jobs_v2(id)
        );

        INSERT INTO jobs_v2 (
          job_url,
          unresolved_observation_id,
          first_seen_at,
          last_seen_at,
          latest_observation_id
        )
        SELECT
          observation.job_url,
          NULL,
          MIN(observation.captured_at),
          (
            SELECT latest.captured_at
            FROM job_observations AS latest
            WHERE latest.job_url = observation.job_url
            ORDER BY latest.captured_at DESC, latest.id DESC
            LIMIT 1
          ),
          (
            SELECT latest.id
            FROM job_observations AS latest
            WHERE latest.job_url = observation.job_url
            ORDER BY latest.captured_at DESC, latest.id DESC
            LIMIT 1
          )
        FROM job_observations AS observation
        WHERE observation.job_url IS NOT NULL
        GROUP BY observation.job_url;

        INSERT INTO jobs_v2 (
          job_url,
          unresolved_observation_id,
          first_seen_at,
          last_seen_at,
          latest_observation_id
        )
        SELECT
          NULL,
          observation.id,
          observation.captured_at,
          observation.captured_at,
          observation.id
        FROM job_observations AS observation
        WHERE observation.job_url IS NULL;

        INSERT INTO job_observations_v2 (
          id,
          captured_at,
          page_type,
          source_page_url,
          job_href_raw,
          job_url,
          title,
          company_name,
          salary_text,
          location_text,
          experience_text,
          education_text,
          tags_json,
          recruiter_activity_text,
          published_text,
          full_jd_text,
          raw_text,
          missing_fields_json,
          warnings_json,
          job_id
        )
        SELECT
          observation.id,
          observation.captured_at,
          observation.page_type,
          observation.source_page_url,
          observation.job_href_raw,
          observation.job_url,
          observation.title,
          observation.company_name,
          observation.salary_text,
          observation.location_text,
          observation.experience_text,
          observation.education_text,
          observation.tags_json,
          observation.recruiter_activity_text,
          observation.published_text,
          observation.full_jd_text,
          observation.raw_text,
          observation.missing_fields_json,
          observation.warnings_json,
          CASE
            WHEN observation.job_url IS NOT NULL THEN (
              SELECT jobs_v2.id
              FROM jobs_v2
              WHERE jobs_v2.job_url = observation.job_url
            )
            ELSE (
              SELECT jobs_v2.id
              FROM jobs_v2
              WHERE jobs_v2.unresolved_observation_id = observation.id
            )
          END
        FROM job_observations AS observation;

        DROP TABLE job_observations;
        ALTER TABLE job_observations_v2 RENAME TO job_observations;
        ALTER TABLE jobs_v2 RENAME TO jobs;

        CREATE INDEX idx_job_observations_job_id
        ON job_observations(job_id);
      `);

      const foreignKeyViolation = database
        .prepare('PRAGMA foreign_key_check')
        .get();
      if (foreignKeyViolation !== undefined) {
        throw new Error('Job identity migration produced invalid foreign keys');
      }
    },
  },
];

export const CURRENT_SCHEMA_VERSION = 2;

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
