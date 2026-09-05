import type SqliteDatabase from 'better-sqlite3';
import {
  createEmptySalaryCharacterMapping, decodeSalaryWithMapping, learnSalaryCharacterMapping,
  type SalaryCharacterMappingState, type SalaryDecodeStatus,
} from '../../domain/salary/salary-character-mapping.js';

export const SALARY_MAPPING_RULES_VERSION = 'search-run-salary-mapping-v1';
const WINDOW_MS = 24 * 60 * 60 * 1000;
const hasPua = (text: string): boolean => /\p{Co}/u.test(text);

export interface SearchRunSalaryMapping extends SalaryCharacterMappingState {
  searchRunId: number;
  rulesVersion: typeof SALARY_MAPPING_RULES_VERSION;
  revision: number;
  evidenceCount: number;
  updatedAt: string;
}
export interface PersistedSalaryDecodeResult {
  observationId: number;
  searchRunId: number;
  mappingRevision: number;
  status: SalaryDecodeStatus;
  decodedText: string | null;
  unresolvedCharacters: string[];
  createdAt: string;
}
export interface SalaryDecodingRepository {
  refreshSearchRun(searchRunId: number): void;
  refreshAffectedByJobs(jobIds: readonly number[]): void;
  refreshAll(): void;
  getCurrentForObservation(observationId: number): PersistedSalaryDecodeResult | null;
  getMappingForSearchRun(searchRunId: number): SearchRunSalaryMapping | null;
}
interface SalaryObservation {
  id: number;
  job_id: number;
  salary_text: string | null;
  captured_at: string;
}
interface MappingRow {
  search_run_id: number;
  rules_version: string;
  status: 'active' | 'conflicted';
  characters_json: string;
  revision: number;
  evidence_count: number;
  selected_evidence_json: string;
  updated_at: string;
}
interface Pair { search: SalaryObservation; detail: SalaryObservation }
function invalid(): never { throw new Error('Invalid stored salary decoding data'); }
function parseJson(text: string): unknown { try { return JSON.parse(text); } catch { return invalid(); } }
function readMapping(row: MappingRow): SearchRunSalaryMapping {
  const characters = parseJson(row.characters_json);
  if (row.rules_version !== SALARY_MAPPING_RULES_VERSION ||
      !['active', 'conflicted'].includes(row.status) ||
      !Number.isSafeInteger(row.revision) || row.revision < 0 ||
      !Number.isSafeInteger(row.evidence_count) || row.evidence_count < 0 ||
      typeof characters !== 'object' || characters === null || Array.isArray(characters) ||
      !Object.entries(characters).every(([key, value]) => Array.from(key).length === 1 && hasPua(key) && typeof value === 'string' && /^[0-9]$/.test(value))) invalid();
  return {
    searchRunId: row.search_run_id, rulesVersion: SALARY_MAPPING_RULES_VERSION,
    status: row.status, characters: characters as Record<string, string>, revision: row.revision,
    evidenceCount: row.evidence_count, updatedAt: row.updated_at,
  };
}
function sameState(a: SalaryCharacterMappingState, b: SalaryCharacterMappingState): boolean {
  return a.status === b.status && Object.keys(a.characters).length === Object.keys(b.characters).length &&
    Object.entries(a.characters).every(([key, value]) => b.characters[key] === value);
}

export function createSalaryDecodingRepository(database: SqliteDatabase.Database): SalaryDecodingRepository {
  // Prepare lazily: unavailable derived tables must not prevent source import or startup.
  function mappingRow(id: number): MappingRow | undefined {
    return database.prepare('SELECT * FROM search_run_salary_mappings WHERE search_run_id = ?').get(id) as MappingRow | undefined;
  }
  function searchObservations(id: number): SalaryObservation[] {
    return database.prepare(`SELECT o.id, o.job_id, o.salary_text, o.captured_at
      FROM search_runs s JOIN import_runs i ON i.id = s.import_run_id
      JOIN job_observations o ON o.import_run_id = i.id
      WHERE s.id = ? AND i.page_type = 'search_results' AND o.page_type = 'search_results'
      ORDER BY o.id`).all(id) as SalaryObservation[];
  }
  function candidates(observations: SalaryObservation[]): Pair[] {
    const pairs: Pair[] = [];
    const details = database.prepare(`SELECT id, job_id, salary_text, captured_at
      FROM job_observations WHERE job_id = ? AND page_type = 'job_detail' AND salary_text IS NOT NULL`);
    for (const search of observations) {
      if (search.salary_text === null || !hasPua(search.salary_text)) continue;
      const searchTime = Date.parse(search.captured_at);
      const eligible = (details.all(search.job_id) as SalaryObservation[]).filter((detail) => {
        const delta = Date.parse(detail.captured_at) - searchTime;
        return detail.salary_text !== null && detail.salary_text.trim().length > 0 &&
          !hasPua(detail.salary_text) && delta >= 0 && delta <= WINDOW_MS;
      });
      eligible.sort((a, b) => Date.parse(a.captured_at) - Date.parse(b.captured_at) || b.id - a.id);
      if (eligible[0]) pairs.push({ search, detail: eligible[0] });
    }
    return pairs;
  }
  function saveResults(id: number, revision: number, state: SalaryCharacterMappingState, observations: SalaryObservation[]): void {
    const insert = database.prepare(`INSERT INTO salary_decoding_results
      (observation_id, search_run_id, mapping_revision, status, decoded_text, unresolved_characters_json, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?) ON CONFLICT (observation_id, mapping_revision) DO NOTHING`);
    for (const observation of observations) {
      if (observation.salary_text === null) continue;
      // A conflict invalidates PUA interpretation, never a platform plain-text fact.
      const result = decodeSalaryWithMapping(observation.salary_text,
        hasPua(observation.salary_text) ? state : createEmptySalaryCharacterMapping());
      insert.run(observation.id, id, revision, result.status, result.decodedText,
        JSON.stringify(result.unresolvedCharacters), new Date().toISOString());
    }
  }
  const refresh = database.transaction((id: number): void => {
    if (!database.prepare('SELECT id FROM search_runs WHERE id = ?').get(id)) return;
    const observations = searchObservations(id);
    const oldRow = mappingRow(id);
    let state: SalaryCharacterMappingState = oldRow ? readMapping(oldRow) : createEmptySalaryCharacterMapping();
    let revision = oldRow?.revision ?? 0;
    const pairs = candidates(observations);
    const selected = pairs.map(({ search, detail }) => `${search.id}:${detail.id}`);
    const previous = oldRow ? parseJson(oldRow.selected_evidence_json) : [];
    if (!Array.isArray(previous) || !previous.every((key) => typeof key === 'string' && /^\d+:\d+$/.test(key))) invalid();
    const replaced = previous.some((key) => !selected.includes(key));
    const upsert = database.prepare(`INSERT INTO search_run_salary_mappings
      (search_run_id, rules_version, status, characters_json, revision, evidence_count, selected_evidence_json, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(search_run_id) DO UPDATE SET status = excluded.status, characters_json = excluded.characters_json,
      revision = excluded.revision, evidence_count = excluded.evidence_count,
      selected_evidence_json = excluded.selected_evidence_json, updated_at = excluded.updated_at`);
    function saveMapping(): void {
      const count = database.prepare('SELECT COUNT(*) AS n FROM salary_mapping_evidence WHERE search_run_id = ?').get(id) as { n: number };
      upsert.run(id, SALARY_MAPPING_RULES_VERSION, state.status, JSON.stringify(state.characters), revision,
        count.n, JSON.stringify(selected), new Date().toISOString());
    }
    if (!oldRow) { saveMapping(); saveResults(id, revision, state, observations); }

    // Normally append only new selected pairs. Late-arriving, closer details replace
    // an earlier candidate: rebuild from the selected set, never combine both salaries.
    const beforeRebuild = state;
    if (replaced && state.status !== 'conflicted') state = createEmptySalaryCharacterMapping();
    let evidenceAdded = false;
    for (const { search, detail } of pairs) {
      const exists = database.prepare(`SELECT id FROM salary_mapping_evidence
        WHERE search_run_id = ? AND search_observation_id = ? AND detail_observation_id = ?`).get(id, search.id, detail.id);
      if (exists && !replaced) continue;
      const learned = learnSalaryCharacterMapping(state, search.salary_text!, detail.salary_text!);
      if (!exists) {
        database.prepare(`INSERT INTO salary_mapping_evidence
          (search_run_id, search_observation_id, detail_observation_id, job_id, result, rejection_reason, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?)`).run(id, search.id, detail.id, search.job_id,
          learned.status, learned.status === 'rejected' ? learned.reason : null, new Date().toISOString());
        evidenceAdded = true;
      }
      const changed = !sameState(state, learned.state);
      state = learned.state;
      if (changed && !replaced) {
        revision += 1;
        saveMapping(); saveResults(id, revision, state, observations);
      }
    }
    if (replaced && !sameState(beforeRebuild, state)) revision += 1;
    if (!oldRow || evidenceAdded || replaced || revision !== oldRow.revision) saveMapping();
    saveResults(id, revision, state, observations);
  });
  function refreshRuns(ids: number[]): void {
    let failed = false;
    for (const id of new Set(ids)) { try { refresh.immediate(id); } catch { failed = true; } }
    if (failed) throw new Error('Salary decoding refresh failed.');
  }
  return {
    refreshSearchRun(id) { refresh.immediate(id); },
    refreshAffectedByJobs(jobIds) {
      const ids: number[] = [];
      for (const jobId of new Set(jobIds)) {
        const rows = database.prepare(`SELECT DISTINCT s.id FROM search_runs s
          JOIN job_observations o ON o.import_run_id = s.import_run_id
          WHERE o.job_id = ? AND o.page_type = 'search_results'`).all(jobId) as { id: number }[];
        // Candidate eligibility uses observation capturedAt, never the wall clock.
        ids.push(...rows.map((row) => row.id));
      }
      refreshRuns(ids);
    },
    refreshAll() {
      refreshRuns((database.prepare('SELECT id FROM search_runs ORDER BY id').all() as { id: number }[]).map((row) => row.id));
    },
    getMappingForSearchRun(id) { const row = mappingRow(id); return row ? readMapping(row) : null; },
    getCurrentForObservation(id) {
      const row = database.prepare(`SELECT d.* FROM salary_decoding_results d
        JOIN search_run_salary_mappings m ON m.search_run_id = d.search_run_id AND m.revision = d.mapping_revision
        JOIN search_runs s ON s.id = d.search_run_id
        JOIN job_observations o ON o.id = d.observation_id AND o.import_run_id = s.import_run_id
        WHERE d.observation_id = ? AND o.page_type = 'search_results' AND m.rules_version = ?`).get(id, SALARY_MAPPING_RULES_VERSION) as {
          observation_id: number; search_run_id: number; mapping_revision: number; status: SalaryDecodeStatus;
          decoded_text: string | null; unresolved_characters_json: string; created_at: string;
        } | undefined;
      if (!row) return null;
      const unresolved = parseJson(row.unresolved_characters_json);
      if (!Array.isArray(unresolved) || !unresolved.every((value) => typeof value === 'string' && Array.from(value).length === 1 && hasPua(value)) ||
          !['plain_text', 'verified_mapping', 'incomplete_mapping', 'mapping_conflict', 'invalid_input'].includes(row.status) ||
          (['plain_text', 'verified_mapping'].includes(row.status) ? typeof row.decoded_text !== 'string' : row.decoded_text !== null)) invalid();
      return { observationId: row.observation_id, searchRunId: row.search_run_id, mappingRevision: row.mapping_revision,
        status: row.status, decodedText: row.decoded_text, unresolvedCharacters: unresolved as string[], createdAt: row.created_at };
    },
  };
}
