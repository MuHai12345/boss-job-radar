import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import SqliteDatabase from 'better-sqlite3';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { openLocalDatabase } from '../src/local-service/database/database';
import { startLocalRuntime } from '../src/local-service/runtime';
import type { ImportRequest } from '../src/shared/import-request-types';
import type { JobObservationInput } from '../src/shared/job-observation-types';

const temporaryDirectories: string[] = [];

afterEach(async () => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) =>
      rm(directory, { recursive: true, force: true }),
    ),
  );
});

async function temporaryDatabasePath(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), 'boss-opportunity-runtime-'));
  temporaryDirectories.push(directory);
  return join(directory, 'test.sqlite3');
}

function observation(jobUrl: string, capturedAt: string): JobObservationInput {
  return {
    capturedAt,
    pageType: 'job_detail',
    sourcePageUrl: jobUrl,
    jobHrefRaw: new URL(jobUrl).pathname,
    jobUrl,
    title: '电商运营助理',
    companyName: '合成公司',
    salaryText: '8-10K',
    locationText: '上海',
    experienceText: '经验不限',
    educationText: '本科',
    tags: ['电商运营'],
    recruiterActivityText: '刚刚活跃',
    publishedText: '今日发布',
    fullJdText: [
      '岗位职责：',
      '负责商品上下架与商品维护',
      '负责店铺日常运营',
      '负责活动报名与大促执行',
      '负责数据分析与转化率复盘',
      '岗位要求：',
      '接受无经验和转行候选人',
    ].join('\n'),
    rawText: '合成详情',
    missingFields: [],
    warnings: [],
  };
}

function request(
  clientImportId: string,
  jobUrl: string,
  capturedAt: string,
): ImportRequest {
  const value = observation(jobUrl, capturedAt);
  return {
    clientImportId,
    source: {
      pageType: 'job_detail',
      pageUrl: jobUrl,
      capturedAt,
      matchedCardCount: null,
      warnings: [],
    },
    observations: [value],
  };
}

describe('opportunity runtime backfill', () => {
  it('backfills a missing current opportunity after upstream data already exists', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-07T10:00:00.000Z'));

    const databasePath = await temporaryDatabasePath();
    const seed = openLocalDatabase({ path: databasePath });
    try {
      seed.imports.importBatch(request(
        'b7f3bb11-be51-4d5f-9dbb-e48ec5f408fd',
        'https://www.zhipin.com/job_detail/runtime-one.html',
        '2026-09-07T08:00:00.000Z',
      ));
    } finally {
      seed.close();
    }

    const cleanup = new SqliteDatabase(databasePath);
    cleanup.prepare('DELETE FROM job_opportunity_assessments').run();
    cleanup.close();

    const runtime = await startLocalRuntime({ databasePath, port: 0 });
    try {
      expect(
        runtime.database.opportunities.getLatestForJob(
          1,
          '2026-09-07T12:00:00.000Z',
        ),
      ).toMatchObject({
        jobId: 1,
        growthValue: { band: 'strong' },
        careerSwitchValue: { status: 'suitable' },
      });
      const inspection = new SqliteDatabase(databasePath, { readonly: true });
      try {
        expect(
          inspection.prepare(
            'SELECT COUNT(*) AS count FROM job_opportunity_assessments',
          ).get(),
        ).toEqual({ count: 1 });
      } finally {
        inspection.close();
      }
    } finally {
      await runtime.close();
    }
  });

  it('keeps the service usable and continues other Jobs when one startup opportunity insert fails', async () => {
    const databasePath = await temporaryDatabasePath();
    const seed = openLocalDatabase({ path: databasePath });
    try {
      seed.imports.importBatch(request(
        'c7f3bb11-be51-4d5f-9dbb-e48ec5f408fd',
        'https://www.zhipin.com/job_detail/runtime-one.html',
        '2026-09-07T08:00:00.000Z',
      ));
      seed.imports.importBatch(request(
        'd7f3bb11-be51-4d5f-9dbb-e48ec5f408fd',
        'https://www.zhipin.com/job_detail/runtime-two.html',
        '2026-09-07T08:05:00.000Z',
      ));
    } finally {
      seed.close();
    }

    const corruption = new SqliteDatabase(databasePath);
    corruption.exec(`
      DELETE FROM job_opportunity_assessments;
      CREATE TRIGGER fail_one_opportunity
      BEFORE INSERT ON job_opportunity_assessments
      WHEN NEW.job_id = 1
      BEGIN
        SELECT RAISE(ABORT, 'PRIVATE_RUNTIME_SENTINEL');
      END;
    `);
    corruption.close();

    const diagnostic = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const runtime = await startLocalRuntime({ databasePath, port: 0 });
    try {
      const health = await fetch(`http://127.0.0.1:${runtime.address.port}/health`);
      expect(health.status).toBe(200);
      expect(await health.json()).toEqual({
        service: 'boss-job-radar-local',
        status: 'ok',
      });
      expect(diagnostic.mock.calls).toContainEqual([
        'Job opportunity assessment refresh failed.',
      ]);
      expect(JSON.stringify(diagnostic.mock.calls)).not.toContain(
        'PRIVATE_RUNTIME_SENTINEL',
      );

      const inspection = new SqliteDatabase(databasePath);
      try {
        expect(
          inspection.prepare(
            'SELECT job_id FROM job_opportunity_assessments ORDER BY job_id',
          ).all(),
        ).toEqual([{ job_id: 2 }]);
        inspection.exec('DROP TRIGGER fail_one_opportunity');
      } finally {
        inspection.close();
      }

      runtime.database.opportunities.refreshAll();
      expect(
        runtime.database.opportunities.getLatestForJob(
          1,
          '2026-09-07T12:00:00.000Z',
        ),
      ).not.toBeNull();
    } finally {
      await runtime.close();
    }
  });
});
