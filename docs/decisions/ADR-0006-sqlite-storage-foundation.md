# ADR-0006：SQLite 存储基础与迁移

- 状态：Phase 3 / Batch 2 已批准，等待外部实现审阅
- 日期：2026-09-03

## 背景

Phase 3 / Batch 1 已建立固定绑定 `127.0.0.1` 的最小本地服务。Batch 2 在不接入 HTTP ingestion 或浏览器扩展的前提下，建立本机持久化基础，并把页面解析事实与后续岗位身份、去重和聚合决策分开。

## 决策

- Phase 3 使用本机 SQLite，运行时依赖固定为 `better-sqlite3` `13.0.3`。
- 使用项目内小型、显式的 TypeScript migration runner，不引入 ORM 或 migration framework。
- Batch 2 只建立 migration 基础和 append-only `job_observations` schema；同一 `job_url` 可以保留多条 observation。
- 不创建最终 `Job` 聚合表，不定义 Job identity、dedupe key 或岗位唯一约束。
- 不实现 HTTP ingestion，也不连接浏览器扩展。
- 本批不确定 production 数据库路径，不修改 `main.ts` 自动打开数据库。
- 后续 persistence API、production path policy 和 local-service integration 必须分别获得批准。

## 结果

数据库只有在调用方显式提供 path 并调用打开 API 时才会创建或连接；现有 `npm run start:local` 仍只启动 `GET /health` 服务。当前 schema 是原始事实观察的存储基础，不代表岗位身份、去重、导入或聚合能力已经实现。
