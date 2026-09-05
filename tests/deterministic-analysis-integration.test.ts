import { randomUUID } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import SqliteDatabase from 'better-sqlite3';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { openLocalDatabase } from '../src/local-service/database/database';
import { createImportRepository } from '../src/local-service/database/import-repository';
import { createJobObservationRepository } from '../src/local-service/database/observation-repository';
import { createDeterministicAnalysisRepository } from '../src/local-service/database/deterministic-analysis-repository';
import { runMigrations } from '../src/local-service/database/migrations';
import { startLocalRuntime } from '../src/local-service/runtime';
import { startLocalService } from '../src/local-service/server';
import type { ImportRequest } from '../src/shared/import-request-types';

function request(): ImportRequest {
  return {
    clientImportId: randomUUID(),
    source: { pageType: 'search_results', pageUrl: 'https://www.zhipin.com/web/geek/jobs', capturedAt: '2026-09-05T10:00:00.000Z', matchedCardCount: 2, warnings: [] },
    observations: [null, 'https://www.zhipin.com/job_detail/example.html'].map((jobUrl) => ({
      capturedAt: '2026-09-05T10:00:00.000Z', pageType: 'search_results', sourcePageUrl: 'https://www.zhipin.com/web/geek/jobs',
      jobHrefRaw: null, jobUrl, title: '合成岗位', companyName: null, salaryText: null, locationText: null,
      experienceText: '经验不限', educationText: null, tags: [], recruiterActivityText: null, publishedText: null,
      fullJdText: null, rawText: '合成原始事实', missingFields: [], warnings: [],
    })),
  };
}

afterEach(() => { vi.restoreAllMocks(); });

describe('analysis refresh isolation', () => {
  it('automatically analyzes affected Jobs after import commits, including replay repair', () => {
    const db = new SqliteDatabase(':memory:');
    db.pragma('foreign_keys = ON');
    runMigrations(db);
    const imports = createImportRepository(db, createJobObservationRepository(db));
    const analyses = createDeterministicAnalysisRepository(db);
    const envelope = request();
    const diagnostic = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      db.exec("CREATE TRIGGER fail_analysis BEFORE INSERT ON deterministic_job_analyses WHEN NEW.job_id = 1 BEGIN SELECT RAISE(FAIL, 'SENSITIVE_SENTINEL'); END;");
      const first = imports.importBatch(envelope);
      expect(first.ids).toHaveLength(2);
      expect(analyses.getLatestForJob(1)).toBeNull();
      expect(analyses.getLatestForJob(2)).not.toBeNull();
      expect(diagnostic.mock.calls).toEqual([['Deterministic analysis refresh failed.']]);
      for (const [table, count] of [['import_runs', 1], ['search_runs', 1], ['job_observations', 2], ['jobs', 2]] as const) {
        expect(db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get()).toEqual({ n: count });
      }
      db.exec('DROP TRIGGER fail_analysis');
      expect(imports.importBatch(envelope)).toEqual(first);
      expect(analyses.getLatestForJob(1)).not.toBeNull();
      expect(db.prepare('SELECT COUNT(*) AS n FROM deterministic_job_analyses').get()).toEqual({ n: 2 });
    } finally { db.close(); }
  });

  it('keeps HTTP save successful on analysis insert failure and facts survive reopen', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'boss-analysis-http-'));
    const path = join(directory, 'test.sqlite3');
    const database = openLocalDatabase({ path });
    const inspection = new SqliteDatabase(path);
    inspection.exec("CREATE TRIGGER fail_analysis BEFORE INSERT ON deterministic_job_analyses BEGIN SELECT RAISE(FAIL, 'SENSITIVE_SENTINEL'); END;");
    const diagnostic = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const service = await startLocalService({ imports: database.imports, port: 0 });
    const origin = `http://127.0.0.1:${service.address.port}`;
    try {
      const session = await (await fetch(`${origin}/bridge/session`)).json() as { token: string };
      const envelope = request();
      const response = await fetch(`${origin}/observations`, {
        method: 'POST', headers: { 'content-type': 'application/json', 'x-boss-job-radar-token': session.token }, body: JSON.stringify(envelope),
      });
      expect(response.status).toBe(201);
      expect(await response.json()).toEqual({ ids: [1, 2] });
      expect(diagnostic.mock.calls.every((call) => JSON.stringify(call) === '["Deterministic analysis refresh failed."]')).toBe(true);
      expect(diagnostic).toHaveBeenCalled();
      await service.close();
      database.close();
      inspection.exec('DROP TRIGGER fail_analysis');
      const reopened = openLocalDatabase({ path });
      try {
        expect(reopened.observations.getById(1)).toMatchObject({ ...envelope.observations[0], jobId: 1, importRunId: 1 });
        expect(inspection.prepare('SELECT COUNT(*) AS n FROM import_runs').get()).toEqual({ n: 1 });
        expect(inspection.prepare('SELECT COUNT(*) AS n FROM search_runs').get()).toEqual({ n: 1 });
        reopened.analyses.refreshAll();
        expect(reopened.analyses.getLatestForJob(1)).not.toBeNull();
      } finally { reopened.close(); }
    } finally {
      await service.close(); database.close(); inspection.close();
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it.each([false, true])('starts with existing Jobs and refresh failure=%s, keeping HTTP and future saves usable', async (failRefresh) => {
    const directory = mkdtempSync(join(tmpdir(), 'boss-analysis-startup-'));
    const path = join(directory, 'test.sqlite3');
    const seed = openLocalDatabase({ path });
    seed.observations.append(request().observations[0]!);
    seed.close();
    const inspection = new SqliteDatabase(path);
    if (failRefresh) inspection.exec("CREATE TRIGGER fail_startup BEFORE INSERT ON deterministic_job_analyses BEGIN SELECT RAISE(FAIL, 'PRIVATE_JD_PATH_STACK'); END;");
    const diagnostic = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const runtime = await startLocalRuntime({ databasePath: path, port: 0 });
    try {
      expect(runtime.database.analyses.getLatestForJob(1) === null).toBe(failRefresh);
      const health = await fetch(`http://127.0.0.1:${runtime.address.port}/health`);
      expect(health.status).toBe(200);
      expect(await health.json()).toEqual({ service: 'boss-job-radar-local', status: 'ok' });
      if (failRefresh) {
        expect(diagnostic.mock.calls).toEqual([['Deterministic analysis refresh failed.']]);
        inspection.exec('DROP TRIGGER fail_startup');
      }
      expect(runtime.database.imports.importBatch(request()).ids).toHaveLength(2);
      runtime.database.analyses.refreshAll();
      expect(runtime.database.analyses.getLatestForJob(1)).not.toBeNull();
    } finally {
      await runtime.close(); inspection.close(); rmSync(directory, { recursive: true, force: true });
    }
  });
});
