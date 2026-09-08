import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const snapshotSource = readFileSync(
  fileURLToPath(new URL('../entrypoints/sidepanel/snapshot.ts', import.meta.url)),
  'utf8',
);

describe('side panel AI failure cost warning', () => {
  it('states that failures are not automatically retried and a manual second click is a new potentially billable attempt', () => {
    expect(snapshotSource).toContain('不会自动重试');
    expect(snapshotSource).toContain('手动再次点击 AI 分析会开始一次新的分析尝试');
    expect(snapshotSource).toContain('可能再次发起远程请求并产生 API 费用');
    expect(snapshotSource).not.toContain('失败请求一定会产生费用');
  });
});
