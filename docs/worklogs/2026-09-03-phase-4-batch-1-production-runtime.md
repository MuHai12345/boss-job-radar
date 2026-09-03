# Phase 4 / Batch 1 Production Runtime 工作日志

## 范围与接手状态

- 分支：`master`
- 基准 commit：`29682a1c5ae3540e64925aef9dc39e0e778e501b`
- 接手时本地 HEAD 与 `origin/master`：均与基准 commit 一致
- 接手时工作区：干净
- Phase 3：`PASS`
- Phase 4：`IN PROGRESS / NOT YET PASSED`
- Phase 4 / Batch 1：`repair_complete_awaiting_external_re_review`

本轮只实现 production SQLite data path policy、production data directory 创建、SQLite 与 loopback HTTP service 的统一 local runtime lifecycle，以及 production `main.ts` 装配。没有实现 HTTP ingestion、extension bridge、Job identity、dedupe、最终 Job aggregation、SearchRun、AI、rules 或 Dashboard。

## External review repair

- 首轮外部结论：`CHANGES_REQUIRED`
- repair 基准 commit：`4bc52d2a23149a74ce65444ca589bd23ea797434`
- Windows `LOCALAPPDATA` 和 fallback home 现要求 fully-qualified Windows path；drive-rooted、UNC 和 Node 可安全处理的 extended absolute path 保留，rooted-without-drive、drive-relative、relative 和空路径 fail closed。
- macOS / Linux 创建最终 app data directory 时请求 `0700`，并在目录已存在时对最终 `boss-job-radar` directory 执行 `chmod(0700)`；chmod 失败直接向上抛出。Windows 不调用 chmod。
- 不删除或清空目录，不修改数据库内容，不 chmod 父级用户目录。

### Final Windows path hardening repair

- 第二轮外部结论：`CHANGES_REQUIRED`
- repair 基准 commit：`8d5369f69d3f358eea487cd82765232d8b8b5d37`
- POSIX app-directory permission repair 已通过外部独立验收，本轮没有修改 POSIX permission implementation。
- Windows data root 改为显式 allowlist：标准 drive absolute、完整 UNC、完整 extended drive 和完整 extended UNC filesystem paths。
- `\\.\` device namespace、`\\?\GLOBALROOT`、其他未批准的 namespace，以及缺少 drive separator 或 UNC server/share 的不完整 roots 均 fail closed；相同 contract 同时用于 `LOCALAPPDATA` 和 fallback home。

## 完成内容

- 新增可测试的 production data path resolver，由调用方显式传入 platform、environment 和 home directory，不依赖测试机真实用户目录。
- production database 固定为 OS 用户级 data directory 下的 `boss-job-radar/boss-job-radar.sqlite3`。
- relative Linux `XDG_DATA_HOME` fail closed；production 不提供任意 database path override。
- production 启动前使用 Node filesystem API 递归创建 app data directory，不清理已有目录、不删除或重建数据库。
- 新增 local runtime composition，按 SQLite → HTTP 顺序启动，按 HTTP → SQLite 顺序关闭。
- HTTP startup 失败时关闭已经打开的 SQLite；database startup 失败时不会启动 HTTP listener；runtime `close()` 幂等。
- `main.ts` 解析 production port、解析 production data path、创建目录并启动 composed runtime；`SIGINT` / `SIGTERM` 触发 clean close。
- startup 日志只报告 loopback listening URL 和 `Local database ready`，不输出数据库绝对路径、home directory、username 或环境内容。
- `src/local-service/server.ts`、extension、schema version 1 和现有 observation API 保持不变。

## TDD 与 developer verification

| 命令 | 结果 |
| --- | --- |
| `npm test -- tests/production-data-path.test.ts tests/local-runtime.test.ts` | RED：两个模块尚不存在时按预期失败；GREEN：2 files、13 tests 全部通过 |
| `npm test -- tests/local-startup-error.test.ts` | RED：startup error formatter 尚不存在时按预期失败；GREEN：1 file、2 tests 全部通过 |
| `npm test -- tests/local-service-config.test.ts tests/local-service-server.test.ts tests/local-database.test.ts tests/local-database-initialization-failure.test.ts tests/database-migrations.test.ts` | 成功；5 files、29 tests 全部通过 |
| `npm run typecheck` | 成功；exit 0 |
| `npm run build:local` | 成功；exit 0 |
| `npm run lint` | 成功；exit 0 |
| `git diff --check` | 成功；exit 0（仅有 Git 的 LF/CRLF working-copy 提示，无 whitespace error） |

Repair targeted developer verification：

| 命令 | 结果 |
| --- | --- |
| `npm test -- tests/production-data-path.test.ts` | RED：旧实现按预期出现 8 个失败；GREEN：16 passed，当前 Windows developer host 上 2 个 POSIX-only mode tests skipped |
| `npm run typecheck` | 成功；exit 0 |
| `npm run lint` | 成功；exit 0 |
| `npm run build:local` | 成功；exit 0 |
| `git diff --check` | 成功；exit 0（仅有 Git 的 LF/CRLF working-copy 提示，无 whitespace error） |

Final Windows path hardening targeted developer verification：

| 命令 | 结果 |
| --- | --- |
| `npm test -- tests/production-data-path.test.ts` | RED：旧 validator 对新增 matrix 按预期出现 16 个失败；GREEN：45 passed，当前 Windows developer host 上 2 个既有 POSIX-only mode tests skipped |
| `npm run typecheck` | 成功；exit 0 |
| `npm run lint` | 成功；exit 0 |
| `npm run build:local` | 成功；exit 0 |
| `git diff --check` | 成功；exit 0（仅有 Git 的 LF/CRLF working-copy 提示，无 whitespace error） |

所有新增 runtime tests 使用 OS temp directory 和 ephemeral/released loopback port，结束时关闭 listener、关闭 SQLite 并递归清理 SQLite 文件、sidecars 和临时目录。未运行 `npm run start:local`，没有触碰开发者真实 production app-data directory。

## 边界与外部审阅

- Production data path：`IMPLEMENTED`
- Database filename：`boss-job-radar.sqlite3`
- Schema version：`1`
- HTTP health contract：`UNCHANGED`
- HTTP ingestion：`NOT IMPLEMENTED`
- Extension bridge：`NOT IMPLEMENTED`
- Host permissions：`NOT ADDED`
- Job dedupe：`NOT IMPLEMENTED`
- Phase 4：`IN PROGRESS / NOT YET PASSED`
- Phase 4 / Batch 1：`repair_complete_awaiting_external_re_review`
- External review：`PENDING`

本日志中的 developer verification 只属于 Codex 实现证据，不等于外部 acceptance，也不宣布本批 `PASS`。
