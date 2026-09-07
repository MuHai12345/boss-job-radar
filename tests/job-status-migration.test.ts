import SqliteDatabase from 'better-sqlite3';
import { describe, expect, it } from 'vitest';

import { runMigrations } from '../src/local-service/database/migrations';

describe('job status schema version 6', () => {
  it('creates the status tables and current-link index', () => {
    const db = new SqliteDatabase(':memory:');
    try {
      runMigrations(db);
      expect(db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name IN ('job_link_checks','job_status_assessments') ORDER BY name").all()).toEqual([
        { name: 'job_link_checks' },
        { name: 'job_status_assessments' },
      ]);
      expect(db.prepare("SELECT name FROM sqlite_master WHERE type = 'index' AND name = 'idx_job_link_checks_current'").get()).toEqual({ name: 'idx_job_link_checks_current' });
      expect(db.prepare('PRAGMA foreign_key_check').all()).toEqual([]);
    } finally {
      db.close();
    }
  });

  it('enforces allowed link statuses, marker coupling and available-only observation provenance', () => {
    const db = new SqliteDatabase(':memory:');
    db.pragma('foreign_keys = ON');
    try {
      runMigrations(db);
      db.exec(`
        BEGIN;
        PRAGMA defer_foreign_keys = ON;
        INSERT INTO jobs (id, job_url, unresolved_observation_id, first_seen_at, last_seen_at, latest_observation_id)
        VALUES (1, 'https://www.zhipin.com/job_detail/schema-example.html', NULL,
          '2026-09-07T00:00:00.000Z', '2026-09-07T00:00:00.000Z', 1);
        INSERT INTO job_observations (
          id, captured_at, page_type, source_page_url, job_url,
          tags_json, raw_text, missing_fields_json, warnings_json, job_id
        ) VALUES (
          1, '2026-09-07T00:00:00.000Z', 'job_detail',
          'https://www.zhipin.com/job_detail/schema-example.html',
          'https://www.zhipin.com/job_detail/schema-example.html',
          '[]', '', '[]', '[]', 1
        );
        COMMIT;
      `);

      expect(() => db.prepare(`
        INSERT INTO job_link_checks
          (job_id, job_url, observed_at, status, marker_code, source_observation_id, created_at)
        VALUES (1, ?, ?, 'explicitly_unavailable', NULL, NULL, ?)
      `).run(
        'https://www.zhipin.com/job_detail/schema-example.html',
        '2026-09-07T01:00:00.000Z',
        '2026-09-07T01:00:00.000Z',
      )).toThrow();

      expect(() => db.prepare(`
        INSERT INTO job_link_checks
          (job_id, job_url, observed_at, status, marker_code, source_observation_id, created_at)
        VALUES (1, ?, ?, 'available', 'job_closed', NULL, ?)
      `).run(
        'https://www.zhipin.com/job_detail/schema-example.html',
        '2026-09-07T01:00:00.000Z',
        '2026-09-07T01:00:00.000Z',
      )).toThrow();

      expect(() => db.prepare(`
        INSERT INTO job_link_checks
          (job_id, job_url, observed_at, status, marker_code, source_observation_id, created_at)
        VALUES (1, ?, ?, 'unknown', NULL, 1, ?)
      `).run(
        'https://www.zhipin.com/job_detail/schema-example.html',
        '2026-09-07T01:00:00.000Z',
        '2026-09-07T01:00:00.000Z',
      )).toThrow();

      expect(() => db.prepare(`
        INSERT INTO job_link_checks
          (job_id, job_url, observed_at, status, marker_code, source_observation_id, created_at)
        VALUES (1, ?, ?, 'not_a_status', NULL, NULL, ?)
      `).run(
        'https://www.zhipin.com/job_detail/schema-example.html',
        '2026-09-07T01:00:00.000Z',
        '2026-09-07T01:00:00.000Z',
      )).toThrow();
    } finally {
      db.close();
    }
  });

  it('keeps source-backed available checks unique per observation', () => {
    const db = new SqliteDatabase(':memory:');
    db.pragma('foreign_keys = ON');
    try {
      runMigrations(db);
      db.exec(`
        BEGIN;
        PRAGMA defer_foreign_keys = ON;
        INSERT INTO jobs (id, job_url, unresolved_observation_id, first_seen_at, last_seen_at, latest_observation_id)
        VALUES (1, 'https://www.zhipin.com/job_detail/schema-example.html', NULL,
          '2026-09-07T00:00:00.000Z', '2026-09-07T00:00:00.000Z', 1);
        INSERT INTO job_observations (
          id, captured_at, page_type, source_page_url, job_url,
          tags_json, raw_text, missing_fields_json, warnings_json, job_id
        ) VALUES (
          1, '2026-09-07T00:00:00.000Z', 'job_detail',
          'https://www.zhipin.com/job_detail/schema-example.html',
          'https://www.zhipin.com/job_detail/schema-example.html',
          '[]', '', '[]', '[]', 1
        );
        COMMIT;
      `);
      const insert = db.prepare(`
        INSERT INTO job_link_checks
          (job_id, job_url, observed_at, status, marker_code, source_observation_id, created_at)
        VALUES (1, ?, ?, 'available', NULL, 1, ?)
      `);
      insert.run(
        'https://www.zhipin.com/job_detail/schema-example.html',
        '2026-09-07T01:00:00.000Z',
        '2026-09-07T01:00:00.000Z',
      );
      expect(() => insert.run(
        'https://www.zhipin.com/job_detail/schema-example.html',
        '2026-09-07T02:00:00.000Z',
        '2026-09-07T02:00:00.000Z',
      )).toThrow();
    } finally {
      db.close();
    }
  });
});
