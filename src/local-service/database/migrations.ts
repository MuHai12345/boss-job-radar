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
  {
    version: 3,
    name: 'create_import_provenance',
    up(database) {
      database.exec(`
        CREATE TABLE import_runs (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          client_import_id TEXT NOT NULL UNIQUE,
          payload_sha256 TEXT NOT NULL CHECK (
            length(payload_sha256) = 64
            AND payload_sha256 NOT GLOB '*[^0-9a-f]*'
          ),
          page_type TEXT NOT NULL CHECK (
            page_type IN ('search_results', 'job_detail')
          ),
          source_page_url TEXT NOT NULL,
          captured_at TEXT NOT NULL,
          matched_card_count INTEGER NULL,
          extraction_warnings_json TEXT NOT NULL,
          observation_count INTEGER NOT NULL CHECK (observation_count > 0),
          created_at TEXT NOT NULL,
          CHECK (
            (
              page_type = 'search_results'
              AND matched_card_count IS NOT NULL
              AND matched_card_count >= 0
            ) OR (
              page_type = 'job_detail'
              AND matched_card_count IS NULL
            )
          )
        );

        CREATE TABLE search_runs (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          import_run_id INTEGER NOT NULL UNIQUE REFERENCES import_runs(id),
          captured_at TEXT NOT NULL,
          source_page_url TEXT NOT NULL,
          matched_card_count INTEGER NOT NULL CHECK (matched_card_count >= 0),
          saved_observation_count INTEGER NOT NULL CHECK (
            saved_observation_count > 0
          ),
          extraction_warnings_json TEXT NOT NULL,
          created_at TEXT NOT NULL
        );

        ALTER TABLE job_observations
        ADD COLUMN import_run_id INTEGER NULL REFERENCES import_runs(id);

        CREATE INDEX idx_job_observations_import_run_id
        ON job_observations(import_run_id);
      `);

      const foreignKeyViolation = database
        .prepare('PRAGMA foreign_key_check')
        .get();
      if (foreignKeyViolation !== undefined) {
        throw new Error(
          'Import provenance migration produced invalid foreign keys',
        );
      }
    },
  },
  {
    version: 4,
    name: 'create_deterministic_job_analyses',
    up(database) {
      database.exec(`
        CREATE TABLE deterministic_job_analyses (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          job_id INTEGER NOT NULL REFERENCES jobs(id),
          latest_observation_id INTEGER NOT NULL REFERENCES job_observations(id),
          jd_observation_id INTEGER NULL REFERENCES job_observations(id),
          rules_version TEXT NOT NULL CHECK (length(rules_version) > 0),
          job_nature_status TEXT NOT NULL CHECK (job_nature_status IN (
            'genuine_ecommerce_ops', 'mixed_ecommerce_ops',
            'likely_non_ecommerce_ops', 'insufficient_evidence'
          )),
          experience_status TEXT NOT NULL CHECK (experience_status IN (
            'no_requirement', 'preference_only', 'hard_minimum',
            'contradictory', 'insufficient_evidence'
          )),
          hard_minimum_years INTEGER NULL CHECK (
            hard_minimum_years IS NULL OR (
              typeof(hard_minimum_years) = 'integer'
              AND hard_minimum_years BETWEEN 1 AND 99
            )
          ),
          analysis_json TEXT NOT NULL,
          analyzed_at TEXT NOT NULL,
          UNIQUE (job_id, latest_observation_id, rules_version)
        );

        CREATE INDEX idx_job_observations_analysis_source
        ON job_observations(job_id, captured_at DESC, id DESC);
      `);
    },
  },
  {
    version: 5,
    name: 'create_search_run_salary_decoding',
    up(database) {
      database.exec(`
        CREATE TABLE search_run_salary_mappings (
          search_run_id INTEGER PRIMARY KEY REFERENCES search_runs(id),
          rules_version TEXT NOT NULL,
          status TEXT NOT NULL CHECK (status IN ('active', 'conflicted')),
          characters_json TEXT NOT NULL,
          revision INTEGER NOT NULL CHECK (revision >= 0),
          evidence_count INTEGER NOT NULL CHECK (evidence_count >= 0),
          selected_evidence_json TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );
        CREATE TABLE salary_mapping_evidence (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          search_run_id INTEGER NOT NULL REFERENCES search_runs(id),
          search_observation_id INTEGER NOT NULL REFERENCES job_observations(id),
          detail_observation_id INTEGER NOT NULL REFERENCES job_observations(id),
          job_id INTEGER NOT NULL REFERENCES jobs(id),
          result TEXT NOT NULL CHECK (result IN ('learned', 'rejected', 'mapping_conflict', 'state_conflicted')),
          rejection_reason TEXT NULL CHECK (rejection_reason IN (
            'invalid_input', 'no_private_use_character', 'unaligned_structure',
            'non_pua_mismatch', 'pua_not_aligned_to_digit'
          )),
          created_at TEXT NOT NULL,
          CHECK ((result = 'rejected') = (rejection_reason IS NOT NULL)),
          UNIQUE (search_run_id, search_observation_id, detail_observation_id)
        );
        CREATE TABLE salary_decoding_results (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          observation_id INTEGER NOT NULL REFERENCES job_observations(id),
          search_run_id INTEGER NOT NULL REFERENCES search_run_salary_mappings(search_run_id),
          mapping_revision INTEGER NOT NULL CHECK (mapping_revision >= 0),
          status TEXT NOT NULL CHECK (status IN (
            'plain_text', 'verified_mapping', 'incomplete_mapping', 'mapping_conflict', 'invalid_input'
          )),
          decoded_text TEXT NULL,
          unresolved_characters_json TEXT NOT NULL,
          created_at TEXT NOT NULL,
          CHECK ((status IN ('plain_text', 'verified_mapping')) = (decoded_text IS NOT NULL)),
          UNIQUE (observation_id, mapping_revision)
        );
      `);
    },
  },
];

export const CURRENT_SCHEMA_VERSION = 5;

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
