import { describe, expect, it } from 'vitest';

import {
  isAllowedBossUrl,
  isBossHostname,
  isSupportedHttpProtocol,
} from '../src/shared/boss-url-policy';

describe('BOSS URL policy', () => {
  it.each(['zhipin.com', 'www.zhipin.com', 'jobs.shanghai.zhipin.com'])(
    'accepts an allowed BOSS hostname: %s',
    (hostname) => {
      expect(isBossHostname(hostname)).toBe(true);
    },
  );

  it.each(['evil.example', 'fake-zhipin.com', 'zhipin.com.evil.example'])(
    'rejects a non-BOSS hostname: %s',
    (hostname) => {
      expect(isBossHostname(hostname)).toBe(false);
    },
  );

  it.each(['http:', 'https:'])('accepts a supported protocol: %s', (protocol) => {
    expect(isSupportedHttpProtocol(protocol)).toBe(true);
  });

  it.each(['chrome:', 'file:', 'javascript:'])(
    'rejects an unsupported protocol: %s',
    (protocol) => {
      expect(isSupportedHttpProtocol(protocol)).toBe(false);
    },
  );

  it('accepts only URLs satisfying both protocol and hostname rules', () => {
    expect(isAllowedBossUrl(new URL('https://www.zhipin.com/job/1'))).toBe(
      true,
    );
    expect(isAllowedBossUrl(new URL('file://zhipin.com/job/1'))).toBe(false);
    expect(isAllowedBossUrl(new URL('https://fake-zhipin.com/job/1'))).toBe(
      false,
    );
  });
});
