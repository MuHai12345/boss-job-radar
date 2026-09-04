# ADR-0008：Loopback observation ingestion 安全协议

- 状态：Phase 4 / Batch 2 已通过外部验收
- 日期：2026-09-03

## 背景

Phase 4 / Batch 1 已把 production SQLite 和固定绑定 `127.0.0.1` 的 HTTP listener 组成统一 runtime。loopback 绑定只限制网络可达范围，不能阻止普通网页尝试向 localhost 发起请求，也不能单独抵御 DNS rebinding、form POST、`no-cors` POST、无界 body 或未授权写入。因此，开放 observation 写接口必须建立多层、明确且互不替代的安全边界。

## 决策

- local service 每次启动使用 Node `crypto` CSPRNG 生成一个新的 32-byte、64-char lowercase hex ephemeral token。token 只保存在当前进程内存，不接受配置，不持久化，也不写日志。
- `GET /bridge/session` 只在请求 Host 精确等于当前 listener 的 `127.0.0.1:<actual-port>` 时返回 protocol version 1 和当前 token，并设置 `Cache-Control: no-store`。
- `/bridge/session` 与 `/observations` 都严格验证实际 Host，不接受 `localhost`、IPv6 loopback、LAN address、任意域名或缺失 Host，也不信任 `Forwarded` / `X-Forwarded-Host`。
- `POST /observations` 在 Origin 存在时只接受具有非空 hostname 且无额外 path/query/fragment 的 `chrome-extension://` Origin；缺失 Origin 允许用于 targeted Node tests 和未来本地客户端。不新增 web-origin allowlist。
- 写接口必须提供匹配当前 ephemeral token 的 `X-Boss-Job-Radar-Token`，并使用 constant-time comparison；token 不出现在响应、错误或日志中。
- 写接口只接受 `application/json`，可带 `charset=utf-8`；只接受 identity content encoding。`text/plain`、form、multipart 和压缩 body 均拒绝。
- request body 对实际接收 bytes 执行严格 1 MiB 上限；明确超限的 `Content-Length` 可提前拒绝，chunked body 仍按实收 bytes 计数。超限 body 不进入 JSON parsing 或数据库。
- protocol version 1 body 顶层只允许 `{ observations: [...] }`。batch 必须包含 1 到 100 条 observation；每条都按现有 storage-facing `JobObservationInput` 做严格 runtime shape/type validation，不做 trim、canonicalize、dedupe、sort 或事实推断。
- 一个 HTTP batch 使用单一 SQLite transaction 按输入顺序执行 append-only INSERT，并只返回对应的新 observation IDs。任何 insert 失败都会 rollback，不保留 partial rows。
- 服务不返回 permissive CORS headers，不授权普通网页的 preflight。错误响应使用稳定通用结构，不返回 payload、SQL、数据库路径、stack 或 token。

## 明确未包含

- 本批不实现 extension → localhost bridge，不修改 extension，也不增加 host permissions。
- 本批不实现 structured extraction → `JobObservationInput` mapping。
- 本批不定义 Job identity，不做 dedupe、upsert、merge、update 或 delete。
- schema version 保持 `1`。

## 结果

local service 获得一个受限、append-only、transactional 的 observation ingestion protocol。该协议只完成服务端安全边界和存储装配；浏览器扩展尚未连接 localhost，Phase 4 仍为 `IN PROGRESS / NOT YET PASSED`。
