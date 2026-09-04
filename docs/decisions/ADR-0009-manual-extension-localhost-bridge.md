# ADR-0009：手动 extension → localhost 保存桥接

- 状态：Phase 4 / Batch 3 实现完成，等待外部审阅
- 日期：2026-09-03

## 背景

Phase 4 / Batch 2 已通过外部验收，本地服务具备受保护的 observation ingestion protocol，但扩展尚不能把用户当前页面的结构化结果保存到本机 SQLite。本批需要在不改变 verified parser contract、被动采集边界和 append-only 语义的前提下，形成一次明确用户点击驱动的完整保存路径。

## 决策

- 保留现有“解析当前岗位数据”动作；解析只显示结果，不连接 localhost。
- 新增独立“保存当前岗位数据到本地”动作。每次点击都重新查询活动标签页并重新执行 structured extraction，不复用 popup 中旧 JSON。
- injected script 仍只读取 DOM 并返回结构化结果；localhost `fetch` 只在 extension popup context 执行。
- extension host permission 精确限定为 `http://127.0.0.1:32123/*`，不增加其他 localhost、端口或全站权限。
- `JobObservationInput` 抽取到 browser 与 local service 都可 type-only import 的共享 DTO 模块；SQLite repository implementation 和 record 类型仍留在 Node 边界。
- 纯 mapping 按 extraction 原顺序生成 observation，保留重复、`null`、空字符串、原始文本与 warning 顺序，不做 trim、dedupe、URL 重写、薪资解码或事实推断。
- 每次保存先获取 protocol version 1 session 和严格 64 位小写 hex token，再 POST observations；token 只存在当前函数调用的局部变量中，不持久化、不输出。
- GET 与 POST 各自使用 5 秒 timeout 和独立 `AbortController`，不自动重试。
- 客户端严格验证 session 与成功 ID 响应，只向 UI 返回有限稳定结果；UI 不显示 token、ID、原始响应、stack、SQL 或数据库路径。
- 无可保存 observation 时在访问 localhost 前停止；`card_limit_reached` 只保存 extraction 已返回的最多 100 条。
- 保存使用独立 in-flight 状态，防止同一保存动作并发，不改变其他三个现有动作的状态边界。

## 明确未包含

- 不实现自动采集、后台浏览、滚动、翻页或自动打开详情。
- 不实现 Job identity、dedupe、upsert、merge、SearchRun、结构化分析或审核 UI。
- 不修改 verified selectors、DOM parsing、visible tag、salary、raw text、full JD 或 URL canonicalization contract。
- schema version 保持 `1`。

## 结果

扩展具备一次用户明确点击驱动的 current-page → structured observations → secured localhost ingestion → SQLite 保存路径。当前状态仅为实现完成、等待外部审阅；Phase 4 仍为 `IN PROGRESS / NOT YET PASSED`。
