import { readFileSync } from 'node:fs';
import SqliteDatabase from 'better-sqlite3';
import { afterEach, describe, expect, it } from 'vitest';

import { createDeterministicAnalysisRepository } from '../src/local-service/database/deterministic-analysis-repository';
import { createJobObservationRepository } from '../src/local-service/database/observation-repository';
import { runMigrations } from '../src/local-service/database/migrations';
import type { JobObservationInput } from '../src/shared/job-observation-types';

const connections: SqliteDatabase.Database[] = [];
afterEach(() => { for (const db of connections.splice(0)) db.close(); });

function analysisObservation(overrides: Partial<JobObservationInput> = {}): JobObservationInput {
  return {
    capturedAt: '2026-09-04T10:00:00.000Z', pageType: 'job_detail',
    sourcePageUrl: 'https://www.zhipin.com/job_detail/example.html',
    jobHrefRaw: '/job_detail/example.html', jobUrl: 'https://www.zhipin.com/job_detail/example.html',
    title: '电商运营助理', companyName: '合成公司', salaryText: '原始薪资', locationText: '上海',
    experienceText: '1年以内', educationText: null, tags: ['商品维护'],
    recruiterActivityText: null, publishedText: null,
    fullJdText: '岗位职责：\n负责商品维护、活动报名、详情优化。\n任职要求：工作2年以上。',
    rawText: '原始事实', missingFields: [], warnings: [], ...overrides,
  };
}

function setup(legacy = false) {
  const db = new SqliteDatabase(':memory:');
  connections.push(db);
  db.pragma('foreign_keys = ON');
  if (legacy) db.exec(readFileSync(new URL('./fixtures/database/schema-v3.sql', import.meta.url), 'utf8'));
  else runMigrations(db);
  return { db, observations: createJobObservationRepository(db), analyses: createDeterministicAnalysisRepository(db) };
}

describe('analysis source and persistence', () => {
  it('reuses the latest nonblank full JD after a newer search snapshot and preserves all facts', () => {
    const { db, observations, analyses } = setup();
    const older = observations.append(analysisObservation());
    const latest = observations.append(analysisObservation({
      capturedAt: '2026-09-05T10:00:00.000Z', pageType: 'search_results', fullJdText: null,
      title: '最新运营', experienceText: '经验不限', tags: ['天猫运营'],
    }));
    const before = db.prepare('SELECT * FROM job_observations ORDER BY id').all();
    const jobs = db.prepare('SELECT * FROM jobs').all();
    const result = analyses.analyzeJob(1)!;
    expect(result.source).toEqual({ latestObservationId: latest.id, jdObservationId: older.id });
    expect(result.experience).toMatchObject({ status: 'contradictory', hardMinimumYears: 2, header: { kind: 'unlimited' } });
    expect(result.jobNature.status).toBe('genuine_ecommerce_ops');
    expect(result.jobNature.evidence).toContainEqual(expect.objectContaining({ source: 'tags', excerpt: '天猫运营' }));
    expect(result.warnings).toContain('jd_from_older_observation');
    expect(analyses.getLatestForJob(1)).toEqual(result);
    expect(db.prepare('SELECT * FROM job_observations ORDER BY id').all()).toEqual(before);
    expect(db.prepare('SELECT * FROM jobs').all()).toEqual(jobs);
  });

  it('uses captured_at descending then higher ID for JD selection, ignoring blank text', () => {
    const { observations, analyses } = setup();
    observations.append(analysisObservation({ fullJdText: '至少1年' }));
    const chosen = observations.append(analysisObservation({ fullJdText: '至少3年' }));
    observations.append(analysisObservation({ capturedAt: '2026-09-03T10:00:00.000Z', fullJdText: '至少5年' }));
    const latest = observations.append(analysisObservation({ capturedAt: '2026-09-05T10:00:00.000Z', fullJdText: ' \n\t　 ' }));
    expect(analyses.analyzeJob(1)).toMatchObject({
      source: { latestObservationId: latest.id, jdObservationId: chosen.id },
      experience: { hardMinimumYears: 3 },
    });
  });

  it('returns explicit unknown with normalized header when no complete JD exists', () => {
    const { observations, analyses } = setup();
    const latest = observations.append(analysisObservation({ fullJdText: null }));
    expect(analyses.analyzeJob(1)).toMatchObject({
      source: { latestObservationId: latest.id, jdObservationId: null },
      jobNature: { status: 'insufficient_evidence' },
      experience: { status: 'insufficient_evidence', header: { kind: 'up_to', maxYears: 1 } },
      warnings: [],
    });
  });

  it('is idempotent, keeps history, and never returns stale observation/version results', () => {
    const { db, observations, analyses } = setup();
    observations.append(analysisObservation());
    const first = analyses.analyzeJob(1);
    const history = db.prepare('SELECT * FROM deterministic_job_analyses').all();
    expect(analyses.analyzeJob(1)).toEqual(first);
    expect(db.prepare('SELECT * FROM deterministic_job_analyses').all()).toEqual(history);
    observations.append(analysisObservation({ capturedAt: '2026-09-05T10:00:00.000Z', fullJdText: '接受无经验' }));
    expect(analyses.getLatestForJob(1)).toBeNull();
    analyses.analyzeJob(1);
    expect(db.prepare('SELECT * FROM deterministic_job_analyses ORDER BY id').all()).toHaveLength(2);
    expect(db.prepare('SELECT * FROM deterministic_job_analyses ORDER BY id LIMIT 1').all()).toEqual(history);
    db.prepare("UPDATE deterministic_job_analyses SET rules_version = 'old-version' WHERE id = 2").run();
    expect(analyses.getLatestForJob(1)).toBeNull();
    analyses.analyzeJob(1);
    expect(db.prepare('SELECT COUNT(*) AS n FROM deterministic_job_analyses').get()).toEqual({ n: 3 });
  });

  it.each(['{', '{}', '{"experience":{"status":"hard_minimum"}}'])('fails closed on invalid stored JSON: %s', (json) => {
    const { db, observations, analyses } = setup();
    observations.append(analysisObservation());
    analyses.analyzeJob(1);
    db.prepare('UPDATE deterministic_job_analyses SET analysis_json = ?').run(json);
    expect(() => analyses.getLatestForJob(1)).toThrow('Invalid stored deterministic analysis');
    expect(() => analyses.analyzeJob(1)).toThrow('Invalid stored deterministic analysis');
    expect(db.prepare('SELECT analysis_json FROM deterministic_job_analyses').get()).toEqual({ analysis_json: json });
  });

  it('rejects valid JSON whose source or indexed status disagrees with its persisted row', () => {
    const { db, observations, analyses } = setup();
    observations.append(analysisObservation());
    const value = analyses.analyzeJob(1)!;
    db.prepare('UPDATE deterministic_job_analyses SET analysis_json = ?').run(JSON.stringify({ ...value, jobId: 20 }));
    expect(() => analyses.getLatestForJob(1)).toThrow('Invalid stored deterministic analysis');
    db.prepare('UPDATE deterministic_job_analyses SET analysis_json = ?, experience_status = ?').run(JSON.stringify(value), 'no_requirement');
    expect(() => analyses.getLatestForJob(1)).toThrow('Invalid stored deterministic analysis');
  });

  it('backfills v3 Jobs after schema-only migration and repeated refresh never duplicates', () => {
    const { db, observations, analyses } = setup(true);
    observations.append(analysisObservation());
    observations.append(analysisObservation({ jobUrl: null, fullJdText: null }));
    db.prepare(`INSERT INTO import_runs (client_import_id, payload_sha256, page_type,
      source_page_url, captured_at, matched_card_count, extraction_warnings_json,
      observation_count, created_at) VALUES (?, ?, 'search_results', 'synthetic', '2026-09-04', 2, '[]', 2, '2026-09-04')`)
      .run('47f3bb11-be51-4d5f-9dbb-e48ec5f408fd', 'a'.repeat(64));
    db.exec(`INSERT INTO search_runs (import_run_id, captured_at, source_page_url,
      matched_card_count, saved_observation_count, extraction_warnings_json, created_at)
      VALUES (1, '2026-09-04', 'synthetic', 2, 2, '[]', '2026-09-04');
      UPDATE job_observations SET import_run_id = 1;`);
    const before = db.prepare('SELECT * FROM job_observations').all();
    const jobs = db.prepare('SELECT * FROM jobs').all();
    const imports = db.prepare('SELECT * FROM import_runs').all();
    const searches = db.prepare('SELECT * FROM search_runs').all();
    runMigrations(db);
    expect(db.prepare('SELECT MAX(version) AS version FROM schema_migrations').get()).toEqual({ version: 5 });
    expect(db.prepare('SELECT * FROM deterministic_job_analyses').all()).toEqual([]);
    analyses.refreshAll();
    expect(analyses.getLatestForJob(1)).not.toBeNull();
    expect(analyses.getLatestForJob(2)).not.toBeNull();
    const rows = db.prepare('SELECT * FROM deterministic_job_analyses ORDER BY id').all();
    analyses.refreshAll();
    expect(db.prepare('SELECT * FROM deterministic_job_analyses ORDER BY id').all()).toEqual(rows);
    expect(db.prepare('SELECT * FROM job_observations').all()).toEqual(before);
    expect(db.prepare('SELECT * FROM jobs').all()).toEqual(jobs);
    expect(db.prepare('SELECT * FROM import_runs').all()).toEqual(imports);
    expect(db.prepare('SELECT * FROM search_runs').all()).toEqual(searches);
    expect(db.prepare('PRAGMA foreign_key_check').all()).toEqual([]);
  });

  it('continues backfill for other Jobs when one analysis insert fails', () => {
    const { db, observations, analyses } = setup();
    observations.append(analysisObservation());
    observations.append(analysisObservation({ jobUrl: null }));
    db.exec("CREATE TRIGGER fail_one BEFORE INSERT ON deterministic_job_analyses WHEN NEW.job_id = 1 BEGIN SELECT RAISE(FAIL, 'secret'); END;");
    expect(() => analyses.refreshAll()).toThrow('Deterministic analysis refresh failed.');
    expect(analyses.getLatestForJob(1)).toBeNull();
    expect(analyses.getLatestForJob(2)).not.toBeNull();
    db.exec('DROP TRIGGER fail_one');
    analyses.refreshAll();
    expect(analyses.getLatestForJob(1)).not.toBeNull();
  });

  it('returns null for absent Jobs and rejects invalid IDs', () => {
    const { analyses } = setup();
    expect(analyses.analyzeJob(200)).toBeNull();
    expect(analyses.getLatestForJob(200)).toBeNull();
    expect(() => analyses.analyzeJob(-1)).toThrow();
    expect(() => analyses.getLatestForJob(NaN)).toThrow();
  });
});
