# ADR-0005：本地 loopback HTTP 服务基线

- 状态：Phase 3 / Batch 1 已批准，等待外部实现审阅
- 日期：2026-09-03

## 背景

Phase 2 已通过外部验收。Phase 3 需要先建立最小且可测试的本地服务运行时边界，再在后续独立批次中考虑持久化和扩展桥接，避免提前混合网络、数据和浏览器权限边界。

## 决策

- 使用 Node.js >= 22、TypeScript 和 Node 内置 `node:http` 建立本地服务基线，不引入 HTTP framework。
- 服务固定绑定 IPv4 loopback `127.0.0.1`；host 是程序内部常量，不接受 CLI、环境变量或 service start API 配置。
- production port 默认为 `32123`，只允许通过 `BOSS_JOB_RADAR_LOCAL_PORT` 配置 `1` 到 `65535` 的十进制整数；测试内部 API 可以使用 `0` 获取 ephemeral port。
- 当前只提供 `GET /health`，没有 permissive CORS bridge。
- 当前没有 ingestion、SQLite、局域网或公网服务。

## 结果

本批只形成 loopback-only HTTP runtime contract。数据持久化和浏览器扩展桥接必须分别等待后续独立 batch/phase 批准；本 ADR 不把这些尚未实现的能力写成已完成。
