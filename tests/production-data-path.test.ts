import { mkdtemp, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import {
  ensureProductionDataDirectory,
  resolveProductionDataPaths,
} from '../src/local-service/production-data-path';

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) =>
      rm(directory, { force: true, recursive: true }),
    ),
  );
});

describe('production data path policy', () => {
  it('uses LOCALAPPDATA on Windows when it is available', () => {
    expect(
      resolveProductionDataPaths({
        environment: {
          LOCALAPPDATA: 'C:\\Users\\Example\\AppData\\Local',
        },
        homeDirectory: 'C:\\Users\\Example',
        platform: 'win32',
      }),
    ).toEqual({
      dataDirectory:
        'C:\\Users\\Example\\AppData\\Local\\boss-job-radar',
      databasePath:
        'C:\\Users\\Example\\AppData\\Local\\boss-job-radar\\boss-job-radar.sqlite3',
    });
  });

  it('falls back to home AppData Local on Windows', () => {
    expect(
      resolveProductionDataPaths({
        environment: {},
        homeDirectory: 'C:\\Users\\Example',
        platform: 'win32',
      }),
    ).toEqual({
      dataDirectory:
        'C:\\Users\\Example\\AppData\\Local\\boss-job-radar',
      databasePath:
        'C:\\Users\\Example\\AppData\\Local\\boss-job-radar\\boss-job-radar.sqlite3',
    });
  });

  it('uses Library Application Support on macOS', () => {
    expect(
      resolveProductionDataPaths({
        environment: {},
        homeDirectory: '/Users/example',
        platform: 'darwin',
      }),
    ).toEqual({
      dataDirectory:
        '/Users/example/Library/Application Support/boss-job-radar',
      databasePath:
        '/Users/example/Library/Application Support/boss-job-radar/boss-job-radar.sqlite3',
    });
  });

  it('uses an absolute XDG_DATA_HOME on Linux', () => {
    expect(
      resolveProductionDataPaths({
        environment: { XDG_DATA_HOME: '/var/lib/example-data' },
        homeDirectory: '/home/example',
        platform: 'linux',
      }),
    ).toEqual({
      dataDirectory: '/var/lib/example-data/boss-job-radar',
      databasePath:
        '/var/lib/example-data/boss-job-radar/boss-job-radar.sqlite3',
    });
  });

  it('falls back to home local share on Linux', () => {
    expect(
      resolveProductionDataPaths({
        environment: {},
        homeDirectory: '/home/example',
        platform: 'linux',
      }),
    ).toEqual({
      dataDirectory: '/home/example/.local/share/boss-job-radar',
      databasePath:
        '/home/example/.local/share/boss-job-radar/boss-job-radar.sqlite3',
    });
  });

  it('rejects a relative XDG_DATA_HOME instead of resolving it from cwd', () => {
    expect(() =>
      resolveProductionDataPaths({
        environment: { XDG_DATA_HOME: 'relative/data' },
        homeDirectory: '/home/example',
        platform: 'linux',
      }),
    ).toThrow('XDG_DATA_HOME must be an absolute path');
  });

  it('creates a missing production data directory recursively', async () => {
    const parent = await mkdtemp(join(tmpdir(), 'boss-job-radar-data-path-'));
    temporaryDirectories.push(parent);
    const dataDirectory = join(parent, 'nested', 'boss-job-radar');

    await ensureProductionDataDirectory(dataDirectory);

    const directoryStats = await stat(dataDirectory);
    expect(directoryStats.isDirectory()).toBe(true);
  });
});
