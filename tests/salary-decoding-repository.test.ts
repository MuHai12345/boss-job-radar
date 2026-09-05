import SqliteDatabase from 'better-sqlite3';
import { afterEach, describe, expect, it } from 'vitest';
import { runMigrations, CURRENT_SCHEMA_VERSION } from '../src/local-service/database/migrations';
import { createImportRepository } from '../src/local-service/database/import-repository';
import { createJobObservationRepository } from '../src/local-service/database/observation-repository';
import { createSalaryDecodingRepository } from '../src/local-service/database/salary-decoding-repository';
import { salaryRequest } from './helpers/salary-fixtures';

const connections: SqliteDatabase.Database[] = [];
afterEach(() => { for (const db of connections.splice(0)) db.close(); });
const time = '2026-09-05T10:00:00.000Z';
const x = '\ue038', y = '\ue039', z = '\u{f0000}';

function setup() {
  const db = new SqliteDatabase(':memory:'); connections.push(db);
  db.pragma('foreign_keys = ON'); runMigrations(db);
  const observations = createJobObservationRepository(db);
  return { db, observations, imports: createImportRepository(db, observations), salary: createSalaryDecodingRepository(db) };
}
describe('SearchRun salary persistence', () => {
  it('starts at revision zero, preserves facts, learns dynamically and decodes other cards', () => {
    const { db, imports, salary } = setup();
    const search = salaryRequest([`${x}-${y}K`, `${x}-${x}K`, `${x}-${z}K`, '8-10K', null, '']);
    const { ids } = imports.importBatch(search);
    salary.refreshSearchRun(1);
    expect(salary.getMappingForSearchRun(1)).toMatchObject({ revision: 0, status: 'active', characters: {} });
    expect(salary.getCurrentForObservation(ids[0]!)).toMatchObject({ status: 'incomplete_mapping', decodedText: null, unresolvedCharacters: [x, y] });
    expect(salary.getCurrentForObservation(ids[3]!)).toMatchObject({ status: 'plain_text', decodedText: '8-10K' });
    expect(salary.getCurrentForObservation(ids[4]!)).toBeNull();
    expect(salary.getCurrentForObservation(ids[5]!)).toMatchObject({ status: 'invalid_input' });
    const before = db.prepare('SELECT * FROM job_observations ORDER BY id').all();
    const detail = imports.importBatch(salaryRequest(['8-9K'], 'job_detail'));
    salary.refreshAffectedByJobs([1]);
    expect(salary.getMappingForSearchRun(1)).toMatchObject({ revision: 1, evidenceCount: 1, characters: { [x]: '8', [y]: '9' } });
    expect(salary.getCurrentForObservation(ids[0]!)).toMatchObject({ status: 'verified_mapping', decodedText: '8-9K' });
    expect(salary.getCurrentForObservation(ids[1]!)).toMatchObject({ decodedText: '8-8K' });
    expect(salary.getCurrentForObservation(ids[2]!)).toMatchObject({ status: 'incomplete_mapping', decodedText: null, unresolvedCharacters: [z] });
    expect(salary.getCurrentForObservation(detail.ids[0]!)).toBeNull();
    expect(db.prepare('SELECT * FROM job_observations ORDER BY id LIMIT 6').all()).toEqual(before);
    const snapshot = db.prepare('SELECT * FROM salary_decoding_results ORDER BY id').all();
    imports.importBatch(search); salary.refreshAll(); salary.refreshAll();
    expect(db.prepare('SELECT * FROM salary_decoding_results ORDER BY id').all()).toEqual(snapshot);
    expect(salary.getMappingForSearchRun(1)?.revision).toBe(1);
  });
  it('keeps incomplete to verified history and never returns a stale current revision', () => {
    const { db, imports, salary } = setup();
    imports.importBatch(salaryRequest([`${x}K`, `${y}K`, `${x}-${y}K`]));
    imports.importBatch(salaryRequest(['8K'], 'job_detail'));
    salary.refreshAll();
    expect(salary.getCurrentForObservation(3)).toMatchObject({ mappingRevision: 1, status: 'incomplete_mapping' });
    imports.importBatch(salaryRequest(['9K'], 'job_detail', time, ['job1']));
    salary.refreshAll();
    expect(salary.getCurrentForObservation(3)).toMatchObject({ mappingRevision: 2, status: 'verified_mapping', decodedText: '8-9K' });
    expect(db.prepare('SELECT status FROM salary_decoding_results WHERE observation_id = 3 ORDER BY mapping_revision').all()).toEqual([
      { status: 'incomplete_mapping' }, { status: 'incomplete_mapping' }, { status: 'verified_mapping' },
    ]);
    db.prepare('DELETE FROM salary_decoding_results WHERE observation_id = 3 AND mapping_revision = 2').run();
    expect(salary.getCurrentForObservation(3)).toBeNull();
    salary.refreshAll(); expect(salary.getCurrentForObservation(3)?.mappingRevision).toBe(2);
  });
  it('fails closed on conflict while plain text and another run remain independent', () => {
    const { imports, salary } = setup();
    imports.importBatch(salaryRequest([`${x}K`, `${x}K`, '10K']));
    imports.importBatch(salaryRequest(['8K'], 'job_detail'));
    imports.importBatch(salaryRequest(['9K'], 'job_detail', time, ['job1']));
    salary.refreshAll();
    expect(salary.getMappingForSearchRun(1)).toMatchObject({ status: 'conflicted', revision: 2 });
    for (const id of [1, 2]) expect(salary.getCurrentForObservation(id)).toMatchObject({ status: 'mapping_conflict', decodedText: null });
    expect(salary.getCurrentForObservation(3)).toMatchObject({ status: 'plain_text', decodedText: '10K' });
    const next = imports.importBatch(salaryRequest([`${x}K`], 'search_results', time, ['other']));
    imports.importBatch(salaryRequest(['6K'], 'job_detail', time, ['other']));
    salary.refreshAll();
    expect(salary.getMappingForSearchRun(2)).toMatchObject({ status: 'active', characters: { [x]: '6' } });
    expect(salary.getCurrentForObservation(next.ids[0]!)).toMatchObject({ decodedText: '6K' });
    salary.refreshAll(); expect(salary.getMappingForSearchRun(1)?.revision).toBe(2);
  });
  it('allows mapping rotation with two active runs', () => {
    const { imports, salary } = setup();
    imports.importBatch(salaryRequest([`${x}K`]));
    imports.importBatch(salaryRequest(['8K'], 'job_detail'));
    const later = '2026-09-07T10:00:00.000Z';
    const second = imports.importBatch(salaryRequest([`${x}K`], 'search_results', later));
    imports.importBatch(salaryRequest(['6K'], 'job_detail', later));
    salary.refreshAll();
    expect(salary.getCurrentForObservation(1)?.decodedText).toBe('8K');
    expect(salary.getCurrentForObservation(second.ids[0]!)?.decodedText).toBe('6K');
  });
  it.each([
    ['different job', time, '8K', 'different'],
    ['before', '2026-09-05T09:59:59.999Z', '8K', 'job0'],
    ['over 24 hours', '2026-09-06T10:00:00.001Z', '8K', 'job0'],
    ['PUA detail', time, `${y}K`, 'job0'],
    ['blank detail', time, ' \t ', 'job0'],
  ])('ignores unsafe evidence: %s', (_, capturedAt, text, job) => {
    const { db, imports, salary } = setup();
    imports.importBatch(salaryRequest([`${x}K`]));
    imports.importBatch(salaryRequest([text], 'job_detail', capturedAt, [job]));
    salary.refreshAll();
    expect(salary.getMappingForSearchRun(1)).toMatchObject({ revision: 0, evidenceCount: 0 });
    expect(db.prepare('SELECT * FROM salary_mapping_evidence').all()).toHaveLength(0);
  });
  it('includes exactly 24 hours and ignores provenance-free search observations', () => {
    const { observations, imports, salary } = setup();
    const orphan = observations.append(salaryRequest([`${x}K`]).observations[0]!);
    imports.importBatch(salaryRequest([`${x}K`]));
    imports.importBatch(salaryRequest(['8K'], 'job_detail', '2026-09-06T10:00:00.000Z'));
    salary.refreshAll();
    expect(salary.getCurrentForObservation(orphan.id)).toBeNull();
    expect(salary.getCurrentForObservation(2)?.decodedText).toBe('8K');
  });
  it.each([
    ['8-10K', 'unaligned_structure'], ['8-9M', 'non_pua_mismatch'], ['a-9K', 'pua_not_aligned_to_digit'],
  ])('records rejected structure %s without poisoning mapping', (text, reason) => {
    const { db, imports, salary } = setup();
    imports.importBatch(salaryRequest([`${x}-${y}K`]));
    imports.importBatch(salaryRequest([text], 'job_detail'));
    salary.refreshAll();
    expect(salary.getMappingForSearchRun(1)).toMatchObject({ status: 'active', revision: 0, characters: {} });
    expect(db.prepare('SELECT result, rejection_reason FROM salary_mapping_evidence').all()).toEqual([{ result: 'rejected', rejection_reason: reason }]);
  });
  it('chooses the nearest eligible detail then highest id, never combines candidates', () => {
    const { observations, imports, salary, db } = setup();
    // Seed details directly so all candidates are available to the first refresh.
    observations.append(salaryRequest(['7K'], 'job_detail', '2026-09-05T12:00:00.000Z').observations[0]!);
    observations.append(salaryRequest(['9K'], 'job_detail', '2026-09-05T11:00:00.000Z').observations[0]!);
    const chosen = observations.append(salaryRequest(['8K'], 'job_detail', '2026-09-05T11:00:00.000Z').observations[0]!);
    const search = imports.importBatch(salaryRequest([`${x}K`]));
    salary.refreshAll();
    expect(salary.getCurrentForObservation(search.ids[0]!)?.decodedText).toBe('8K');
    expect(db.prepare('SELECT detail_observation_id FROM salary_mapping_evidence').all()).toEqual([{ detail_observation_id: chosen.id }]);
  });
  it('uses schema version five', () => { expect(CURRENT_SCHEMA_VERSION).toBe(5); });
  it('does not increase revision for a second evidence that adds no characters', () => {
    const { imports, salary } = setup();
    imports.importBatch(salaryRequest([`${x}K`, `${x}K`]));
    imports.importBatch(salaryRequest(['8K'], 'job_detail'));
    imports.importBatch(salaryRequest(['8K'], 'job_detail', time, ['job1']));
    expect(salary.getMappingForSearchRun(1)).toMatchObject({ revision: 1, evidenceCount: 2 });
  });
  it('reselects a late-arriving closer detail without combining the superseded candidate', () => {
    const { imports, salary, db } = setup();
    imports.importBatch(salaryRequest([`${x}K`]));
    imports.importBatch(salaryRequest(['8K'], 'job_detail', '2026-09-05T12:00:00.000Z'));
    expect(salary.getCurrentForObservation(1)?.decodedText).toBe('8K');
    imports.importBatch(salaryRequest(['6K'], 'job_detail', '2026-09-05T11:00:00.000Z'));
    expect(salary.getCurrentForObservation(1)).toMatchObject({ decodedText: '6K', mappingRevision: 2 });
    expect(salary.getMappingForSearchRun(1)?.status).toBe('active');
    expect(db.prepare('SELECT * FROM salary_mapping_evidence').all()).toHaveLength(2);
    salary.refreshAll(); expect(salary.getMappingForSearchRun(1)?.revision).toBe(2);
  });
  it('rejects the closest structural mismatch without falling back to a later salary', () => {
    const { observations, imports, salary } = setup();
    observations.append(salaryRequest(['10K'], 'job_detail', time).observations[0]!);
    observations.append(salaryRequest(['8K'], 'job_detail', '2026-09-05T12:00:00.000Z').observations[0]!);
    const saved = imports.importBatch(salaryRequest([`${x}K`]));
    expect(salary.getCurrentForObservation(saved.ids[0]!)?.status).toBe('incomplete_mapping');
    expect(salary.getMappingForSearchRun(1)?.revision).toBe(0);
  });
  it('invalidates superseded mapping when a newly selected detail is rejected', () => {
    const { imports, salary } = setup();
    imports.importBatch(salaryRequest([`${x}K`]));
    imports.importBatch(salaryRequest(['8K'], 'job_detail', '2026-09-05T12:00:00.000Z'));
    imports.importBatch(salaryRequest(['10K'], 'job_detail', '2026-09-05T11:00:00.000Z'));
    expect(salary.getMappingForSearchRun(1)).toMatchObject({ status: 'active', characters: {}, revision: 2 });
    expect(salary.getCurrentForObservation(1)).toMatchObject({ status: 'incomplete_mapping', decodedText: null, mappingRevision: 2 });
    salary.refreshAll(); expect(salary.getMappingForSearchRun(1)?.revision).toBe(2);
  });
  it('retains prior complete revision on failed refresh and continues other runs', () => {
    const { imports, salary, observations, db } = setup();
    imports.importBatch(salaryRequest([`${x}K`]));
    imports.importBatch(salaryRequest([`${x}K`], 'search_results', time, ['other']));
    observations.append(salaryRequest(['8K'], 'job_detail').observations[0]!);
    observations.append(salaryRequest(['6K'], 'job_detail', time, ['other']).observations[0]!);
    db.exec("CREATE TRIGGER fail_one_run BEFORE INSERT ON salary_decoding_results WHEN NEW.search_run_id = 1 AND NEW.mapping_revision = 1 BEGIN SELECT RAISE(FAIL, 'PRIVATE_DATA'); END;");
    expect(() => salary.refreshAll()).toThrow('Salary decoding refresh failed.');
    expect(salary.getMappingForSearchRun(1)).toMatchObject({ revision: 0, evidenceCount: 0 });
    expect(salary.getCurrentForObservation(1)).toMatchObject({ status: 'incomplete_mapping', mappingRevision: 0 });
    expect(salary.getCurrentForObservation(2)?.decodedText).toBe('6K');
    db.exec('DROP TRIGGER fail_one_run'); salary.refreshAll();
    expect(salary.getCurrentForObservation(1)?.decodedText).toBe('8K');
  });
});
