import SqliteDatabase from 'better-sqlite3';

import { runMigrations } from './migrations.js';
import {
  createJobObservationRepository,
  type JobObservationRepository,
} from './observation-repository.js';

export interface LocalDatabase {
  readonly observations: JobObservationRepository;
  isForeignKeyEnforcementEnabled(): boolean;
  close(): void;
}

export function openLocalDatabase(options: {
  readonly path: string;
}): LocalDatabase {
  const database = new SqliteDatabase(options.path);
  let observations: JobObservationRepository;

  try {
    database.pragma('foreign_keys = ON');
    runMigrations(database);
    observations = createJobObservationRepository(database);
  } catch (error) {
    database.close();
    throw error;
  }

  let closed = false;
  return {
    observations,
    isForeignKeyEnforcementEnabled(): boolean {
      return database.pragma('foreign_keys', { simple: true }) === 1;
    },
    close(): void {
      if (closed) {
        return;
      }

      database.close();
      closed = true;
    },
  };
}
