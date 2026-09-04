# Phase 4 / Batch 4：Job identity 与 dedupe

- 日期：2026-09-04
- 状态：`implementation_complete_awaiting_external_review`
- 基线提交：`cd72f8ae4ba7e649a81107db7604b663593c9ab6`

## 本批范围

本轮实现 schema version 2、既有 observation 安全回填、持久化 Job identity、canonical URL exact-match dedupe、NULL URL unresolved policy、first/last seen、latest observation pointer 与事务化 observation linking。observation 继续 append-only；HTTP request/response contract 不变。

## 实现事实

- migration `create_job_identity` 以事务化 table rebuild 新增受约束的 `jobs` 表、最终 `NOT NULL` 的 `job_observations.job_id` 和 history index。
- v1 backfill 按非 NULL `job_url` exact equality 分组；每条 NULL URL observation 各自创建 unresolved Job；所有旧 observations 在 migration 完成后均有 Job link。
- migration 的 first/last/latest 全部使用 `captured_at`，timestamp 相同时以更大 observation id 为新。
- observation repository 的 `append` 与 `appendMany` 在一个完整事务内执行 insert、Job resolve/create、link 和 lifecycle update。
- canonical URL Job 会更新更早的 first seen、更晚的 last seen，以及按 timestamp/id 决定的 latest pointer；不会覆盖历史 observation facts。
- limited `JobRepository` 只提供 `getById` 与 `findByJobUrl`，并返回明确的 `canonical_url` / `unresolved` identity status。
- `JobObservationRecord` 新增服务端生成的 `jobId`；共享 `JobObservationInput` 与 HTTP DTO 未增加 `jobId`。

## Developer verification

- `npx vitest run tests/database-migrations.test.ts tests/local-database.test.ts tests/local-runtime.test.ts tests/observation-repository.test.ts tests/job-repository.test.ts tests/observation-ingestion.test.ts`：6 个文件、82 个测试通过。
- `npm run typecheck`：通过。
- `npm run lint`：通过。
- `npm run build:local`：通过。
- `git diff --check`：通过。

以上仅为本轮 developer verification，不代表 external acceptance。

## 明确未实现

- observation dedupe：按设计未实现；重复保存仍新增 observation。
- SearchRun、provenance 与 idempotent import：未实现。
- unresolved reconciliation、manual merge 与 final aggregate facts：未实现。
- JobAnalysis、AI、用户审核状态与 Dashboard：未实现。
- 列表薪资 PUA 可信解码与正式产品链路接入：未实现，已作为能力矩阵第 15 项记录。

## 状态

Phase 4 / Batch 1、Batch 2、Batch 3 已通过外部验收。Phase 4 / Batch 4 等待外部网页版 ChatGPT 独立审阅；Phase 4 仍为 `IN PROGRESS / NOT YET PASSED`。
