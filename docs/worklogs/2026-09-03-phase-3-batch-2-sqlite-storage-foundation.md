# Phase 3 / Batch 2 SQLite Storage Foundation 工作日志

## 范围与接手状态

- 分支：`master`
- 基准 commit：`b73dc43869764f4bbd4d9de6e22d75acc0baed5f`
- 接手时本地 HEAD 与 `origin/master`：均与基准 commit 一致
- 接手时工作区：干净
- 当前状态：`implementation_complete_awaiting_external_review`

本轮只建立本地 SQLite 连接基线、显式 migration runner 和 append-only `job_observations` schema。没有实现 HTTP ingestion、扩展 bridge、Job identity、dedupe、最终 Job 聚合模型或 production 数据库路径策略。

## 完成内容

- 新增 `better-sqlite3` `13.0.3` runtime dependency 和对应 TypeScript 类型。
- 新增 `openLocalDatabase({ path })` 有限 API；path 必须由调用方显式提供，支持 `:memory:` 和 file-backed 数据库。
- 每个新连接启用 `PRAGMA foreign_keys = ON`，随后自动运行 migrations；打开失败时关闭底层连接。
- wrapper 不暴露 arbitrary SQL、extension loading 或 unsafe mode，只提供有限状态检查和幂等 close。
- 新增按 version 升序执行的显式 migration runner；每个 migration 与对应 ledger 记录位于同一 transaction。
- migration 重复运行时跳过已应用 version；数据库包含高于程序最大已知版本时 fail closed；失败 migration 的 schema 变化和 ledger 记录一并回滚。
- schema version 1 新增 `schema_migrations` 和严格批准字段集合的 `job_observations`。
- `page_type` 只接受 `search_results` 与 `job_detail`；`job_url` 没有 UNIQUE constraint，相同 URL 可保存多条 observation。
- nullable 平台字段保持 `NULL`；JSON text fields 默认 `[]`，`raw_text` 默认空字符串。schema 不推断发布时间、招聘者活跃时间或 URL identity。
- `main.ts` 和现有 HTTP 服务未修改；`npm run start:local` 不打开数据库或创建 SQLite 文件。

## 开发验证

| 命令 | 结果 |
| --- | --- |
| `npm install better-sqlite3@13.0.3` | 成功；新增批准的 runtime dependency，audit 为 0 vulnerabilities |
| `npm install --save-dev @types/better-sqlite3` | 成功；新增 TypeScript 类型，audit 为 0 vulnerabilities |
| `npm test -- tests/local-database.test.ts tests/database-migrations.test.ts` | RED：2 个 suite 因待实现数据库模块不存在而按预期失败 |
| `npm test -- tests/local-database.test.ts tests/database-migrations.test.ts` | GREEN：2 files、11 tests 全部通过 |
| `npm run typecheck` | 成功；exit 0 |
| `npm run lint` | 成功；exit 0 |
| `npm test -- tests/local-service-config.test.ts tests/local-service-server.test.ts` | 成功；2 files、17 tests 全部通过 |
| `npm test` | 成功；18 files、235 tests 全部通过 |
| `npm run build` | 成功；Chrome MV3 production build，exit 0 |
| `npm run build:edge` | 成功；Edge MV3 production build，exit 0 |
| `npm run build:local` | 成功；exit 0 |
| `npm run verify:manifests` | 成功；Chrome 与 Edge manifest 均为 PASS |
| `npm run start:local` + `GET http://127.0.0.1:43123/health` | 成功；HTTP 200、原有 JSON contract 和 Content-Type 正确、无 CORS header；中断后确认 listener 已关闭 |
| `git diff --check` | 成功；未发现 whitespace error |

## Migration 与文件持久化验证

- fresh database 自动记录 version 1 与 migration name。
- 已处于最新 version 的 database 再次运行 migration 为 no-op，不重复记录或执行。
- future migration version 触发 fail-closed，并且不会继续创建 version 1 schema。
- 人为失败的 migration transaction 会回滚其 DDL，且不会写入 `schema_migrations`。
- file persistence 测试在 OS temp directory 创建 SQLite 文件，close、reopen 后验证 migration version 与 schema 仍存在；测试结束后递归删除该专用临时目录及可能 sidecar。
- 验证后仓库中没有遗留 `.db`、`.sqlite`、`.sqlite3` 或相应 sidecar 文件。

## 边界

- HTTP ingestion：未实现。
- extension bridge：未实现。
- Job identity、dedupe、最终 Job 聚合与 SearchRun 业务逻辑：未实现。
- production DB path：未决定。
- AI、rules 和 dashboard：未实现。
- 当前实现与开发测试结果不等于外部验收结论；外部审阅仍为 `PENDING`。
