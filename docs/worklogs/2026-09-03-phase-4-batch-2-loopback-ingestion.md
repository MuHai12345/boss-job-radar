# Phase 4 / Batch 2 Secure Loopback Observation Ingestion 工作日志

## 范围与接手状态

- 分支：`master`
- 基准 commit：`b6b50f8c51d05bad8cc328f210ffa5d5fb375187`
- 接手时本地 HEAD 与 `origin/master`：均与基准 commit 一致
- 接手时工作区：干净
- Phase 4 / Batch 1：`PASS`（来自本轮 Prompt 的外部正式验收状态）
- Phase 4 / Batch 2：`implementation_complete_awaiting_external_review`
- Phase 4：`IN PROGRESS / NOT YET PASSED`

本轮只实现 local service 服务端的受保护 observation ingestion protocol、transactional batch append、targeted tests 和对应文档。没有修改 extension、WXT config、entrypoints 或 popup；没有增加 host permissions、CORS allowlist、Job identity、dedupe、AI 或 Dashboard。

## 完成内容

- 每个 local service instance 使用 Node `crypto.randomBytes(32)` 生成独立的 64-char lowercase hex ephemeral token；token 只保存在 process memory。
- 新增 `GET /bridge/session`，返回 protocol version 1 和当前 token，设置 JSON content type 与 `Cache-Control: no-store`。
- `/bridge/session` 与 `/observations` 严格要求 Host 等于当前 listener 的 `127.0.0.1:<actual-port>`，不读取 forwarded host headers。
- `POST /observations` 在 Origin 存在时只接受无额外 path/query/fragment 且 hostname 非空的 `chrome-extension://` origin；缺失 Origin 允许。
- 写请求使用 `X-Boss-Job-Radar-Token` 和 `crypto.timingSafeEqual` 验证当前 token；长度不同时先安全分支处理。
- 写请求只接受 `application/json` 或带 `charset=utf-8` 的等价形式，只接受 identity Content-Encoding；form、text 和 compressed body 均拒绝。
- body reader 以实际接收 bytes 执行严格 1 MiB 上限，并对明确超限的 Content-Length 提前拒绝；oversized body 不做 JSON parsing 或数据库写入。
- 新增小型 TypeScript runtime validator：顶层只允许 `observations`，batch 限制 1–100 条，每条严格验证现有 storage-facing `JobObservationInput` 的全部字段、nullable string、pageType 和 string arrays，且不修改事实值。
- `JobObservationRepository` 新增 transactional `appendMany`，保持 input order；重复 observation 继续得到不同 IDs，任何 insert 失败均整批 rollback。
- production local runtime 只把 `database.observations` 这一有限 repository capability 注入 HTTP service；shutdown 顺序保持 HTTP listener → SQLite。
- JSON 错误响应稳定且不回显 token、payload、SQL、stack 或 database path；所有响应均不增加 permissive CORS headers。
- `GET /health` body、status 与 content type contract 保持不变；schema version 保持 `1`。

## TDD 与 developer verification

| 命令 | 结果 |
| --- | --- |
| `npm test -- tests/observation-ingestion.test.ts tests/observation-repository.test.ts` | RED：40 个新增断言按预期失败；session route 为 404，repository 尚无 `appendMany` |
| 同一 targeted command（实现后） | GREEN：2 files、55 tests 通过；随后补齐 missing Content-Type 与 session wrong Host 覆盖 |
| `npm run typecheck` | 首轮准确发现旧 service tests 尚未注入新的窄 dependency；更新装配后成功 |
| `npm test -- tests/observation-ingestion.test.ts tests/observation-repository.test.ts tests/local-service-server.test.ts tests/local-runtime.test.ts` | 成功：4 files、69 tests 通过 |
| `npm run lint` | 成功；exit 0 |
| `npm run build:local` | 成功；exit 0 |

缺失 Host 的 targeted test 在 Node HTTP/1.1 parser 层得到 `400`，请求不会进入应用路由；这满足 Host 缺失必须拒绝的协议要求。错误 Host 在应用层得到 `403`。

没有运行 broad `npm test`、Chrome build、Edge build 或旧 DOM/parser tests。外部网页版 ChatGPT 仍负责 independent acceptance/security testing 和最终验收结论。

## 边界与外部审阅

- HTTP ingestion：`IMPLEMENTED — LOCAL SERVICE ONLY`
- Extension bridge：`NOT IMPLEMENTED`
- Host permissions：`NOT ADDED`
- Job dedupe：`NOT IMPLEMENTED`
- Schema version：`1 UNCHANGED`
- Known issues：无已知实现问题
- Phase 4 / Batch 2：`implementation_complete_awaiting_external_review`
- External review：`PENDING`

本日志中的 developer verification 只属于 Codex 实现证据，不等于 external acceptance，也不宣布本批 `PASS`。
