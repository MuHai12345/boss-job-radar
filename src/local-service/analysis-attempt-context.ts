import { AsyncLocalStorage } from 'node:async_hooks';
import { randomUUID } from 'node:crypto';
import type { AnalysisHttpDiagnosticEvent } from './server.js';
import type { StructuredLlmAnalysisDiagnosticEvent } from './runtime.js';
import type { Lave8StructuredLlmDiagnosticEvent } from '../domain/llm/lave8-structured-llm-diagnostics.js';

export interface DiagnosticMetadata { readonly timestamp?: string; readonly attemptId?: string }
export type SafeDiagnostic = AnalysisHttpDiagnosticEvent | StructuredLlmAnalysisDiagnosticEvent | Lave8StructuredLlmDiagnosticEvent;
export type RecordedDiagnostic = SafeDiagnostic & { readonly timestamp: string; readonly attemptId: string };
export interface AttemptRecorder { record(event: RecordedDiagnostic): void; close(): void }
export interface AttemptEvidenceStore { begin(attemptId: string, startedAt: string): AttemptRecorder }
const context = new AsyncLocalStorage<{ attemptId: string; recorder?: AttemptRecorder }>();

export async function runAnalysisAttempt<T>(store: AttemptEvidenceStore | undefined, action: () => Promise<T>): Promise<T> {
  const attemptId = randomUUID();
  const startedAt = new Date().toISOString();
  // Creation failure is a preflight failure: no remote request may precede a log.
  const recorder = store?.begin(attemptId, startedAt);
  return context.run({ attemptId, ...(recorder ? { recorder } : {}) }, async () => {
    try { return await action(); }
    finally { try { recorder?.close(); } catch { /* Never retry analysis for diagnostic I/O. */ } }
  });
}

export function emitAttemptDiagnostic<T extends SafeDiagnostic>(event: T, callback?: (event: T) => void): void {
  const current = context.getStore();
  const stamped = { ...event, timestamp: new Date().toISOString(), ...(current ? { attemptId: current.attemptId } : {}) };
  // Persist before notifying observers; callback mutation/failure cannot lose evidence.
  if (current) {
    try { current.recorder?.record(stamped as RecordedDiagnostic); } catch { /* No retry/fallback. */ }
  }
  try { callback?.(stamped); } catch { /* Observers do not affect product outcomes. */ }
}

// Bind at generate entry so timer/transport callbacks preserve attribution even
// when an injected scheduler executes callbacks outside Node's async context.
export function bindAttemptDiagnostic<T extends SafeDiagnostic>(callback?: (event: T) => void): (event: T) => void {
  const runInContext = AsyncLocalStorage.snapshot();
  return event => runInContext(() => emitAttemptDiagnostic(event, callback));
}
