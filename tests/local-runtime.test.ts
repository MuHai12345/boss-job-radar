import { mkdtemp, rm } from 'node:fs/promises';
import { request } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import SqliteDatabase from 'better-sqlite3';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { CURRENT_SCHEMA_VERSION } from '../src/local-service/database/migrations';
import { startLocalRuntime } from '../src/local-service/runtime';
import {
  LOCAL_SERVICE_HOST,
  startLocalService,
  type ImportBatchWriter,
} from '../src/local-service/server';

const TEST_IMPORT_WRITER: ImportBatchWriter = {
  importBatch() {
    return { ids: [] };
  },
};

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) =>
      rm(directory, { force: true, recursive: true }),
    ),
  );
});

async function createTemporaryDatabasePath(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), 'boss-job-radar-runtime-'));
  temporaryDirectories.push(directory);
  return join(directory, 'boss-job-radar.sqlite3');
}

function sendHealthRequest(port: number): Promise<{
  readonly body: string;
  readonly statusCode: number | undefined;
}> {
  return new Promise((resolve, reject) => {
    const clientRequest = request(
      {
        host: LOCAL_SERVICE_HOST,
        method: 'GET',
        path: '/health',
        port,
      },
      (response) => {
        const chunks: Buffer[] = [];
        response.on('data', (chunk: Buffer) => chunks.push(chunk));
        response.on('end', () => {
          resolve({
            body: Buffer.concat(chunks).toString('utf8'),
            statusCode: response.statusCode,
          });
        });
      },
    );
    clientRequest.on('error', reject);
    clientRequest.end();
  });
}

describe('local runtime lifecycle', () => {
  it('creates a SQLite database with schema migration version 4', async () => {
    const databasePath = await createTemporaryDatabasePath();
    const runtime = await startLocalRuntime({ databasePath, port: 0 });

    try {
      const inspectionConnection = new SqliteDatabase(databasePath, {
        readonly: true,
      });
      try {
        expect(CURRENT_SCHEMA_VERSION).toBe(4);
        expect(
          inspectionConnection
            .prepare('SELECT version FROM schema_migrations ORDER BY version')
            .all(),
        ).toEqual([{ version: 1 }, { version: 2 }, { version: 3 }, { version: 4 }]);
      } finally {
        inspectionConnection.close();
      }
    } finally {
      await runtime.close();
    }
  });

  it('preserves the GET health response contract', async () => {
    const runtime = await startLocalRuntime({
      databasePath: await createTemporaryDatabasePath(),
      port: 0,
    });

    try {
      const response = await sendHealthRequest(runtime.address.port);

      expect(response.statusCode).toBe(200);
      expect(JSON.parse(response.body)).toEqual({
        service: 'boss-job-radar-local',
        status: 'ok',
      });
    } finally {
      await runtime.close();
    }
  });

  it('releases the listener and closes the database', async () => {
    const runtime = await startLocalRuntime({
      databasePath: await createTemporaryDatabasePath(),
      port: 0,
    });

    await runtime.close();

    await expect(
      sendHealthRequest(runtime.address.port),
    ).rejects.toMatchObject({ code: 'ECONNREFUSED' });
    expect(() => runtime.database.isForeignKeyEnforcementEnabled()).toThrow();
  });

  it('allows duplicate close calls', async () => {
    const runtime = await startLocalRuntime({
      databasePath: await createTemporaryDatabasePath(),
      port: 0,
    });

    await expect(runtime.close()).resolves.toBeUndefined();
    await expect(runtime.close()).resolves.toBeUndefined();
  });

  it('closes SQLite when HTTP startup fails', async () => {
    const occupiedService = await startLocalService({
      imports: TEST_IMPORT_WRITER,
      port: 0,
    });
    const databasePath = await createTemporaryDatabasePath();
    const close = vi.spyOn(SqliteDatabase.prototype, 'close');

    try {
      await expect(
        startLocalRuntime({
          databasePath,
          port: occupiedService.address.port,
        }),
      ).rejects.toMatchObject({ code: 'EADDRINUSE' });
      expect(close).toHaveBeenCalledOnce();
    } finally {
      close.mockRestore();
      await occupiedService.close();
    }
  });

  it('does not leave an HTTP listener when database startup fails', async () => {
    const releasedService = await startLocalService({
      imports: TEST_IMPORT_WRITER,
      port: 0,
    });
    const port = releasedService.address.port;
    await releasedService.close();
    const databasePath = await createTemporaryDatabasePath();

    await expect(
      startLocalRuntime({
        databasePath: databasePath.replace(/boss-job-radar\.sqlite3$/, ''),
        port,
      }),
    ).rejects.toThrow();

    const replacementService = await startLocalService({
      imports: TEST_IMPORT_WRITER,
      port,
    });
    await replacementService.close();
  });
});
