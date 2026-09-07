# ADR-0018：Popup Explicit Structured LLM Analysis Trigger v1

- 状态：Phase 6 / Batch 4 设计已批准，等待 Codex 实现
- 日期：2026-09-07
- 对应能力：Capability 12 — structured LLM analysis
- 前置：Phase 6 / Batch 1–3 均已通过外部验收

## 背景

Phase 6 / Batch 1 已验证 provider-neutral structured LLM foundation；Batch 2 已验证 OpenAI Responses transport；Batch 3 已验证产品专用本地 OpenAI 配置和受保护的 `POST /structured-llm-analyses` localhost trigger。

目前生产链路仍没有浏览器端动作，因此用户正常打开 popup、保存岗位、检查链接或浏览 BOSS 页面时都不会触发 OpenAI 请求。Batch 4 的目标是补齐**浏览器 popup 中的明确用户触发动作**，把用户主动点击这一事件连接到 Batch 3 已验证的本地 endpoint。

本批仍不执行真实 OpenAI 请求，也不提供 API key 输入 UI、模型选择 UI 或完整分析结果展示页。真实 provider 评测必须等用户明确同意远程发送岗位内容和可能产生的 API 费用后另行执行。

## 核心原则

1. **只有明确点击才允许触发**：popup 打开、tab 分类、DOM extraction、保存、link check、startup 都不得自动调用 LLM。
2. **点击前清楚披露远程发送和费用边界**：UI 必须明确说明完整 JD 与批准的最小化岗位上下文会经本地服务发送到用户配置的 OpenAI 模型，并可能产生 API 费用。
3. **浏览器不持有 secret**：extension 不读取、不接收、不显示 API key；浏览器请求只携带 canonical `jobUrl` 给 localhost。
4. **fresh session per click**：每次用户独立点击都重新获取 protocol 2 bridge session token。
5. **zero automatic retry**：分析 POST 的未知网络结果绝不自动重放，避免在不确定状态下产生第二次潜在付费调用。
6. **当前 tab fail closed**：点击时重新读取 active tab 并重新验证 canonical BOSS detail URL，不能使用 popup 初始化时缓存的旧 URL。
7. **同一 popup 内防并发**：一次分析在途时 button disabled，重复 click 不产生第二个 request。
8. **不把完整分析扩散到 popup**：本批 endpoint 仍只返回 id；popup 只显示结果状态，不显示/复制 structured LLM 内容。完整审核 UI 属于后续能力。

## 浏览器 Local Service Client

在现有：

`src/bridge/local-service-client.ts`

增加独立的 structured LLM analysis client，例如：

`requestStructuredLlmAnalysisFromLocalService(...)`

具体命名可调整，但 contract 必须保持窄。

输入使用现有：

`StructuredLlmAnalysisRequest`

也就是 exact：

```json
{
  "jobUrl": "https://www.zhipin.com/job_detail/...html"
}
```

client 在任何网络请求前必须调用现有：

`validateStructuredLlmAnalysisRequest(...)`

非法输入直接本地失败，不进行 session handshake。

## Fresh Bridge Session

每一次独立用户 click：

1. `GET /bridge/session`
2. 要求 HTTP 200；
3. response Content-Type 必须是 application/json；
4. exact `{ protocolVersion, token }`；
5. `protocolVersion === 2`；
6. token 必须满足现有 64 lowercase hex contract；
7. 然后才允许一次分析 POST。

不得跨 click 缓存 token。

不得从 localStorage / browser storage 恢复 token。

## Analysis POST

固定：

`POST http://127.0.0.1:32123/structured-llm-analyses`

使用：

- `Content-Type: application/json`
- `X-Boss-Job-Radar-Token: <fresh token>`
- `redirect: error`
- `credentials: omit`
- body = exact validated `{jobUrl}`

浏览器不得发送：

- API key；
- provider/model；
- prompt；
- full JD；
- jobId；
- Cookie / Session；
- arbitrary metadata。

完整 JD 由 localhost 从已保存数据库中按现有 repository contract 读取，extension 不重新提取 JD 作为 LLM request body。

## Timeout

现有 ordinary localhost save/link client 的短 timeout 不适合远程模型分析，因为 OpenAI provider 自身已有 45 秒 timeout。

Batch 4 为分析 POST 使用独立有界 timeout：

`50_000 ms`

或语义等价的固定值，不得短于 provider 的 45 秒 timeout。

Session handshake 仍可沿用现有短 localhost timeout。

分析 POST timeout 必须覆盖 response body consumption。

## Zero Retry / Cost Boundary

structured LLM analysis POST：

**0 automatic retries**。

包括：

- network reset；
- timeout；
- response body stream failure；
- 408 / 429 / 5xx；
- malformed success response。

原因：分析请求可能对应真实付费 provider call。浏览器不能在结果未知时自动重放。

如果用户之后再次**手动点击**，这是新的显式用户动作；same provider/model/source-state 已有的 repository idempotency 会在已成功持久化时避免新的 provider 调用。

## Client Success Contract

只有：

- HTTP 200；
- application/json；
- exact `{ id }`；
- `id` 是 positive safe integer；

才能返回成功。

UI 不需要显示数据库 id，只需显示“分析已完成并保存到本地”。

## Client Failure Mapping

建议稳定结果 code：

- `unavailable`
- `incompatible_version`
- `invalid_request`
- `invalid_session`
- `job_not_found`
- `analysis_unavailable`
- `analysis_not_configured`
- `analysis_failed`
- `payload_too_large`
- `invalid_response`

HTTP 映射：

- 400 → `invalid_request`
- 403 → `invalid_session`
- 404 → `job_not_found`
- 413 → `payload_too_large`
- 422 → `analysis_unavailable`
- 502 → `analysis_failed`
- 503 → `analysis_not_configured`
- 其他非 200 → `invalid_response`

对于 non-200 response，client 不需要读取/反射 server error body；使用本地固定消息。

建议用户消息：

- unavailable：`本地服务未启动或无法连接。`
- incompatible_version：`本地服务版本与扩展不兼容。`
- invalid_request：`当前岗位无法发起 AI 分析。`
- invalid_session：`本地服务会话无效，请重新点击分析。`
- job_not_found：`请先把当前岗位保存到本地，再进行 AI 分析。`
- analysis_unavailable：`当前岗位缺少可分析的完整 JD，请重新保存岗位详情后再试。`
- analysis_not_configured：`本地 AI 分析尚未配置。`
- analysis_failed：`AI 分析失败，未保存新的分析结果。`
- payload_too_large：`AI 分析请求数据过大。`
- invalid_response：`本地服务返回了无法识别的 AI 分析响应。`

不要显示 raw provider/server error。

## Popup UI

在：

`entrypoints/popup/index.html`

新增独立 section，例如：

- heading：`AI 岗位分析`
- button：`发送到 OpenAI 并分析当前岗位`
- aria-live status area

section 只在当前 active tab URL 是现有 canonical checkable BOSS detail URL 时显示。

### 必须可见的披露

在 button 邻近位置明确说明：

- 点击后才会触发；
- 本地服务会从已保存岗位读取完整 JD 和批准的最小化岗位上下文；
- 这些内容会发送到用户自己配置的 OpenAI 模型；
- 可能产生 OpenAI API 费用；
- 产品不会主动把 companyName、jobUrl、整页 rawText、Cookie 或 Session 放进 provider 输入；
- 当前岗位必须已经保存到本地。

不要使用模糊的“AI 优化”按钮让用户无法知道会产生远程请求。

## Popup Controller

新增一个职责单一的 controller，例如：

`entrypoints/popup/structured-llm-analysis-controller.ts`

初始化依赖建议仅包括：

- `getActiveTab()`
- `analyze(request)`

初始化阶段：

- 只读取 active tab metadata；
- 只根据 URL 判断 action hidden/disabled；
- **不发 localhost request**；
- **不执行 DOM script**；
- **不调用 provider**。

### Click flow

1. 若已有 request in-flight，直接忽略重复 click；
2. 设置 in-flight + disabled；
3. status 显示正在分析；
4. **重新调用 `getActiveTab()`**；
5. 用 `canonicalCheckableJobUrl(tab.url)` 重新验证；
6. 必须满足 canonical result 与当前 tab URL 一致；
7. 构造 exact `{jobUrl}`；
8. 调用 structured LLM local client 一次；
9. success → 显示固定成功消息；
10. failure → 只显示 client 固定本地消息；
11. finally 清除 in-flight；
12. **finally 再重新读取 active tab 后决定 button/action 状态**；如果读取失败，fail closed 隐藏/disable。

不要用分析开始前缓存的旧 tab 在 finally 重新 enable button，避免 tab 已切换时 stale fail-open。

## Long-running Request UX

分析可能持续数十秒。

在 in-flight 期间：

- button disabled；
- status 使用 `aria-live="polite"`；
- popup 不发第二个分析 request；
- 不启动 polling；
- 不 background retry。

如果用户主动关闭 popup，浏览器行为不需要本批额外实现后台队列或恢复机制。

## Main Wiring

在：

`entrypoints/popup/main.ts`

初始化新 controller。

只传：

- 现有 `getActiveTab`；
- 新 local-service analysis client。

不要给 controller：

- API key；
- model；
- database；
- full JD；
- DOM extraction function。

## 不修改 Batch 3 Server Contract

原则上 Batch 4 不需要修改：

- `src/local-service/server.ts`
- `src/local-service/runtime.ts`
- `src/local-service/main.ts`
- structured LLM repository
- OpenAI provider

Batch 3 endpoint 已足够。

如果实现过程中发现必须改变 HTTP contract，应停止并交回外部 ChatGPT，不得自行扩张 server response 或 secret boundary。

## 结果展示边界

本批成功只显示：

`AI 分析已完成并保存到本地。`

不要：

- 把完整分析 JSON 放进 popup；
- 新增 GET analysis endpoint；
- 读取 SQLite；
- 复制分析到 clipboard；
- 开始 Dashboard。

后续本地审核 UI 会负责完整结果呈现。

## 非目标

Batch 4 不做：

- API key 输入框；
- model selector；
- secret storage；
- `.env` loader；
- localhost server contract 重设计；
- 自动分析当前页；
- save 后自动分析；
- link check 后自动分析；
- popup open 自动分析；
- analyze-all；
- queue / scheduler；
- retry / fallback；
- 真实 OpenAI smoke test；
- 完整 LLM result UI；
- Capability 13 review dashboard；
- 自动投递 / 自动聊天；
- BOSS private API / Cookie / Session / CAPTCHA bypass。

## 外部验收计划

Codex 仍只写产品代码，不写或运行测试。

外部网页版 ChatGPT 将独立覆盖：

- client 在网络前验证 exact canonical request；
- fresh session per click；
- protocol 2 / token strict validation；
- fixed localhost endpoint；
- request body 只有 jobUrl；
- browser 不接触 API key/model/full JD；
- analysis POST 50s bounded timeout；
- zero automatic retry；
- 200 exact id validation；
- 400/403/404/413/422/502/503 mapping；
- error body 不反射；
- popup 初始化 0 network / 0 DOM injection；
- action visibility by canonical active tab；
- click 重新读取 tab；
- in-flight duplicate click prevention；
- finally fresh-tab fail-closed restore；
- transparent remote-data/cost disclosure presence；
- success/failure message mapping；
- existing save/link/popup regression；
- typecheck/lint/Chrome/Edge/local build/manifests。

Batch 4 不使用真实 API key，不访问 OpenAI，因此不会产生真实模型费用。

## Capability 状态

Batch 4 即使外部验收 PASS，Capability 12 仍保持 `IN_PROGRESS`。

之后至少还需要：

- 用户明确同意远程发送岗位内容与 API 成本；
- 代表性真实 OpenAI 调用；
- 对真实 structured output / grounding / failure 的人工评测；

才能考虑把 Capability 12 升级为 `VERIFIED`。
