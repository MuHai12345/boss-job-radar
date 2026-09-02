import { describe, expect, it } from 'vitest';

import { classifyPageUrl } from '../src/page-context';

describe('classifyPageUrl', () => {
  it.each([
    'https://www.zhipin.com/shanghai/',
    'https://zhipin.com/',
    'https://m.zhipin.com/job/123',
    'https://jobs.shanghai.zhipin.com/search',
  ])('recognizes an allowed BOSS hostname: %s', (url) => {
    expect(classifyPageUrl(url)).toMatchObject({
      kind: 'boss',
      reason: 'zhipin_hostname',
    });
  });

  it.each([
    'https://www.baidu.com/',
    'https://fake-zhipin.com/',
    'https://zhipin.com.evil.example/',
  ])('rejects a non-BOSS hostname: %s', (url) => {
    expect(classifyPageUrl(url)).toMatchObject({
      kind: 'non_boss',
      reason: 'different_hostname',
    });
  });

  it.each([[''], ['   '], [undefined], [null]])(
    'reports a missing URL as unknown: %s',
    (url) => {
      expect(classifyPageUrl(url)).toEqual({
        kind: 'unknown',
        reason: 'missing_url',
      });
    },
  );

  it('reports an invalid URL as unknown', () => {
    expect(classifyPageUrl('not a valid URL')).toEqual({
      kind: 'unknown',
      reason: 'invalid_url',
    });
  });

  it.each(['chrome://extensions/', 'file:///C:/temp/page.html'])(
    'reports an unsupported protocol as non-BOSS: %s',
    (url) => {
      expect(classifyPageUrl(url)).toMatchObject({
        kind: 'non_boss',
        reason: 'unsupported_protocol',
      });
    },
  );
});
