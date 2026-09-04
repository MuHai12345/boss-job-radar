import type SqliteDatabase from 'better-sqlite3';

export type JobIdentityStatus = 'canonical_url' | 'unresolved';

export interface JobRecord {
  readonly id: number;
  readonly identityStatus: JobIdentityStatus;
  readonly jobUrl: string | null;
  readonly unresolvedObservationId: number | null;
  readonly firstSeenAt: string;
  readonly lastSeenAt: string;
  readonly latestObservationId: number;
}

export interface JobRepository {
  getById(id: number): JobRecord | null;
  findByJobUrl(jobUrl: string): JobRecord | null;
}

interface JobRow {
  readonly id: number;
  readonly job_url: string | null;
  readonly unresolved_observation_id: number | null;
  readonly first_seen_at: string;
  readonly last_seen_at: string;
  readonly latest_observation_id: number;
}

function validateRequestedId(id: number): void {
  if (!Number.isSafeInteger(id) || id <= 0) {
    throw new Error('Job id must be a positive safe integer');
  }
}

function toJobRecord(row: JobRow): JobRecord {
  const canonical = row.job_url !== null;
  if (canonical === (row.unresolved_observation_id !== null)) {
    throw new Error(`Invalid identity state for job ${row.id}`);
  }

  return {
    firstSeenAt: row.first_seen_at,
    id: row.id,
    identityStatus: canonical ? 'canonical_url' : 'unresolved',
    jobUrl: row.job_url,
    lastSeenAt: row.last_seen_at,
    latestObservationId: row.latest_observation_id,
    unresolvedObservationId: row.unresolved_observation_id,
  };
}

export function createJobRepository(
  database: SqliteDatabase.Database,
): JobRepository {
  const selectColumns = `
    id,
    job_url,
    unresolved_observation_id,
    first_seen_at,
    last_seen_at,
    latest_observation_id
  `;
  const selectById = database.prepare(`
    SELECT ${selectColumns}
    FROM jobs
    WHERE id = ?
  `);
  const selectByJobUrl = database.prepare(`
    SELECT ${selectColumns}
    FROM jobs
    WHERE job_url = ?
  `);

  return {
    getById(id): JobRecord | null {
      validateRequestedId(id);
      const row = selectById.get(id) as JobRow | undefined;
      return row === undefined ? null : toJobRecord(row);
    },

    findByJobUrl(jobUrl): JobRecord | null {
      const row = selectByJobUrl.get(jobUrl) as JobRow | undefined;
      return row === undefined ? null : toJobRecord(row);
    },
  };
}
