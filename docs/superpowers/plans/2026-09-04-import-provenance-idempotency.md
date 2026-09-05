# Import Provenance and Idempotency Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Persist one ImportRun per manual save, create SearchRun provenance for search pages, and make identical transport replays idempotent without deduplicating observations across user clicks.

**Architecture:** A shared protocol-v2 DTO is built directly from structured extraction. The HTTP layer validates transport and envelope consistency, while a dedicated SQLite import repository owns canonical fingerprinting and the single transaction that creates provenance plus observations. The popup creates one UUID per click and the bridge client retries only an unknown POST outcome with the same immutable request.

**Tech Stack:** TypeScript 5.9, Node.js 22 `node:crypto`, `better-sqlite3` 13.0.3, Vitest 4, WXT 0.21.4.

---

## Recovery status (2026-09-05)

Recovered at base HEAD `06180775870ce0a36b0535e4a234addf381a4d88` with uncommitted implementation and tests (case B). Existing code was retained. Tasks 1–5 are implemented; Task 6 documentation and requested developer checks are complete, with commit/push handled after the final diff check. The detailed checklist below is the original plan, not evidence of pre-interruption test execution; those red-test runs cannot be reconstructed. Fresh commands and results are recorded in `docs/worklogs/2026-09-04-phase-4-batch-5-import-provenance.md`.

Two implementation choices use the prompt's allowed scope: migration adds the nullable foreign key without rebuilding the observation table, and retry reuses the existing session token. Recovery fixes cover callback type narrowing, transaction-bound runtime validation/hash, response-stream retry/timeout, ESM type-import extension, and unused test parameters.

### Task 1: Shared import request and extraction mapping

**Files:**
- Create: `src/shared/import-request-types.ts`
- Modify: `src/bridge/structured-extraction-to-observations.ts`
- Test: `tests/structured-extraction-to-observations.test.ts`

- [ ] Add failing tests for `buildImportRequest(result, clientImportId)` covering exact source propagation, warning order, search matched count, detail `null`, observation order, and unsupported/empty results.
- [ ] Run `npx vitest run tests/structured-extraction-to-observations.test.ts` and confirm failure because the builder does not exist.
- [ ] Add the fixed protocol-v2 DTO types and implement the pure builder by composing the existing observation mapper without reparsing DOM.
- [ ] Re-run the targeted test and confirm it passes.

### Task 2: Schema version 3 migration

**Files:**
- Modify: `src/local-service/database/migrations.ts`
- Test: `tests/database-migrations.test.ts`
- Test: `tests/local-database.test.ts`
- Test: `tests/local-runtime.test.ts`

- [ ] Add failing migration tests for v2 → v3 preservation, nullable historical `import_run_id`, new constraints/indexes, idempotent rerun, and clean foreign keys.
- [ ] Run the migration targets and confirm schema-version/new-table failures.
- [ ] Add migration 3 with `import_runs`, `search_runs`, and `ALTER TABLE ADD COLUMN` that preserves every v2 fact and Job link while setting historical provenance to `NULL`.
- [ ] Re-run migration targets and confirm they pass.

### Task 3: Transactional import repository and fingerprint

**Files:**
- Create: `src/local-service/database/import-fingerprint.ts`
- Create: `src/local-service/database/import-repository.ts`
- Modify: `src/local-service/database/observation-repository.ts`
- Modify: `src/local-service/database/database.ts`
- Test: `tests/import-repository.test.ts`

- [ ] Add failing tests for deterministic SHA-256, first import, same-ID replay, different-payload conflict, new-ID snapshots reusing canonical Jobs, search/detail provenance, 143/100 counts, warning order, provenance traversal, and forced rollback.
- [ ] Run `npx vitest run tests/import-repository.test.ts` and confirm failure because the repository does not exist.
- [ ] Extract a transaction-compatible observation append primitive, implement fixed-field fingerprint serialization, and implement the import transaction plus stable conflict error.
- [ ] Re-run repository tests and directly related observation/Job repository tests.

### Task 4: HTTP protocol version 2

**Files:**
- Modify: `src/local-service/http/observation-ingestion.ts`
- Modify: `src/local-service/server.ts`
- Modify: `src/local-service/runtime.ts`
- Test: `tests/observation-ingestion.test.ts`
- Test: `tests/local-service-server.test.ts`
- Test: `tests/local-runtime.test.ts`

- [ ] Add failing tests for protocol 2 session, valid envelope, malformed UUID, inconsistent source/observation fields, `409 import_conflict`, unchanged health, and existing security wiring.
- [ ] Run targeted HTTP tests and confirm protocol/validation failures.
- [ ] Validate the exact v2 envelope, inject only the import repository capability into the handler, map the stable conflict to 409, and keep successful output limited to IDs.
- [ ] Re-run targeted HTTP and runtime tests.

### Task 5: Extension UUID lifecycle, retry, and JSON media validation

**Files:**
- Modify: `src/bridge/local-service-client.ts`
- Modify: `entrypoints/popup/main.ts`
- Modify: `entrypoints/popup/popup-controller.ts`
- Test: `tests/local-service-client.test.ts`
- Test: `tests/popup-controller.test.ts`

- [ ] Add failing tests for protocol 2 only, JSON Content-Type on session/success, `409` message, one network-only POST retry with identical payload/UUID, no HTTP retry, new UUID per click, and empty extraction avoiding localhost.
- [ ] Run the two extension targets and confirm expected failures.
- [ ] Change the client to accept an immutable ImportRequest, retry once using the same session token after an unknown POST result, and validate JSON responses; generate/build the request once per popup click with `crypto.randomUUID()`.
- [ ] Re-run the extension targets.

### Task 6: Documentation and final developer verification

**Files:**
- Modify: `README.md`
- Modify: `docs/PROJECT_STATE.md`
- Modify: `docs/PRODUCT_CAPABILITY_MATRIX.md`
- Modify: `docs/DATA_DICTIONARY.md`
- Finalize: `docs/decisions/ADR-0011-import-provenance-and-idempotency.md`
- Create: `docs/worklogs/2026-09-04-phase-4-batch-5-import-provenance.md`

- [ ] Update only Phase 4 / Batch 5 facts: Batch 4 `PASS`, Batch 5 awaiting external review, capability 6 `VERIFIED`, capability 7 `IMPLEMENTED_AWAITING_REVIEW`, schema 3 and protocol 2.
- [ ] Run the requested targeted import/search/protocol/extension tests.
- [ ] Run `npm run typecheck`, `npm run lint`, `npm run build:local`, `npm run build`, `npm run build:edge`, `npm run verify:manifests`, and `git diff --check`.
- [ ] Review the diff against every Batch 5 requirement, create one commit `feat: add import provenance and idempotency`, and push `origin/master`.
