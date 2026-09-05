import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import SqliteDatabase from 'better-sqlite3';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { openLocalDatabase } from '../src/local-service/database/database';
import { createImportRepository } from '../src/local-service/database/import-repository';
import { createJobObservationRepository } from '../src/local-service/database/observation-repository';
import { createSalaryDecodingRepository } from '../src/local-service/database/salary-decoding-repository';
import { runMigrations } from '../src/local-service/database/migrations';
import { startLocalRuntime } from '../src/local-service/runtime';
import { startLocalService } from '../src/local-service/server';
import { salaryRequest } from './helpers/salary-fixtures';

afterEach(() => { vi.restoreAllMocks(); });
const factTables = ['jobs', 'job_observations', 'import_runs', 'search_runs', 'deterministic_job_analyses'];
const derivedTables = ['search_run_salary_mappings', 'salary_mapping_evidence', 'salary_decoding_results'];
const snapshot = (db: SqliteDatabase.Database, tables: string[]) => tables.map((table) => db.prepare(`SELECT * FROM ${table} ORDER BY rowid`).all());

describe('salary decoding production integration', () => {
  it('migrates a populated frozen v4 schema without changing facts or running business backfill', () => {
    const db = new SqliteDatabase(':memory:');
    db.pragma('foreign_keys = ON');
    db.exec(readFileSync(new URL('./fixtures/database/schema-v4.sql', import.meta.url), 'utf8'));
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      const imports = createImportRepository(db, createJobObservationRepository(db));
      imports.importBatch(salaryRequest(['\ue038-\ue039K']));
      imports.importBatch(salaryRequest(['8-9K'], 'job_detail'));
      const before = snapshot(db, factTables);
      expect(before.every((rows) => rows.length > 0)).toBe(true);
      runMigrations(db);
      expect(snapshot(db, factTables)).toEqual(before);
      expect(db.pragma('foreign_key_check')).toEqual([]);
      expect(snapshot(db, derivedTables)).toEqual([[], [], []]);
      const salary = createSalaryDecodingRepository(db);
      salary.refreshAll();
      expect(salary.getCurrentForObservation(1)?.decodedText).toBe('8-9K');
      expect(snapshot(db, factTables)).toEqual(before);
      const derived = snapshot(db, derivedTables);
      salary.refreshAll(); expect(snapshot(db, derivedTables)).toEqual(derived);
    } finally { db.close(); }
  });
  it('automatically refreshes on both import types and keeps history across reopen and replay', () => {
    const directory = mkdtempSync(join(tmpdir(), 'boss-salary-reopen-'));
    const path = join(directory, 'test.sqlite3');
    let db = openLocalDatabase({ path });
    const inspection = new SqliteDatabase(path);
    const request = salaryRequest(['\ue038-\ue039K', '\ue038-\ue038K']);
    try {
      const first = db.imports.importBatch(request);
      expect(db.salaryDecoding.getCurrentForObservation(1)?.status).toBe('incomplete_mapping');
      db.imports.importBatch(salaryRequest(['8-9K'], 'job_detail'));
      expect(db.salaryDecoding.getCurrentForObservation(2)?.decodedText).toBe('8-8K');
      const derived = snapshot(inspection, derivedTables);
      db.close(); db = openLocalDatabase({ path });
      expect(db.salaryDecoding.getMappingForSearchRun(1)?.revision).toBe(1);
      expect(db.salaryDecoding.getCurrentForObservation(1)?.decodedText).toBe('8-9K');
      expect(db.imports.importBatch(request)).toEqual(first);
      db.salaryDecoding.refreshAll();
      expect(snapshot(inspection, derivedTables)).toEqual(derived);
      expect(inspection.pragma('foreign_key_check')).toEqual([]);
    } finally { db.close(); inspection.close(); rmSync(directory, { recursive: true, force: true }); }
  });
  it.each(derivedTables)('keeps HTTP save, facts and analysis committed when %s insert fails', async (table) => {
    const directory = mkdtempSync(join(tmpdir(), 'boss-salary-http-'));
    const path = join(directory, 'test.sqlite3');
    const db = openLocalDatabase({ path });
    const inspection = new SqliteDatabase(path);
    const service = await startLocalService({ imports: db.imports, port: 0 });
    const diagnostic = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      // Existing detail allows a search import to exercise all three derived inserts.
      db.imports.importBatch(salaryRequest(['8-9K'], 'job_detail'));
      inspection.exec(`CREATE TRIGGER fail_salary BEFORE INSERT ON ${table} BEGIN SELECT RAISE(FAIL, 'PRIVATE_SALARY_TOKEN_PATH_STACK'); END;`);
      const origin = `http://127.0.0.1:${service.address.port}`;
      const session = await (await fetch(`${origin}/bridge/session`)).json() as { token: string };
      const request = salaryRequest(['\ue038-\ue039K']);
      const response = await fetch(`${origin}/observations`, {
        method: 'POST', headers: { 'content-type': 'application/json', 'x-boss-job-radar-token': session.token }, body: JSON.stringify(request),
      });
      expect(response.status).toBe(201);
      expect(await response.json()).toEqual({ ids: [2] });
      expect(snapshot(inspection, factTables).map((rows) => rows.length)).toEqual([1, 2, 2, 1, 2]);
      expect(db.observations.getById(2)?.salaryText).toBe('\ue038-\ue039K');
      expect(diagnostic.mock.calls).toEqual([['Salary decoding refresh failed.']]);
      expect(snapshot(inspection, derivedTables)).toEqual([[], [], []]);
      inspection.exec('DROP TRIGGER fail_salary');
      db.imports.importBatch(request);
      expect(db.salaryDecoding.getCurrentForObservation(2)?.decodedText).toBe('8-9K');
    } finally { await service.close(); db.close(); inspection.close(); rmSync(directory, { recursive: true, force: true }); }
  });
  it.each([false, true])('backfills after listener startup and remains usable on failure=%s', async (fail) => {
    const directory = mkdtempSync(join(tmpdir(), 'boss-salary-startup-'));
    const path = join(directory, 'test.sqlite3');
    const seed = new SqliteDatabase(path);
    seed.pragma('foreign_keys = ON');
    seed.exec(readFileSync(new URL('./fixtures/database/schema-v4.sql', import.meta.url), 'utf8'));
    const diagnostic = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const imports = createImportRepository(seed, createJobObservationRepository(seed));
    imports.importBatch(salaryRequest(['\ue038-\ue039K']));
    imports.importBatch(salaryRequest(['8-9K'], 'job_detail'));
    runMigrations(seed);
    if (fail) seed.exec("CREATE TRIGGER fail_startup BEFORE INSERT ON salary_decoding_results BEGIN SELECT RAISE(FAIL, 'PRIVATE_DATA'); END;");
    diagnostic.mockClear();
    const runtime = await startLocalRuntime({ databasePath: path, port: 0 });
    try {
      expect((await fetch(`http://127.0.0.1:${runtime.address.port}/health`)).status).toBe(200);
      expect(runtime.database.salaryDecoding.getCurrentForObservation(1) === null).toBe(fail);
      expect(diagnostic.mock.calls).toEqual(fail ? [['Salary decoding refresh failed.']] : []);
      if (fail) seed.exec('DROP TRIGGER fail_startup');
      runtime.database.salaryDecoding.refreshAll();
      expect(runtime.database.salaryDecoding.getCurrentForObservation(1)?.decodedText).toBe('8-9K');
      const before = snapshot(seed, derivedTables);
      runtime.database.salaryDecoding.refreshAll(); expect(snapshot(seed, derivedTables)).toEqual(before);
    } finally { await runtime.close(); seed.close(); rmSync(directory, { recursive: true, force: true }); }
  });
});
