import SqliteDatabase from 'better-sqlite3';
import { describe, expect, it, vi } from 'vitest';

import { createImportRepository } from '../src/local-service/database/import-repository';
import { createJobLinkCheckRepository } from '../src/local-service/database/job-link-check-repository';
import { createJobObservationRepository } from '../src/local-service/database/observation-repository';
import { createJobOpportunityAssessmentRepository } from '../src/local-service/database/job-opportunity-assessment-repository';
import { CURRENT_SCHEMA_VERSION, runMigrations } from '../src/local-service/database/migrations';
import type { ImportRequest } from '../src/shared/import-request-types';
import type { JobObservationInput } from '../src/shared/job-observation-types';

const JOB_URL = 'https://www.zhipin.com/job_detail/opportunity-example.html';

function detailObservation(overrides: Partial<JobObservationInput> = {}): JobObservationInput {
  return {
    capturedAt: '2026-09-07T08:00:00.000Z',
    pageType: 'job_detail',
    sourcePageUrl: JOB_URL,
    jobHrefRaw: '/job_detail/opportunity-example.html',
    jobUrl: JOB_URL,
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
    ...overrides,
  };
}

function importRequest(clientImportId: string, observation = detailObservation()): ImportRequest {
  return {
    clientImportId,
    source: {
      pageType: 'job_detail',
      pageUrl: JOB_URL,
      capturedAt: observation.capturedAt,
      matchedCardCount: null,
      warnings: [],
    },
    observations: [observation],
  };
}

function setup() {
  const database = new SqliteDatabase(':memory:');
  database.pragma('foreign_keys = ON');
  runMigrations(database);
  const observations = createJobObservationRepository(database);
  const imports = createImportRepository(database, observations);
  const opportunities = createJobOpportunityAssessmentRepository(database);
  const linkChecks = createJobLinkCheckRepository(database);
  return { database, imports, linkChecks, observations, opportunities };
}

describe('job opportunity schema v7', () => {
  it('creates the append-only opportunity table with constrained indexed fields', () => {
    const { database } = setup();
    try {
      expect(CURRENT_SCHEMA_VERSION).toBe(7);
      const columns = database.prepare("PRAGMA table_info('job_opportunity_assessments')").all() as Array<{ name: string }>;
      expect(columns.map((column) => column.name)).toEqual([
        'id', 'job_id', 'rules_version', 'latest_observation_id', 'jd_observation_id',
        'latest_link_check_id', 'source_state_key', 'growth_band', 'career_switch_status',
        'priority_tier', 'assessment_json', 'assessed_at',
      ]);
      expect(() => database.prepare(`
        INSERT INTO job_opportunity_assessments (
          job_id, rules_version, latest_observation_id, source_state_key,
          growth_band, career_switch_status, priority_tier, assessment_json, assessed_at
        ) VALUES (1, 'x', 1, 'x', 'invalid', 'suitable', 'S', '{}', '2026-09-07T00:00:00.000Z')
      `).run()).toThrow();
    } finally {
      database.close();
    }
  });
});

describe('job opportunity repository and refresh chain', () => {
  it('materializes after import, reuses the same source state, and appends when local recency crosses a bucket', () => {
    const { database, imports, observations, opportunities } = setup();
    try {
      const imported = imports.importBatch(importRequest('77f3bb11-be51-4d5f-9dbb-e48ec5f408fd'));
      const jobId = observations.getById(imported.ids[0]!)!.jobId;

      const first = opportunities.getLatestForJob(jobId, '2026-09-07T12:00:00.000Z');
      expect(first).toMatchObject({
        growthValue: { band: 'strong' },
        careerSwitchValue: { status: 'suitable' },
        priority: { tier: 'S' },
        source: { localObservationRecencyBand: 'today' },
      });
      const firstCount = (database.prepare('SELECT COUNT(*) AS count FROM job_opportunity_assessments').get() as { count: number }).count;

      const sameBucket = opportunities.getLatestForJob(jobId, '2026-09-07T18:00:00.000Z');
      expect(sameBucket?.assessedAt).toBe(first?.assessedAt);
      expect((database.prepare('SELECT COUNT(*) AS count FROM job_opportunity_assessments').get() as { count: number }).count).toBe(firstCount);

      const later = opportunities.getLatestForJob(jobId, '2026-09-09T12:00:00.000Z');
      expect(later?.source.localObservationRecencyBand).toBe('within_3_days');
      expect(later?.assessedAt).toBe('2026-09-09T12:00:00.000Z');
      expect((database.prepare('SELECT COUNT(*) AS count FROM job_opportunity_assessments').get() as { count: number }).count).toBe(firstCount + 1);
    } finally {
      database.close();
    }
  });

  it('refreshes opportunity after a manual link fact and lets newer unavailable evidence become C', () => {
    const { database, imports, linkChecks, observations, opportunities } = setup();
    try {
      const imported = imports.importBatch(importRequest('87f3bb11-be51-4d5f-9dbb-e48ec5f408fd'));
      const jobId = observations.getById(imported.ids[0]!)!.jobId;
      expect(opportunities.getLatestForJob(jobId, '2026-09-07T12:00:00.000Z')?.priority.tier).toBe('S');

      expect(linkChecks.append({
        jobUrl: JOB_URL,
        observedAt: '2026-09-07T13:00:00.000Z',
        status: 'explicitly_unavailable',
        markerCode: 'job_closed',
      })).toMatchObject({ id: expect.any(Number) });

      const after = opportunities.getLatestForJob(jobId, '2026-09-07T14:00:00.000Z');
      expect(after?.priority.tier).toBe('C');
      expect(after?.risks[0]?.code).toBe('explicitly_unavailable');
      expect(after?.source.latestLinkCheckId).toEqual(expect.any(Number));
    } finally {
      database.close();
    }
  });

  it('fails closed on corrupted current stored JSON instead of silently replacing it', () => {
    const { database, imports, observations, opportunities } = setup();
    try {
      const imported = imports.importBatch(importRequest('97f3bb11-be51-4d5f-9dbb-e48ec5f408fd'));
      const jobId = observations.getById(imported.ids[0]!)!.jobId;
      const current = opportunities.getLatestForJob(jobId, '2026-09-07T12:00:00.000Z');
      expect(current).not.toBeNull();

      database.prepare(`
        UPDATE job_opportunity_assessments
        SET assessment_json = '{}'
        WHERE id = (SELECT MAX(id) FROM job_opportunity_assessments)
      `).run();

      expect(() => opportunities.getLatestForJob(jobId, '2026-09-07T13:00:00.000Z')).toThrow(
        'Invalid stored job opportunity assessment',
      );
    } finally {
      database.close();
    }
  });

  it('fails closed on a structurally valid but semantically altered current assessment', () => {
    const { database, imports, observations, opportunities } = setup();
    try {
      const imported = imports.importBatch(importRequest('b8f3bb11-be51-4d5f-9dbb-e48ec5f408fd'));
      const jobId = observations.getById(imported.ids[0]!)!.jobId;
      const current = opportunities.getLatestForJob(jobId, '2026-09-07T12:00:00.000Z');
      expect(current?.priority.tier).toBe('S');

      const altered = {
        ...current!,
        priority: {
          tier: 'C',
          reasonCodes: ['explicitly_unavailable'],
        },
      };
      database.prepare(`
        UPDATE job_opportunity_assessments
        SET assessment_json = ?, priority_tier = 'C'
        WHERE id = (SELECT MAX(id) FROM job_opportunity_assessments)
      `).run(JSON.stringify(altered));

      expect(() => opportunities.getLatestForJob(jobId, '2026-09-07T13:00:00.000Z')).toThrow(
        'Invalid stored job opportunity assessment',
      );
    } finally {
      database.close();
    }
  });

  it('isolates opportunity refresh failure from committed imports and uses only the generic diagnostic', () => {
    const { database, imports } = setup();
    const diagnostic = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    try {
      database.exec(`
        CREATE TRIGGER fail_opportunity_insert
        BEFORE INSERT ON job_opportunity_assessments
        BEGIN
          SELECT RAISE(ABORT, 'sensitive opportunity failure detail');
        END;
      `);

      expect(() => imports.importBatch(importRequest('a7f3bb11-be51-4d5f-9dbb-e48ec5f408fd'))).not.toThrow();
      expect(database.prepare('SELECT COUNT(*) AS count FROM import_runs').get()).toEqual({ count: 1 });
      expect(database.prepare('SELECT COUNT(*) AS count FROM job_observations').get()).toEqual({ count: 1 });
      expect(diagnostic.mock.calls).toContainEqual(['Job opportunity assessment refresh failed.']);
      expect(JSON.stringify(diagnostic.mock.calls)).not.toContain('sensitive opportunity failure detail');
    } finally {
      diagnostic.mockRestore();
      database.close();
    }
  });

  it('returns null for absent jobs and rejects invalid ids and assessment times', () => {
    const { database, opportunities } = setup();
    try {
      expect(opportunities.getLatestForJob(1, '2026-09-07T12:00:00.000Z')).toBeNull();
      expect(() => opportunities.getLatestForJob(0)).toThrow('Job id must be a positive safe integer');
      expect(() => opportunities.getLatestForJob(1, 'not-a-time')).toThrow('Invalid assessment time.');
    } finally {
      database.close();
    }
  });
});
