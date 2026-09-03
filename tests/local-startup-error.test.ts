import { describe, expect, it } from 'vitest';

import { formatStartupError } from '../src/local-service/startup-error';

describe('local startup error privacy', () => {
  it('redacts production paths while preserving the necessary error message', () => {
    const homeDirectory = 'C:\\Users\\Example';
    const dataDirectory = `${homeDirectory}\\AppData\\Local\\boss-job-radar`;
    const databasePath = `${dataDirectory}\\boss-job-radar.sqlite3`;
    const message = formatStartupError(
      new Error(`EACCES: permission denied, open '${databasePath}'`),
      [databasePath, dataDirectory, homeDirectory],
    );

    expect(message).toContain('EACCES: permission denied');
    expect(message).toContain('[private path]');
    expect(message).not.toContain(databasePath);
    expect(message).not.toContain(homeDirectory);
    expect(message).not.toContain('Example');
  });

  it('uses a finite message for a non-Error value', () => {
    expect(formatStartupError({ secret: 'environment dump' }, [])).toBe(
      'unknown error',
    );
  });
});
