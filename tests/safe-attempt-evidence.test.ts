import { mkdtempSync, readFileSync, readdirSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, expect, it, vi } from 'vitest';
import { createAttemptEvidenceStore } from '../src/local-service/attempt-evidence';
import { createRuntimeIdentity } from '../src/local-service/runtime-identity';
import { runAnalysisAttempt, emitAttemptDiagnostic } from '../src/local-service/analysis-attempt-context';
import { createLave8StructuredLlmProvider, LAVE8_STRUCTURED_LLM_TIMEOUT_MS } from '../src/domain/llm/lave8-structured-llm-provider';
import * as fs from 'node:fs';
vi.mock('node:fs', async importOriginal => {
  const original = await importOriginal<typeof import('node:fs')>();
  return { ...original, writeSync: vi.fn(original.writeSync), renameSync: vi.fn(original.renameSync) };
});

const dirs: string[] = [];
afterEach(() => { vi.useRealTimers(); vi.resetAllMocks(); vi.restoreAllMocks(); for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true }); });
function setup() {
  const directory = mkdtempSync(join(tmpdir(), 'bjr-safe-attempt-'));
  dirs.push(directory);
  const identity = createRuntimeIdentity();
  return { directory, identity, store: createAttemptEvidenceStore(directory, identity) };
}
const request = { promptVersion: 'structured-llm-job-analysis-prompt-v1', outputSchemaVersion: 'structured-llm-job-analysis-v1', systemPrompt: 'PRIVATE_PROMPT', userPrompt: 'PRIVATE_JD' } as const;

it('creates durable unique logs before transport; correlates events and writes a success summary', async () => {
  const { directory, store, identity } = setup();
  const fetchImpl = vi.fn(async () => {
    const logs = readdirSync(directory).filter(name => name.endsWith('.log'));
    expect(logs.length).toBeGreaterThan(0);
    expect(logs.some(name => readFileSync(join(directory, name), 'utf8').includes('request_accepted'))).toBe(true);
    return new Response(JSON.stringify({ status: 'completed', output: [{ type: 'message', role: 'assistant', status: 'completed', content: [{ type: 'output_text', text: '{"private":"PRIVATE_OUTPUT"}' }] }] }));
  });
  const provider = createLave8StructuredLlmProvider({ apiKey: 'PRIVATE_KEY', modelId: 'gpt-5.6-sol', fetchImpl });
  for (let ordinal = 1; ordinal <= 2; ordinal++) {
    await runAnalysisAttempt(store, async () => {
      emitAttemptDiagnostic({ scope: 'analysis_http', event: 'request_accepted', ordinal });
      await provider.generate(request);
      emitAttemptDiagnostic({ scope: 'analysis_http', event: 'result', ordinal, outcome: 'ok', analysisId: ordinal });
    });
  }
  expect(fetchImpl).toHaveBeenCalledTimes(2);
  const logs = readdirSync(directory).filter(name => name.endsWith('.log'));
  expect(logs).toHaveLength(2);
  const ids = new Set<string>();
  for (const log of logs) {
    const text = readFileSync(join(directory, log), 'utf8');
    const events = text.trim().split('\n').map(line => JSON.parse(line));
    expect(new Set(events.map(event => event.attemptId)).size).toBe(1);
    ids.add(events[0].attemptId);
    for (const event of events) expect(event.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
    const summary = JSON.parse(readFileSync(join(directory, `safe-evidence-attempt-${events[0].attemptId}.json`), 'utf8'));
    expect(summary).toMatchObject({ attemptId: events[0].attemptId, runtimeId: identity.runtimeId, buildId: identity.buildId, responseAccepted: true, outcome: 'ok', diagnosticLog: log });
    expect(summary.finishedAt).toBeTruthy();
    expect(summary.analysisId).toBeGreaterThan(0);
    expect(text + JSON.stringify(summary)).not.toMatch(/PRIVATE_|Authorization|Cookie|Session/);
    expect(text).not.toContain(directory);
  }
  expect(ids.size).toBe(2);
});

it('retains the accepted event and timeout after a fake transport never settles; zero retry/fallback', async () => {
  vi.useFakeTimers();
  const { directory, store } = setup();
  const fetchImpl = vi.fn(() => new Promise<Response>(() => {}));
  const provider = createLave8StructuredLlmProvider({ apiKey: 'PRIVATE_KEY', modelId: 'gpt-5.6-sol', fetchImpl });
  const pending = runAnalysisAttempt(store, async () => {
    emitAttemptDiagnostic({ scope: 'analysis_http', event: 'request_accepted', ordinal: 1 });
    await expect(provider.generate(request)).rejects.toThrow('Structured LLM provider failed');
    emitAttemptDiagnostic({ scope: 'analysis', stage: 'provider_failed' });
    emitAttemptDiagnostic({ scope: 'analysis_http', event: 'result', ordinal: 1, outcome: 'analysis_failed' });
  });
  await vi.advanceTimersByTimeAsync(LAVE8_STRUCTURED_LLM_TIMEOUT_MS);
  await pending;
  expect(fetchImpl).toHaveBeenCalledOnce();
  const log = readdirSync(directory).find(name => name.endsWith('.log'))!;
  expect(existsSync(join(directory, log))).toBe(true);
  expect(readFileSync(join(directory, log), 'utf8')).toContain('"event":"timeout"');
});

it('isolates concurrent attempts even when they finish in reverse order', async () => {
  const { directory, store } = setup();
  let release!: () => void;
  const blocked = new Promise<void>(resolve => { release = resolve; });
  const first = runAnalysisAttempt(store, async () => {
    emitAttemptDiagnostic({ scope: 'analysis_http', event: 'request_accepted', ordinal: 1 });
    await blocked;
    emitAttemptDiagnostic({ scope: 'analysis_http', event: 'result', ordinal: 1, outcome: 'ok', analysisId: 10 });
  });
  await runAnalysisAttempt(store, async () => {
    emitAttemptDiagnostic({ scope: 'analysis_http', event: 'request_accepted', ordinal: 2 });
    emitAttemptDiagnostic({ scope: 'analysis_http', event: 'result', ordinal: 2, outcome: 'analysis_failed' });
  });
  release();
  await first;
  const summaries = readdirSync(directory).filter(name => name.endsWith('.json')).map(name => JSON.parse(readFileSync(join(directory, name), 'utf8')));
  expect(summaries).toHaveLength(2);
  expect(summaries.find(summary => summary.localhostOrdinal === 1)).toMatchObject({ outcome: 'ok', analysisId: 10 });
  expect(summaries.find(summary => summary.localhostOrdinal === 2)).toMatchObject({ outcome: 'analysis_failed' });
  expect(summaries[0].attemptId).not.toBe(summaries[1].attemptId);
});

it.each(['append', 'summary'] as const)('retains prior evidence on %s write failure without extra provider calls', async failure => {
  const { directory, store } = setup();
  const fetchImpl = vi.fn(async () => {
    if (failure === 'append') vi.mocked(fs.writeSync).mockImplementation(() => { throw new Error('PRIVATE_IO_FAILURE'); });
    else vi.mocked(fs.renameSync).mockImplementation(() => { throw new Error('PRIVATE_IO_FAILURE'); });
    return new Response('PRIVATE_PROVIDER_ERROR', { status: 500 });
  });
  const provider = createLave8StructuredLlmProvider({ apiKey: 'PRIVATE_KEY', modelId: 'gpt-5.6-sol', fetchImpl });
  await runAnalysisAttempt(store, async () => {
    emitAttemptDiagnostic({ scope: 'analysis_http', event: 'request_accepted', ordinal: 1 });
    await expect(provider.generate(request)).rejects.toThrow('Structured LLM provider failed');
    emitAttemptDiagnostic({ scope: 'analysis_http', event: 'result', ordinal: 1, outcome: 'analysis_failed' });
  });
  expect(fetchImpl).toHaveBeenCalledOnce();
  const log = readdirSync(directory).find(name => name.endsWith('.log'))!;
  const text = readFileSync(join(directory, log), 'utf8');
  expect(text).toContain('request_accepted');
  expect(text).toContain('request_started');
  expect(text).not.toContain('PRIVATE_');
  if (failure === 'summary') expect(text).toContain('"event":"result"');
});

it('does not enter provider work if the initial evidence record cannot be durably created', async () => {
  const { store } = setup();
  vi.mocked(fs.writeSync).mockImplementation(() => { throw new Error('PRIVATE_INITIAL_IO'); });
  const action = vi.fn(async () => {});
  await expect(runAnalysisAttempt(store, action)).rejects.toThrow('Safe evidence preflight failed');
  expect(action).not.toHaveBeenCalled();
});

it('leaves an in-progress summary and an existing log if application work exits before a terminal result', async () => {
  const { directory, store } = setup();
  await expect(runAnalysisAttempt(store, async () => {
    emitAttemptDiagnostic({ scope: 'analysis_http', event: 'request_accepted', ordinal: 1 });
    throw new Error('PRIVATE_RUNTIME_FAILURE');
  })).rejects.toThrow('PRIVATE_RUNTIME_FAILURE');
  const summaryName = readdirSync(directory).find(name => name.endsWith('.json'))!;
  const summary = JSON.parse(readFileSync(join(directory, summaryName), 'utf8'));
  expect(summary).toMatchObject({ outcome: 'in_progress' });
  expect(summary).not.toHaveProperty('finishedAt');
  expect(readFileSync(join(directory, summary.diagnosticLog), 'utf8')).toContain('request_accepted');
});
