# ADR-0011：Import provenance、SearchRun 与幂等导入

- 状态：Phase 4 / Batch 5 实现完成，等待外部审阅
- 日期：2026-09-04

## 背景

现有手动保存协议只能追加 `JobObservation`。它不能表达一次用户保存动作，也不能把搜索页保存追溯到同一次搜索结果观察；当 POST 已成功但响应丢失时，客户端也不能安全重试。

## 决策

- `Job`、`JobObservation`、`ImportRun` 与 `SearchRun` 保持独立。不同用户点击始终产生新的 observations；只有相同 `clientImportId` 的请求重放才幂等。
- bridge protocol version 2 使用固定字段 envelope：`clientImportId`、来自 `StructuredPageExtractionResult` 的 `source`，以及现有 observation 数组。
- schema version 3 新增 `import_runs`、`search_runs`，并通过 `ALTER TABLE ADD COLUMN` 给 `job_observations` 增加 nullable `import_run_id` 与索引。保留原表、Job 关联和历史事实，历史 provenance 保持 `NULL`，不猜测来源。
- 专用 import repository 使用显式固定字段 JSON serialization 与 `node:crypto` SHA-256 计算 payload fingerprint，并在一个 SQLite transaction 内完成 replay/conflict 检查、ImportRun、可选 SearchRun、Job resolve/link 和 observation append。
- 相同 `clientImportId` 与相同 fingerprint 返回第一次的 observation IDs；相同 ID 与不同 fingerprint fail closed 为 `import_conflict`，不产生任何写入。
- 只有 `search_results` 创建一个 SearchRun。它保留实际 `matchedCardCount`、保存 observation 数量和 extraction warning 原顺序；detail import 不创建 SearchRun。
- 服务端严格验证 source 与每条 observation 的 `pageType`、`capturedAt`、`sourcePageUrl` 一致，不自动修正。
- 每次用户点击保存用 `crypto.randomUUID()` 生成 fresh `clientImportId`。同一次点击的 envelope 只序列化一次，在 POST 结果未知时最多重试一次；复用同一 session token、ID 和 payload，不持久化客户端 ID。5 秒 timeout 覆盖响应 body 接收，成功响应 body 传输失败也可重试；HTTP 错误、错误 Content-Type 或完整但无效的 JSON 不重试。
- session 与成功 POST 响应必须明确声明 JSON content type。成功响应继续仅为 `{ "ids": [...] }`。

## 明确未包含

- 不实现 observation dedupe、SearchRun 搜索词/筛选器推断、`job_search_runs` 冗余关系或历史 provenance 猜测。
- 不实现自动浏览、自动保存、自动投递、分析、LLM、Dashboard 或审核状态。

## 结果

一次明确保存动作成为持久、可追溯、可安全重放的 import transaction；不同保存动作仍保留完整 observation history。protocol 1 不兼容，local service 与 extension 必须同时升级至 version 2；`GET /health` 与既有安全中间件不变。开发验证不等于外部验收，Phase 4 保持 `IN PROGRESS / NOT YET PASSED`。
