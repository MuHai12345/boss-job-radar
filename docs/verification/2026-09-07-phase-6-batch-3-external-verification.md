# Phase 6 / Batch 3 外部验收记录

- 日期：2026-09-07
- 能力：Capability 12 — structured LLM analysis（explicit localhost trigger + local OpenAI config v1）
- Codex 产品实现 commit：`95ecbed47598378cb402a89757bf17d9e8327c64`
- 外部旧测试类型基线修正：`2a5fb50264faccf12bda2783d78ebb18784c82a8`
- 外部 Batch 3 专项测试初始 commit：`f437510da6c7fb75c240033d73c2d5ff94d850cd`
- 外部测试 harness 修正 / 最终测试 head：`ee82ee52c24763470cfdf6f2de9504e139989405`
- 最终 GitHub Actions run：`34137913888`
- 结论：`PASS`
- Capability 12 整体状态：`IN_PROGRESS`

## 代码审阅结论

外部网页版 ChatGPT 审阅了 Codex 的真实产品 commit `95ecbed47598378cb402a89757bf17d9e8327c64`。产品变更只位于批准范围：

- `src/domain/llm/openai-structured-llm-provider.ts`
- `src/local-service/structured-llm-runtime-config.ts`
- `src/shared/structured-llm-analysis-request.ts`
- `src/local-service/server.ts`
- `src/local-service/runtime.ts`
- `src/local-service/main.ts`

没有修改 tests、docs、CI、依赖、SQLite schema、structured LLM 持久化语义或 Capability 13 UI。

实现满足 ADR-0017 的关键 contract：

- 只使用产品专用 `BOSS_JOB_RADAR_OPENAI_API_KEY` 与 `BOSS_JOB_RADAR_OPENAI_MODEL`；
- 两者都不存在时 feature disabled，本地服务照常工作；
- partial config、空白/控制字符 secret、未批准 model fail closed；
- OpenAI model allowlist 继续限定为 `gpt-5.6-luna` / `gpt-5.6-terra` / `gpt-5.6-sol`；
- `main.ts` 是唯一 env 读取边界，并把 API key 纳入 startup error sensitive-values 脱敏；
- `startLocalRuntime` 只接收显式 optional provider，不自行读取 env；
- provider 存在不会触发 startup 远程调用；
- 新 request contract 只接受 exact `{ jobUrl }`，且 URL 必须已经是 canonical `https://www.zhipin.com/job_detail/...html`；
- 新增固定 `POST /structured-llm-analyses`；
- endpoint 完整复用既有 loopback Host / POST / extension Origin / bridge token / JSON content type / content encoding / 1 MiB body limit / JSON decode 安全边界；
- server 只持有窄 `StructuredLlmAnalysisWriter`，不持有 API key、OpenAI provider 或 SQLite connection；
- runtime 用 canonical job URL 查本地 Job，再调用现有 `structuredLlmAnalyses.analyzeJob(...)`；
- job 不存在、缺完整 JD、成功、provider/repository failure 分别映射到固定最小 HTTP contract；
- 成功 HTTP response 只暴露 persisted analysis id；
- provider failure / invalid output / source race / persistence failure 对客户端统一收敛为 `502 {"error":"analysis_failed"}`；
- startup/import/link/status/opportunity/health/session 不自动调用 provider；
- 没有 popup 分析按钮、browser analyze client 或真实 OpenAI 请求。

静态审阅没有发现需要 Codex 修复的 Batch 3 产品源码缺陷。

## Codex 产品提交后的原始 CI

产品 commit `95ecbed47598378cb402a89757bf17d9e8327c64` 触发的 CI run：

`34136345014`

Typecheck 在旧外部测试 `tests/local-service-server.test.ts` 失败：测试仍精确断言 `startLocalService` options 只有 `imports` / `linkChecks` / `port`，没有包含本批新增的 optional `structuredLlmAnalyses` writer。

这是测试 API 基线漂移，不是产品实现错误。外部网页版 ChatGPT 更新测试类型 contract，commit：

`2a5fb50264faccf12bda2783d78ebb18784c82a8`

Codex 没有被要求修改测试，也没有被要求运行 typecheck/test/build。

## 外部 Batch 3 专项测试

外部网页版 ChatGPT 新增：

`tests/structured-llm-local-trigger.test.ts`

专项覆盖 17 个场景，包括：

- 产品专用 env 名称；
- disabled-by-default；
- complete config / model allowlist；
- partial config / blank secret / control-character secret / invalid model fail closed；
- startup error 中 API key 脱敏；
- exact canonical `jobUrl` request；
- client-supplied model/provider/key/jobId/prompt/analyzedAt rejection；
- noncanonical / non-detail URL rejection；
- special prototype / accessor / symbol-bearing input fail closed；
- authenticated endpoint success + id-only response；
- not configured / job not found / missing JD / invalid writer result；
- provider/repository error generic 502 + no private detail leakage；
- wrong Host / non-extension Origin / missing or wrong token；
- unsupported media type / content encoding / method；
- malformed JSON / expanded request / >1 MiB payload；
- runtime startup / import / status / opportunity / link check / health / session 均 0 provider calls；
- 只有显式 protected POST 才触发 fake provider；
- same-state repeated explicit trigger 复用同一 persisted id，provider 不重复调用；
- job-not-found / missing-JD 不调用 provider；
- invalid provider structured output → generic 502，且不持久化结果；
- provider 未配置时本地服务仍健康，只有分析 endpoint 返回 503。

## 外部测试 harness 修正

专项测试初始 commit `f437510da6c7fb75c240033d73c2d5ff94d850cd` 的 CI run `34137669448` 中：

- typecheck：PASS；
- lint：PASS；
- 既有测试与 16/17 个 Batch 3 新测试通过；
- 唯一失败来自外部测试自己构造了不符合既有 ImportRequest UUIDv4 contract 的 `clientImportId`，因此 import repository 正确拒绝该测试数据。

这不是产品缺陷。外部 ChatGPT 只把测试输入改为合法 UUIDv4，没有修改产品源码：

`ee82ee52c24763470cfdf6f2de9504e139989405`

## 最终工程验证

最终测试 head：

`ee82ee52c24763470cfdf6f2de9504e139989405`

GitHub Actions run：

`34137913888`

结果：

- `npm ci`：PASS
- `npm run typecheck`：PASS
- `npm run lint`：PASS
- `npm test`：PASS — **50 test files / 714 tests passed**
- Batch 3 专项：**17 / 17 passed**
- `npm run build`：PASS
- `npm run build:edge`：PASS
- `npm run build:local`：PASS
- `npm run verify:manifests`：PASS

没有发现需要 Codex repair 的 Batch 3 产品代码问题。

## 真实 OpenAI / 浏览器验收

Batch 3 仍然没有 browser analyze button，也没有 browser client 调用 `/structured-llm-analyses`。外部验收只使用 fake provider / loopback HTTP 测试，不读取或使用用户真实 API key，不访问 `api.openai.com`，不产生真实模型调用费用。

本批也没有改变 BOSS 页面 DOM 提取行为，因此不需要用户进行新的 BOSS 页面人工验收。

## 最终结论

`Phase 6 / Batch 3 — PASS`

本地 OpenAI opt-in config、runtime optional provider、protected explicit localhost analysis trigger、费用边界与错误/secret hygiene 已通过外部独立代码审阅、专项测试和完整工程回归。

`Capability 12 — IN_PROGRESS`

下一批可以接入**浏览器 popup 中的显式用户分析动作**。即使该浏览器动作通过外部 fake/local 测试，Capability 12 仍需用户明确同意后的代表性真实 OpenAI 模型评测，才能考虑整体升级为 `VERIFIED`。
