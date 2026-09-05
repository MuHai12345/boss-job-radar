-- Schema captured from base 148f244; synthetic migration fixture, no user data.
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

CREATE TABLE "job_observations" (
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
          job_id INTEGER NOT NULL REFERENCES "jobs"(id)
        , import_run_id INTEGER NULL REFERENCES import_runs(id));

CREATE TABLE "jobs" (
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
            REFERENCES "job_observations"(id)
            DEFERRABLE INITIALLY DEFERRED,
          FOREIGN KEY (latest_observation_id)
            REFERENCES "job_observations"(id)
            DEFERRABLE INITIALLY DEFERRED
        );

CREATE TABLE schema_migrations (
      version INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      applied_at TEXT NOT NULL
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

CREATE INDEX idx_job_observations_import_run_id
        ON job_observations(import_run_id);

CREATE INDEX idx_job_observations_job_id
        ON job_observations(job_id);
INSERT INTO schema_migrations VALUES (1, 'create_job_observations', '2026-09-04'), (2, 'create_job_identity', '2026-09-04'), (3, 'create_import_provenance', '2026-09-04');
