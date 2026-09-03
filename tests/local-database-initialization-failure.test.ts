import SqliteDatabase from 'better-sqlite3';
import { describe, expect, it, vi } from 'vitest';

const { repositoryInitializationError } = vi.hoisted(() => ({
  repositoryInitializationError: new Error(
    'intentional repository initialization failure',
  ),
}));

vi.mock('../src/local-service/database/observation-repository', () => ({
  createJobObservationRepository(): never {
    throw repositoryInitializationError;
  },
}));

import { openLocalDatabase } from '../src/local-service/database/database';

describe('local SQLite database initialization failure', () => {
  it('closes the connection when repository initialization fails', () => {
    const close = vi.spyOn(SqliteDatabase.prototype, 'close');

    try {
      expect(() => openLocalDatabase({ path: ':memory:' })).toThrow(
        repositoryInitializationError,
      );
      expect(close).toHaveBeenCalledOnce();
    } finally {
      close.mockRestore();
    }
  });
});
