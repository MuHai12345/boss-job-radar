import type SqliteDatabase from 'better-sqlite3';
import type { JobObservationInput } from '../../shared/job-observation-types.js';

export type { JobObservationInput } from '../../shared/job-observation-types.js';

export interface JobObservationRecord extends JobObservationInput {
  readonly id: number;
  readonly jobId: number;
}

export interface JobObservationRepository {
  append(input: JobObservationInput): { id: number };
  appendMany(inputs: readonly JobObservationInput[]): { ids: number[] };
  getById(id: number): JobObservationRecord | null;
}

interface JobObservationRow {
  readonly id: number;
  readonly captured_at: string;
  readonly page_type: 'search_results' | 'job_detail';
  readonly source_page_url: string;
  readonly job_href_raw: string | null;
  readonly job_url: string | null;
  readonly job_id: number | null;
  readonly title: string | null;
  readonly company_name: string | null;
  readonly salary_text: string | null;
  readonly location_text: string | null;
  readonly experience_text: string | null;
  readonly education_text: string | null;
  readonly tags_json: unknown;
  readonly recruiter_activity_text: string | null;
  readonly published_text: string | null;
  readonly full_jd_text: string | null;
  readonly raw_text: string;
  readonly missing_fields_json: unknown;
  readonly warnings_json: unknown;
}

function parseStringArray(
  value: unknown,
  columnName: 'tags_json' | 'missing_fields_json' | 'warnings_json',
  observationId: number,
): string[] {
  if (typeof value !== 'string') {
    throw new Error(
      `Invalid ${columnName} for job observation ${observationId}: expected an array of strings`,
    );
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    throw new Error(
      `Invalid ${columnName} for job observation ${observationId}: malformed JSON`,
    );
  }

  if (
    !Array.isArray(parsed) ||
    !parsed.every((item): item is string => typeof item === 'string')
  ) {
    throw new Error(
      `Invalid ${columnName} for job observation ${observationId}: expected an array of strings`,
    );
  }

  return parsed;
}

function toObservationId(value: number | bigint): number {
  if (typeof value === 'bigint') {
    if (value <= 0n || value > BigInt(Number.MAX_SAFE_INTEGER)) {
      throw new Error(
        'Generated observation id is not a positive safe integer',
      );
    }

    return Number(value);
  }

  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new Error('Generated observation id is not a positive safe integer');
  }

  return value;
}

function toJobId(value: number | bigint): number {
  if (typeof value === 'bigint') {
    if (value <= 0n || value > BigInt(Number.MAX_SAFE_INTEGER)) {
      throw new Error('Generated job id is not a positive safe integer');
    }

    return Number(value);
  }

  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new Error('Generated job id is not a positive safe integer');
  }

  return value;
}

function validateRequestedId(id: number): void {
  if (!Number.isSafeInteger(id) || id <= 0) {
    throw new Error('Observation id must be a positive safe integer');
  }
}

export function createJobObservationRepository(
  database: SqliteDatabase.Database,
): JobObservationRepository {
  const insertObservation = database.prepare(`
    INSERT INTO job_observations (
      id,
      captured_at,
      page_type,
      source_page_url,
      job_href_raw,
      job_url,
      title,
      company_name,
      salary_text,
      location_text,
      experience_text,
      education_text,
      tags_json,
      recruiter_activity_text,
      published_text,
      full_jd_text,
      raw_text,
      missing_fields_json,
      warnings_json,
      job_id
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const selectObservationById = database.prepare(`
    SELECT
      id,
      captured_at,
      page_type,
      source_page_url,
      job_href_raw,
      job_url,
      job_id,
      title,
      company_name,
      salary_text,
      location_text,
      experience_text,
      education_text,
      tags_json,
      recruiter_activity_text,
      published_text,
      full_jd_text,
      raw_text,
      missing_fields_json,
      warnings_json
    FROM job_observations
    WHERE id = ?
  `);
  const selectNextObservationId = database.prepare(`
    SELECT COALESCE(
      (
        SELECT seq
        FROM sqlite_sequence
        WHERE name = 'job_observations'
      ),
      0
    ) + 1 AS id
  `);
  const insertCanonicalJob = database.prepare(`
    INSERT INTO jobs (
      job_url,
      unresolved_observation_id,
      first_seen_at,
      last_seen_at,
      latest_observation_id
    ) VALUES (?, NULL, ?, ?, ?)
  `);
  const updateCanonicalJobLifecycle = database.prepare(`
    UPDATE jobs
    SET
      first_seen_at = CASE
        WHEN ? < first_seen_at
          THEN ?
        ELSE jobs.first_seen_at
      END,
      last_seen_at = CASE
        WHEN ? > last_seen_at
          THEN ?
        ELSE jobs.last_seen_at
      END,
      latest_observation_id = CASE
        WHEN ? > last_seen_at
          OR (
            ? = last_seen_at
            AND ? > latest_observation_id
          )
          THEN ?
        ELSE jobs.latest_observation_id
      END
    WHERE id = ?
  `);
  const selectCanonicalJobId = database.prepare(`
    SELECT id
    FROM jobs
    WHERE job_url = ?
  `);
  const insertUnresolvedJob = database.prepare(`
    INSERT INTO jobs (
      job_url,
      unresolved_observation_id,
      first_seen_at,
      last_seen_at,
      latest_observation_id
    ) VALUES (NULL, ?, ?, ?, ?)
  `);
  const linkObservation = database.prepare(`
    SELECT id
    FROM jobs
    WHERE id = ?
  `);

  const appendOne = (input: JobObservationInput): number => {
    const nextObservation = selectNextObservationId.get() as {
      readonly id: number;
    };
    const observationId = toObservationId(nextObservation.id);
    let jobId: number;
    let updateExistingCanonical = false;

    if (input.jobUrl === null) {
      const jobResult = insertUnresolvedJob.run(
        observationId,
        input.capturedAt,
        input.capturedAt,
        observationId,
      );
      jobId = toJobId(jobResult.lastInsertRowid);
    } else {
      const existingJob = selectCanonicalJobId.get(input.jobUrl) as
        | { readonly id: number }
        | undefined;
      if (existingJob === undefined) {
        const jobResult = insertCanonicalJob.run(
          input.jobUrl,
          input.capturedAt,
          input.capturedAt,
          observationId,
        );
        jobId = toJobId(jobResult.lastInsertRowid);
      } else {
        jobId = toJobId(existingJob.id);
        updateExistingCanonical = true;
      }
    }

    insertObservation.run(
      observationId,
      input.capturedAt,
      input.pageType,
      input.sourcePageUrl,
      input.jobHrefRaw,
      input.jobUrl,
      input.title,
      input.companyName,
      input.salaryText,
      input.locationText,
      input.experienceText,
      input.educationText,
      JSON.stringify(input.tags),
      input.recruiterActivityText,
      input.publishedText,
      input.fullJdText,
      input.rawText,
      JSON.stringify(input.missingFields),
      JSON.stringify(input.warnings),
      jobId,
    );

    if (updateExistingCanonical) {
      const updateResult = updateCanonicalJobLifecycle.run(
        input.capturedAt,
        input.capturedAt,
        input.capturedAt,
        input.capturedAt,
        input.capturedAt,
        input.capturedAt,
        observationId,
        observationId,
        jobId,
      );
      if (updateResult.changes !== 1) {
        throw new Error('Canonical Job lifecycle was not updated');
      }
    }

    if (linkObservation.get(jobId) === undefined) {
      throw new Error('Observation was not linked to a persisted Job');
    }

    return observationId;
  };
  const appendSingle = database.transaction(
    (input: JobObservationInput): number => appendOne(input),
  );
  const appendBatch = database.transaction(
    (inputs: readonly JobObservationInput[]): number[] =>
      inputs.map((input) => appendOne(input)),
  );

  return {
    append(input): { id: number } {
      return { id: appendSingle.immediate(input) };
    },

    appendMany(inputs): { ids: number[] } {
      return { ids: appendBatch.immediate(inputs) };
    },

    getById(id): JobObservationRecord | null {
      validateRequestedId(id);
      const row = selectObservationById.get(id) as
        | JobObservationRow
        | undefined;

      if (row === undefined) {
        return null;
      }
      if (row.job_id === null) {
        throw new Error(`Job observation ${row.id} is not linked to a Job`);
      }

      return {
        capturedAt: row.captured_at,
        companyName: row.company_name,
        educationText: row.education_text,
        experienceText: row.experience_text,
        fullJdText: row.full_jd_text,
        id: row.id,
        jobHrefRaw: row.job_href_raw,
        jobId: row.job_id,
        jobUrl: row.job_url,
        locationText: row.location_text,
        missingFields: parseStringArray(
          row.missing_fields_json,
          'missing_fields_json',
          row.id,
        ),
        pageType: row.page_type,
        publishedText: row.published_text,
        rawText: row.raw_text,
        recruiterActivityText: row.recruiter_activity_text,
        salaryText: row.salary_text,
        sourcePageUrl: row.source_page_url,
        tags: parseStringArray(row.tags_json, 'tags_json', row.id),
        title: row.title,
        warnings: parseStringArray(
          row.warnings_json,
          'warnings_json',
          row.id,
        ),
      };
    },
  };
}
