# ADR-0007：Production 本地数据路径与 runtime lifecycle

- 状态：Phase 4 / Batch 1 repair 完成，等待外部复审
- 日期：2026-09-03

## 背景

Phase 3 已分别建立 loopback-only HTTP service、SQLite migration/storage foundation 和 append-only observation persistence。此前 production `main.ts` 只启动 HTTP service，数据库只能由调用方显式传入路径后单独打开，尚未形成 production 数据位置和统一资源生命周期。

## 决策

- production SQLite 文件固定命名为 `boss-job-radar.sqlite3`，并放在用户级 OS data directory 下的 `boss-job-radar` 子目录。
- Windows 优先使用 `%LOCALAPPDATA%\boss-job-radar\boss-job-radar.sqlite3`；`LOCALAPPDATA` 不存在时使用 `<home>\AppData\Local\boss-job-radar\boss-job-radar.sqlite3`。`LOCALAPPDATA` 和 fallback home 都必须是包含明确 drive 或 UNC root 的 fully-qualified Windows path；rooted-without-drive、drive-relative、relative 和空路径均 fail closed。
- macOS 使用 `<home>/Library/Application Support/boss-job-radar/boss-job-radar.sqlite3`。
- Linux 在 `XDG_DATA_HOME` 存在且为 absolute path 时使用 `$XDG_DATA_HOME/boss-job-radar/boss-job-radar.sqlite3`，否则使用 `<home>/.local/share/boss-job-radar/boss-job-radar.sqlite3`。显式提供 relative `XDG_DATA_HOME` 时 fail closed。
- production 不提供任意数据库路径 override，不增加 `BOSS_JOB_RADAR_DB_PATH`、`--db`、`--database` 或 `--data-dir`。底层 `openLocalDatabase({ path })` 和内部 runtime 的显式 `databasePath` 保留用于组合和测试。
- production 启动时先确保 app data directory 存在，再打开 SQLite，最后启动固定绑定 `127.0.0.1` 的 HTTP service。
- macOS / Linux 创建最终 app data directory 时请求 `0700`，并对已存在的最终 app directory 执行 `chmod(0700)`；失败时 fail closed。Windows 不依赖 POSIX mode/chmod。父级用户目录不执行 chmod。
- SQLite 与 HTTP service 由统一 local runtime 管理。HTTP 启动失败时关闭已经打开的 SQLite；正常关闭时先停止 HTTP listener，再关闭 SQLite；重复关闭安全。
- schema version 仍为 `1`，不新增 migration 或数据库 API。

## 尚未实现

- HTTP ingestion 尚未实现。
- extension bridge 尚未实现，也未增加 host permissions。
- Job identity、dedupe、最终 Job aggregation 和 SearchRun 尚未实现。

## 结果

production `main.ts` 不再把数据库和 HTTP listener 作为彼此独立的资源启动。数据库绝对路径、home directory、username 和相关环境变量不会写入 startup 日志；`GET /health` contract 保持不变。
