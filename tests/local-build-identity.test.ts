import { execFileSync } from 'node:child_process';
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, it, vi } from 'vitest';
import { createRuntimeIdentity } from '../src/local-service/runtime-identity';
import { createLave8StructuredLlmProvider } from '../src/domain/llm/lave8-structured-llm-provider';

it('stamps the actual compiled content, independently of current HEAD and working directory', () => {
  const directory = mkdtempSync(join(tmpdir(), 'bjr-build-identity-'));
  try {
    for (const path of ['scripts', '.output/local-service', '.output/domain', '.output/shared']) mkdirSync(join(directory, path), { recursive: true });
    const script = join(directory, 'scripts/stamp-local-build.mjs');
    copyFileSync(fileURLToPath(new URL('../scripts/stamp-local-build.mjs', import.meta.url)), script);
    const main = join(directory, '.output/local-service/main.js');
    writeFileSync(main, 'export const version = 1;');
    const identityFile = join(directory, '.output/local-service/build-identity.js');
    const stamp = () => {
      execFileSync(process.execPath, [script], { cwd: tmpdir() });
      return readFileSync(identityFile, 'utf8');
    };
    const first = stamp();
    expect(first).toMatch(/sha256:[0-9a-f]{64}/);
    expect(stamp()).toBe(first);
    writeFileSync(join(directory, 'HEAD'), 'unrelated git head');
    expect(stamp()).toBe(first);
    writeFileSync(main, 'export const version = 2;');
    expect(stamp()).not.toBe(first);
    expect(first).not.toContain(directory);
  } finally { rmSync(directory, { recursive: true, force: true }); }
});

it('reports safe effective configuration with a new runtime ID and no provider calls', () => {
  const fetchImpl = vi.fn();
  const provider = createLave8StructuredLlmProvider({ apiKey: 'PRIVATE_SECRET', modelId: 'gpt-5.6-sol', fetchImpl });
  const identity = createRuntimeIdentity(provider);
  expect(identity).toMatchObject({ buildId: 'unbuilt', provider: 'lave8', model: 'gpt-5.6-sol', providerTimeoutMs: 90_000, browserDeadlineMs: null, localDeadlineMs: null, promptVersion: 'structured-llm-job-analysis-prompt-v1', outputSchemaVersion: 'structured-llm-job-analysis-v1' });
  expect(identity.runtimeStartedAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
  expect(createRuntimeIdentity(provider).runtimeId).not.toBe(identity.runtimeId);
  expect(fetchImpl).not.toHaveBeenCalled();
  expect(JSON.stringify(identity)).not.toContain('PRIVATE_SECRET');
  expect(JSON.stringify(createRuntimeIdentity({ providerId: 'PRIVATE_PROVIDER', modelId: 'PRIVATE_MODEL', generate: vi.fn() }))).not.toContain('PRIVATE_');
});
