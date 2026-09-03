import SqliteDatabase from 'better-sqlite3';

import { runMigrations } from './migrations.js';

export interface LocalDatabase {
  isForeignKeyEnforcementEnabled(): boolean;
  close(): void;
}

export function openLocalDatabase(options: {
  readonly path: string;
}): LocalDatabase {
  const database = new SqliteDatabase(options.path);

  try {
    database.pragma('foreign_keys = ON');
    runMigrations(database);
  } catch (error) {
    database.close();
    throw error;
  }

  let closed = false;
  return {
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
