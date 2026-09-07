# ADR-0016：OpenAI Structured LLM Provider Transport v1

- 状态：Phase 6 / Batch 2 已实现并通过外部验收
- 日期：2026-09-07
- 对应能力：Capability 12 — structured LLM analysis
- 前置：Phase 6 / Batch 1 provider-neutral foundation 已通过外部验收

## 背景

Batch 1 已完成 provider-neutral 输入快照、prompt-injection boundary、strict output validation、source-state、schema v8 与 append-only repository。本批只增加第一个真实 provider transport：OpenAI Responses API。

本批仍不把 provider 接到 import、runtime startup、browser popup 或 localhost HTTP endpoint，也不要求用户提供真实 API key。目标是把远程协议、Structured Outputs、timeout、错误收敛、密钥边界和费用边界做成可独立测试的产品模块。真正的本地配置、显式用户触发链路和代表性脱敏真实模型评测放到下一批。

## 当前外部依据

2026-09-07 外部设计检查基于 OpenAI 官方文档：

- 当前推荐文本生成接口为 Responses API；
- API key 应由服务端环境/安全配置加载，不能暴露到浏览器客户端；
- Responses 支持 `text.format.type = json_schema` 的 Structured Outputs，并可启用 `strict`；
- 当前 GPT-5.6 系列包含 `gpt-5.6-luna`、`gpt-5.6-terra`、`gpt-5.6-sol`，其中官方把 Terra 定位为智能与成本平衡型号；
- Responses API 存在服务端数据保留语义，因此本产品请求必须显式 `store: false`，并且不使用 conversation / previous response / background 模式。

价格和具体默认模型属于可变运营信息，不写入持久化语义版本；模型 ID 本身会继续通过现有 provider/model identity 进入历史记录。

## Provider

新增产品模块，建议：

`src/domain/llm/openai-structured-llm-provider.ts`

实现现有：

`StructuredLlmProvider`

固定：

- `providerId = 'openai'`
- `modelId` 来自显式构造配置

本批允许的 modelId：

- `gpt-5.6-luna`
- `gpt-5.6-terra`
- `gpt-5.6-sol`

构造 provider 时必须显式给出 modelId；本批不在代码里静默选择模型，也不从环境变量自动读取模型。

## API key 边界

provider 构造配置显式接收 `apiKey`，但：

- 不保存到 SQLite；
- 不写文件；
- 不放进 providerId / modelId / source-state；
- 不放进错误字符串；
- 不 `console.log` / `console.warn`；
- 不返回给调用方；
- 不进入 prompt；
- 不进入 request body；
- 只用于 HTTPS `Authorization: Bearer ...` header。

真正从产品专用本地安全配置加载 key 的 wiring 属于下一批。本批只是 transport constructor boundary。

## Transport

固定 endpoint：

`https://api.openai.com/v1/responses`

建议直接使用 Node 22 已有 `fetch`，不增加 OpenAI SDK 或第三方 dependency。

为了可测试性，provider factory 可以允许注入一个与 `fetch` 等价的 transport function；生产默认使用 `globalThis.fetch`。注入能力不能允许改变生产 endpoint。

请求必须：

- method `POST`
- `Authorization: Bearer <apiKey>`
- `Content-Type: application/json`
- model = configured modelId
- `store: false`
- `background: false`
- `stream: false`
- 不带 tools
- 不带 web search / file search / code interpreter / MCP
- 不带 `previous_response_id`
- 不带 conversation
- 不带 user/account tracking metadata
- reasoning effort 固定为 `low`
- `max_output_tokens` 使用固定有界值 `4000`

provider-neutral request 中的：

- `systemPrompt`
- `userPrompt`

映射为 Responses input 中独立的 system / user text message，不重新拼成一个不分边界的自由文本。

## Structured Outputs

请求使用：

`text.format.type = 'json_schema'`

并启用：

`strict: true`

新增静态、稳定、无 unknown-key 的 JSON Schema，与当前：

`structured-llm-job-analysis-v1`

结构一致。

Schema 只负责 provider 侧结构约束；最终可信边界仍然是 Batch 1 的：

`parseStructuredLlmAnalysisOutput(output, snapshot)`

因此 provider transport 不得删掉或绕过产品层的 evidence grounding / source validation。

如果 OpenAI Structured Outputs 对某个 JSON Schema 关键结构不支持，必须 fail closed；不得自动降级成不受约束的普通文本并冒充成功。任何需要调整产品 output schema 的方案必须由外部 ChatGPT 另行批准并升级语义版本。

## Response parsing

provider 必须把 OpenAI HTTP response 视为不可信外部数据。

只有同时满足以下条件才能返回：

- HTTP 2xx；
- response status 明确为 completed；
- 没有 refusal；
- 没有 failed / incomplete 状态；
- 存在且仅存在可接受的 assistant `output_text` structured payload；
- output text 是可解析 JSON。

provider 返回 `unknown` JSON value 给现有 repository；不要在 provider 内把它强转成可信 `StructuredLlmAnalysisOutput`。

不要依赖 SDK-only `response.output_text` convenience property；直接严格读取 REST response `output` / message content。

## Timeout / retry / cost

v1 固定 timeout：`45_000 ms`。

使用 `AbortController` 或等价机制。

本批：

- **0 retries**；
- 不 fallback 到另一个 model；
- 不 fallback 到另一个 provider；
- 不自动重发 429 / 5xx；
- 不 background；
- 不 streaming；
- 不 batch。

原因：每次远程请求都可能产生费用，自动 retry 会让用户难以判断实际调用次数。

任何 timeout、网络错误、非 2xx、invalid REST shape、refusal、failed、incomplete、invalid JSON 都固定转换为：

`Structured LLM provider failed`

不得暴露 response body、request id、API key、prompt、JD、stack 或上游原始错误。

## Privacy

本批 transport 只能发送 Batch 1 已经构造好的 provider-neutral request。不要重新读取 JobObservation、数据库或浏览器状态，因此 provider 不可能自行扩大输入范围。

尤其禁止发送：

- companyName；
- jobUrl / sourcePageUrl；
- rawText；
- Cookie / Session；
- BOSS 账号信息；
- 用户聊天历史；
- local database path；
- API key 到 body/prompt。

完整 JD 会按批准的 Phase 6 设计发送给远程模型；这是 Capability 12 的核心语义输入。

## 禁止自动 wiring

Batch 2 不修改以下路径去调用 OpenAI：

- import repository；
- observation append；
- manual link check；
- status / opportunity refresh；
- database open；
- local runtime startup；
- popup；
- background script。

不新增：

- localhost LLM endpoint；
- API key UI；
- model selector UI；
- analyze-all；
- queue；
- scheduler。

只有显式构造 provider 并调用已有 `structuredLlmAnalyses.analyzeJob(...)` 的代码才能触发 transport。

## 非目标

本批不做：

- 用户真实 API key 配置；
- `.env` 文件生成或提交；
- secret persistence；
- 真实 API 调用验收；
- localhost HTTP trigger；
- browser button；
- local review UI；
- Capability 13；
- provider fallback；
- Anthropic / Gemini / Ollama；
- embeddings / RAG；
- 自动投递 / 自动聊天；
- BOSS 私有 API / Cookie / Session / CAPTCHA bypass。

## 外部验收

Codex 仍只写产品代码，不写或运行测试。

外部网页版 ChatGPT 使用 fake fetch / fake HTTP responses 独立覆盖：

- exact endpoint / method / headers；
- key 仅存在于 Authorization header；
- request body 不泄露 key；
- system/user prompt 分离；
- model allowlist；
- `store:false` / no background / no tools / no conversation；
- json_schema strict request；
- output token / reasoning 边界；
- successful REST response → unknown parsed JSON；
- refusal / incomplete / failed / malformed / non-2xx / invalid JSON；
- timeout / AbortController；
- zero retry；
- fixed generic errors；
- full existing CI regression。

最终外部验收记录：

`docs/verification/2026-09-07-phase-6-batch-2-external-verification.md`

Batch 2 结论：`PASS`。

这只代表 OpenAI transport 的代码 contract 已验证；Capability 12 仍保持 `IN_PROGRESS`。下一批批准本地 key/model 配置与显式 localhost 触发链路；浏览器显式用户动作和代表性真实模型评测继续放在后续批次。