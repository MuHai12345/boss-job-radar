# Phase 3 / Batch 3 Observation Persistence 工作日志

## 范围与接手状态

- 分支：`master`
- 基准 commit：`b667eaa222bc065f1faff254e7a2d4c640fbf86d`
- 接手时本地 HEAD 与 `origin/master`：均与基准 commit 一致
- 接手时工作区：干净
- Phase 3 / Batch 1：`PASS`
- Phase 3 / Batch 2：`PASS`
- 当前状态：`implementation_complete_awaiting_external_review`

本轮只在现有 schema version 1 上新增有限、append-only 的 `JobObservation` persistence API，以及 file-backed close / reopen / readback recovery。没有实现 HTTP ingestion、扩展 bridge、Job identity、dedupe、SearchRun、最终 Job 聚合、production DB path、AI、rules 或 dashboard。

## 完成内容

- 在 `src/local-service/database/` 内定义独立的 storage-facing `JobObservationInput`、`JobObservationRecord` 和 `JobObservationRepository` 类型，不依赖浏览器或 parser 类型。
- `LocalDatabase.observations` 只暴露 `append` 与 `getById`；wrapper 仍不暴露 raw SQLite connection、arbitrary SQL、`prepare` 或 `exec`。
- `append` 始终使用 prepared statement 与参数绑定执行新 `INSERT`，不查询、去重、更新、merge 或 upsert。
- `append` 对 `better-sqlite3` 返回的 `number | bigint` id 进行 positive safe integer 检查，无法安全返回时 fail closed。
- `getById` 在访问 SQLite 前要求 positive safe integer id；记录不存在时返回 `null`。
- `tags_json`、`missing_fields_json` 和 `warnings_json` 读取后通过小型 runtime parser 验证为 string array；malformed JSON 或错误 shape 均 fail closed，不回退为空数组，错误信息不包含数据库原文。
- 除数据库列名映射和三个数组的 JSON serialization 外，字符串、空字符串、`null`、换行、数组顺序和 duplicate tags 均原样保持。
- 关闭后的 repository 操作明确失败，`close()` 继续幂等，不自动重开数据库。
- repository prepared statement 初始化也位于 `openLocalDatabase` 的异常清理边界内；初始化失败时底层连接会显式关闭。
- schema version 保持 `1`，migration 与 `src/local-service/server.ts` 均未修改。

## TDD 与开发验证

| 命令 | 结果 |
| --- | --- |
| `npm test -- tests/observation-repository.test.ts` | RED：repository capability 尚不存在时 13 个行为测试按预期失败；修正测试自身的 early-failure connection cleanup 后再次确认 RED |
| `npm test -- tests/observation-repository.test.ts` | GREEN：1 file、14 tests 全部通过 |
| `npm test -- tests/local-database-initialization-failure.test.ts` | RED：repository factory 抛错时底层 `close()` 调用次数为 0；GREEN：修复初始化边界后 1 test 通过 |
| `npm test -- tests/database-migrations.test.ts` | 成功；1 file、8 tests 全部通过 |
| `npm test -- tests/local-database.test.ts` | 成功；1 file、3 tests 全部通过 |
| `npm test -- tests/local-service-config.test.ts tests/local-service-server.test.ts` | 成功；2 files、17 tests 全部通过 |
| `npm run typecheck` | 成功；exit 0 |
| `npm run lint` | 成功；exit 0 |
| `npm test` | 成功；20 files、250 tests 全部通过 |
| `npm run build` | 成功；Chrome MV3 production build，exit 0 |
| `npm run build:edge` | 成功；Edge MV3 production build，exit 0 |
| `npm run build:local` | 成功；独立 Node TypeScript build，exit 0 |
| `npm run verify:manifests` | 成功；Chrome 与 Edge manifest 均为 PASS |
| built local service `GET /health` smoke | 成功；HTTP 200、原有 JSON contract、Content-Type 与无 CORS header 均保持；结束后 listener 已释放 |

## Persistence 与安全验证

- 完全脱敏 synthetic observation 覆盖两种 `pageType`、普通字符串、中文、换行 JD、nullable platform fields、空字符串、空数组、数组顺序与 duplicate tags。
- file-backed 测试在 OS temp directory 中 append、close、reopen、按 id 完整 readback，再 append 第二条并验证不同 id；migration ledger 仍只有 version 1 一条记录。
- 连续 append 两条完全相同 observation 会返回不同 id，且两条均可分别完整读取，没有 dedupe、upsert 或 merge。
- 测试通过 raw test-only connection 分别注入 malformed `tags_json` 与 `warnings_json = '[1]'`；public repository 的 `getById` 均抛错，不静默 fallback。
- `O'Reilly` 和 `'); DROP TABLE job_observations; --` 作为普通字段值通过参数绑定完整保存并读回，后续 append 与读取继续成功。
- 每个 file-backed 测试结束后递归清理专用 OS temp directory，包含 SQLite 文件及可能的 sidecars；不向仓库写入测试数据库。

## 边界与外部审阅

- HTTP ingestion：`NOT IMPLEMENTED`
- Extension bridge：`NOT IMPLEMENTED`
- Job dedupe：`NOT IMPLEMENTED`
- Production DB path：`NOT DECIDED`
- Phase 3：`IN PROGRESS / NOT YET PASSED`
- 外部审阅：`PENDING`

本日志只记录实现与开发验证事实，不构成 Phase 3 / Batch 3 或 Phase 3 的外部验收结论。
