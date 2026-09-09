import { closeSync, fsyncSync, mkdirSync, openSync, renameSync, writeSync } from 'node:fs';
import { join } from 'node:path';
import type { AttemptEvidenceStore, RecordedDiagnostic } from './analysis-attempt-context.js';
import type { RuntimeIdentity } from './runtime-identity.js';

function durableWrite(fd: number, text: string): void {
  const data = Buffer.from(text, 'utf8');
  let offset = 0;
  while (offset < data.length) {
    const written = writeSync(fd, data, offset, data.length - offset);
    if (written <= 0) throw new Error('Safe evidence write failed');
    offset += written;
  }
  fsyncSync(fd);
}

/** Only typed internal diagnostics enter this sink. No request, error or source objects. */
export function createAttemptEvidenceStore(directory: string, identity: RuntimeIdentity): AttemptEvidenceStore {
  return {
    begin(attemptId, startedAt) {
      if (!/^[0-9a-f-]{36}$/.test(attemptId)) throw new Error('Invalid attempt identity');
      mkdirSync(directory, { recursive: true, mode: 0o700 });
      const diagnosticLog = `safe-diagnostics-attempt-${attemptId}.log`;
      const summaryPath = join(directory, `safe-evidence-attempt-${attemptId}.json`);
      const fd = openSync(join(directory, diagnosticLog), 'wx', 0o600);
      const summary: Record<string, unknown> = {
        ...identity, attemptId, startedAt, diagnosticLog, responseAccepted: false,
        outcome: 'in_progress', stage: 'created', diagnosticPersistence: 'ok',
      };
      function saveSummary(): void {
        const temporary = `${summaryPath}.tmp`;
        const summaryFd = openSync(temporary, 'w', 0o600);
        try { durableWrite(summaryFd, JSON.stringify(summary, null, 2) + '\n'); }
        finally { closeSync(summaryFd); }
        renameSync(temporary, summaryPath);
      }
      try {
        durableWrite(fd, JSON.stringify({ scope: 'evidence', event: 'created', timestamp: startedAt, ...summary }) + '\n');
      } catch {
        closeSync(fd);
        throw new Error('Safe evidence preflight failed');
      }
      try { saveSummary(); } catch { summary.diagnosticPersistence = 'write_failed'; }
      let closed = false;
      let logWritable = true;
      return {
        record(event: RecordedDiagnostic) {
          if (closed) return;
          if (logWritable) {
            try { durableWrite(fd, JSON.stringify(event) + '\n'); }
            catch {
              // A partial trailing record must not be joined to a later event.
              logWritable = false;
              summary.diagnosticPersistence = 'write_failed';
            }
          }
          if (event.scope === 'lave8') summary.providerStage = event.event;
          if (event.scope === 'lave8' && event.event === 'response_accepted') summary.responseAccepted = true;
          if (event.scope === 'analysis') {
            summary.stage = event.stage;
            if (event.stage === 'output_validation_failed') summary.validationReason = event.validationReason;
          }
          if (event.scope === 'analysis_http') {
            summary.localhostOrdinal = event.ordinal;
            if (event.event === 'result') {
              summary.outcome = event.outcome;
              summary.finishedAt = event.timestamp;
              if (summary.stage === 'created') summary.stage = event.outcome;
              if (event.outcome === 'ok' && event.analysisId !== undefined) summary.analysisId = event.analysisId;
            }
          }
          try { saveSummary(); } catch { summary.diagnosticPersistence = 'write_failed'; }
        },
        close() { if (!closed) { closed = true; closeSync(fd); } },
      };
    },
  };
}
