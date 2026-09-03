import { describe, expect, it } from 'vitest';

import {
  DEFAULT_LOCAL_SERVICE_PORT,
  parseProductionPort,
} from '../src/local-service/config';

describe('local service production port configuration', () => {
  it('uses the documented default port when no override is provided', () => {
    expect(parseProductionPort(undefined)).toBe(DEFAULT_LOCAL_SERVICE_PORT);
    expect(DEFAULT_LOCAL_SERVICE_PORT).toBe(32123);
  });

  it.each([
    ['1', 1],
    ['43210', 43210],
    ['65535', 65535],
  ])('accepts a decimal port override: %s', (value, expected) => {
    expect(parseProductionPort(value)).toBe(expected);
  });

  it.each(['', 'not-a-number', '12.5', '-1', '0', '65536', '1e3'])(
    'rejects an invalid production port override: %j',
    (value) => {
      expect(() => parseProductionPort(value)).toThrow(
        'BOSS_JOB_RADAR_LOCAL_PORT must be a decimal integer from 1 to 65535',
      );
    },
  );
});
