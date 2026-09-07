# ADR-0017：Explicit Structured LLM Trigger + Local OpenAI Config v1

- 状态：Phase 6 / Batch 3 设计已批准，等待 Codex 实现
- 日期：2026-09-07
- 对应能力：Capability 12 — structured LLM analysis
- 前置：Phase 6 / Batch 1 provider-neutral foundation、Batch 2 OpenAI Responses transport 均已通过外部验收

## 背景

Batch 1 已验证 structured LLM 的输入、prompt、严格输出校验、grounding、source-state 与持久化；Batch 2 已验证 OpenAI Responses transport，但仍没有任何生产配置或触发路径，因此正常运行本地服务不会读取 API key，也不会发生远程模型调用。

Batch 3 的目标是建立**本机受控配置 + 显式 localhost trigger**。只有用户自己配置 OpenAI secret/model，并且未来由受保护的扩展动作明确发起一次分析请求时，才允许调用 provider。Batch 3 本身仍不增加 popup 按钮，也不执行真实 OpenAI 请求。

## 核心原则

1. 默认关闭：没有 LLM 配置时，本地服务继续正常启动，现有所有功能不受影响。
2. 双变量显式 opt-in：只有 key 与 model 同时存在且有效时，OpenAI provider 才被构造。
3. 绝不自动调用：startup、database open、import、link check、status/opportunity refresh 都不得触发 provider。
4. 触发 endpoint 必须复用现有 localhost bridge 的 Host / extension Origin / session token / JSON content type / content encoding / body limit 安全边界。
5. endpoint 请求只携带 canonical BOSS job URL，不接受 prompt、JD、API key、provider endpoint 或自由模型参数。
6. provider 错误、invalid output、source race 等对 HTTP 客户端统一收敛，不泄露 prompt、JD、API key 或上游 response。
7. 本批不新增浏览器 UI；真实远程请求和费用必须留到用户明确同意的后续验收批次。

## 本地配置

新增产品专用环境变量：

- `BOSS_JOB_RADAR_OPENAI_API_KEY`
- `BOSS_JOB_RADAR_OPENAI_MODEL`

不用通用 `OPENAI_API_KEY` 自动拾取，避免用户机器上已有其他项目 secret 时意外启用本产品远程调用。

配置规则：

- 两者都 `undefined`：LLM feature disabled；本地服务正常启动；
- 两者都存在且有效：构造 Batch 2 的 OpenAI provider；
- 只存在其中一个：启动 fail closed；
- key 为空白或含控制字符：启动 fail closed；
- model 不在 Batch 2 的批准 allowlist：启动 fail closed。

固定配置错误：

`Invalid structured LLM runtime configuration`

错误不得包含 key、model 原始输入、路径、prompt 或其他环境变量值。

不读取 `.env` 文件，不提交 `.env.example`，不把 secret 写 SQLite / 文件 / log / error / source-state。

## Provider 构造时机

`src/local-service/main.ts` 可以读取上述两个专用环境变量并解析配置。只有完整有效配置时，构造：

`createOpenAiStructuredLlmProvider(...)`

然后把 provider 作为显式可选依赖传给 `startLocalRuntime(...)`。

`startLocalRuntime` 本身不得读取 `process.env`，保持可测试和 provider-neutral。

provider 的存在**不等于调用**。startup 只保存依赖，不允许执行 `generate()`。

## 显式分析请求

新增共享请求 contract，建议：

`src/shared/structured-llm-analysis-request.ts`

请求 exact shape：

```json
{
  "jobUrl": "https://www.zhipin.com/job_detail/..."
}
```

要求：

- object exact shape，无 unknown keys；
- `jobUrl` 必须已经是现有 canonical BOSS detail URL；
- 不接受 jobId 由浏览器随意指定；
- 不接受 model/provider/prompt/JD/apiKey/analyzedAt 等调用方参数。

使用 job URL 的原因：未来 popup 天然拥有当前页面 canonical URL；本地数据库负责映射到内部 Job ID，不把数据库内部身份暴露为浏览器输入 contract。

## Localhost endpoint

新增固定：

`POST /structured-llm-analyses`

它必须与现有 `/observations`、`/job-link-checks` 一样，经过：

- loopback Host 校验；
- extension Origin allowlist；
- `x-boss-job-radar-token` bridge session token；
- JSON content type；
- supported content encoding；
- 1 MiB body limit；
- JSON decode；
- exact request validation。

不得新增公网/局域网 listener，也不得放宽 `/bridge/session` 或现有 endpoint 的安全规则。

## Runtime writer

server 不直接访问 SQLite 或 OpenAI provider。新增一个窄接口，例如：

```ts
interface StructuredLlmAnalysisWriter {
  analyzeJobUrl(jobUrl: string): Promise<
    | { status: 'created'; id: number }
    | { status: 'job_not_found' }
    | { status: 'analysis_unavailable' }
  >;
}
```

具体命名可调整，但职责必须保持：

1. 用 `database.jobs.findByJobUrl(jobUrl)` 查内部 Job；
2. 找不到 → `job_not_found`，不调用 provider；
3. 找到后调用现有 `database.structuredLlmAnalyses.analyzeJob(job.id, provider)`；
4. repository 返回 `null`（例如没有完整 JD）→ `analysis_unavailable`，不伪造成功；
5. 成功只向 server 返回 persisted analysis `id`，不要把完整分析/prompt/JD作为本批 HTTP response 扩散；
6. repository/provider 抛错 → 交给 server 统一错误收敛。

如果 runtime 未配置 provider，则不构造可调用 writer。

## HTTP response contract

建议固定：

- provider 未配置：`503 { "error": "analysis_not_configured" }`
- invalid request：`400 { "error": "invalid_request" }`
- Job 不存在：`404 { "error": "job_not_found" }`
- Job 存在但当前没有可分析完整 JD：`422 { "error": "analysis_unavailable" }`
- success：`200 { "id": <positive integer> }`
- provider / invalid output / source race / persistence failure：`502 { "error": "analysis_failed" }`

不要把底层 `Structured LLM provider failed`、OpenAI body、HTTP status text、request id、prompt、JD 或 key返回给客户端。

same provider/model/source state 已有的 repository idempotency 继续生效；再次显式触发相同状态可以返回同一个 persisted id，但不得因此绕过 bridge security。

## 费用边界

Batch 3 必须保持：

- startup：0 calls；
- database open：0 calls；
- import：0 calls；
- link check：0 calls；
- status/opportunity refresh：0 calls；
- health/session：0 calls；
- 只有通过受保护 `POST /structured-llm-analyses` 明确请求时才允许 0 或 1 次 provider call。

如果 Job 不存在、缺完整 JD、已有 same-state analysis，则应由现有 repository 逻辑避免不必要 provider call。

## Secret / logging

`main.ts` 的 startup error sanitization 必须继续保护敏感信息。OpenAI key 应加入本轮敏感值防泄露边界，但不能打印、hash、截断后打印或写入诊断。

成功启动日志不得显示：

- key；
- key 是否以某前缀开头；
- model 配置原始环境字符串之外的 secret 信息。

可以只输出非敏感 feature 状态，例如是否配置，但不是本批必需；默认优先不新增日志。

## 非目标

Batch 3 不做：

- popup analyze button；
- browser client 调用该 endpoint；
- Dashboard / review UI；
- API key 输入框；
- key 持久化；
- Windows Credential Manager / Keychain；
- `.env` loader；
- analyze-all / queue / scheduler；
- 自动 retry / fallback；
- 真实 OpenAI API smoke test；
- 代表性真实模型评测；
- Capability 13；
- BOSS 私有 API / Cookie / Session / CAPTCHA bypass。

## 外部验收

Codex 仍只写产品代码，不写或运行测试。

外部网页版 ChatGPT 将独立覆盖：

- config disabled / complete / partial / invalid secret / invalid model；
- key 不进入错误、日志、HTTP response 或数据库；
- runtime startup / database open / import 等 0 provider calls；
- protected endpoint 的 Host / Origin / token / content type / encoding / body-limit；
- exact canonical job URL request；
- provider not configured / job not found / missing JD / success / generic failure；
- same-state repeated explicit trigger idempotency；
- fake provider call count；
- provider failure / invalid output / source race HTTP error hygiene；
- complete existing regression suite。

Batch 3 即使通过，Capability 12 仍保持 `IN_PROGRESS`。后续还需要浏览器上的显式用户触发动作，以及用户明确同意后的代表性真实 OpenAI 模型评测，才能考虑整体验收。
