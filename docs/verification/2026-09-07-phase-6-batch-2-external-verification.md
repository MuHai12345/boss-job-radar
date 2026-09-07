# Phase 6 / Batch 2 外部验收记录

- 日期：2026-09-07
- 能力：Capability 12 — structured LLM analysis（OpenAI Responses provider transport v1）
- Codex 产品实现 commit：`34aaa1b1d23fb5f7b729f006436ed4816f381dd3`
- 最终外部测试 head：`9e37abd303d34823f87e41ef1044df113ce2f0d6`
- 最终 GitHub Actions run：`34134533838`
- 结论：`PASS`
- Capability 12 整体状态：`IN_PROGRESS`

## 代码审阅结论

外部网页版 ChatGPT 审阅了 Codex 的真实产品 commit。该 commit 只新增了两个批准范围内的产品文件：

- `src/domain/llm/openai-structured-llm-provider.ts`
- `src/domain/llm/openai-structured-llm-output-schema.ts`

没有修改 Batch 1 provider-neutral foundation、数据库、runtime、localhost server、popup、浏览器采集、测试、文档或依赖；也没有新增 API key 环境加载、HTTP LLM endpoint、自动模型调用、真实 API 请求、Capability 13 UI、BOSS 私有 API、Cookie / Session 或风控绕过能力。

实现满足 ADR-0016 的 transport contract：

- `providerId = openai`；
- 模型 ID 必须显式选择并限制为 `gpt-5.6-luna` / `gpt-5.6-terra` / `gpt-5.6-sol`；
- API key 只保留在 provider closure，并只进入 `Authorization: Bearer ...` header；
- 固定 endpoint `https://api.openai.com/v1/responses`；
- 使用 Node 原生 `fetch`，允许 fake transport 注入但不能改变产品 endpoint；
- system / user prompt 保持独立 message；
- 请求固定 `store:false`、`background:false`、`stream:false`、`reasoning.effort=low`、`max_output_tokens=4000`；
- 不请求 tools、conversation、previous response、user/account metadata；
- Structured Outputs 使用 `text.format.type = json_schema`、`strict:true`；
- 静态 JSON Schema 与现有 `structured-llm-job-analysis-v1` 结构保持一致，并对 object 使用 required / `additionalProperties:false`；
- provider 只把成功的 `output_text` JSON 解析成 `unknown`，没有绕过 Batch 1 的产品级 exact-shape / evidence grounding validator；
- 只接受 completed response、单一 assistant final message、单一 `output_text`；
- reasoning item 不作为最终结果；tool output、refusal、incomplete、failed、queued、malformed output、non-2xx、网络错误全部 fail closed；
- 所有 provider 运行时失败统一收敛到 `Structured LLM provider failed`；
- 固定 45 秒 timeout + `AbortController`；
- 0 retry、0 model fallback、0 provider fallback。

## 外部测试

外部网页版 ChatGPT 独立新增：

- `tests/openai-structured-llm-provider.test.ts`

专项测试覆盖 18 个场景，包括：

- provider / model identity；
- constructor secret 校验与 provider object 不暴露 key；
- exact endpoint / POST / headers；
- API key 只进入 Authorization，request body 不包含 key；
- system / user prompt 分离；
- `store:false` / `background:false` / `stream:false`；
- reasoning low / max output token 边界；
- no tools / no conversation / no previous response / no user metadata；
- `json_schema` + `strict:true`；
- schema required / `additionalProperties:false` 约束；
- reasoning + assistant message 成功解析；
- provider 返回 `unknown`，不冒充产品 grounding validator；
- refusal / incomplete / failed / queued / missing output；
- tool output / multiple messages / multiple content items；
- malformed output JSON / malformed HTTP JSON / non-2xx；
- transport error 固定错误与 secret hygiene；
- 45 秒 timeout / abort / zero retry。

第一次新增专项测试后的 CI run `34134394252` 中，49 个 test files / 697 个测试断言本身全部通过，但 timeout 测试在 fake timer 推进后才挂接 rejection assertion，导致 Vitest 报告一条测试 harness 自身的 unhandled rejection。该问题只存在于外部测试代码，不是产品缺陷。外部 ChatGPT 将 rejection assertion 提前挂接后，未修改产品源码，最终 CI 全绿。

## 最终工程验证

最终 head：`9e37abd303d34823f87e41ef1044df113ce2f0d6`

GitHub Actions run：`34134533838`

- `npm ci`：PASS
- `npm run typecheck`：PASS
- `npm run lint`：PASS
- `npm test`：PASS — **49 test files / 697 tests passed**
- `npm run build`：PASS
- `npm run build:edge`：PASS
- `npm run build:local`：PASS
- `npm run verify:manifests`：PASS

没有发现需要 Codex 修复的 Batch 2 产品代码缺陷。

## 真实 OpenAI / 浏览器验收

本批没有从本地环境加载真实 API key，没有 localhost LLM trigger，也没有 browser/popup analyze action，因此没有执行真实远程 OpenAI 请求，不产生真实模型调用费用，也不伪造“真实模型已通过”的结论。

本批没有修改 BOSS DOM 读取或浏览器 UI，因此无需新的真实 BOSS 页面人工验收。

## 最终结论

`Phase 6 / Batch 2 — PASS`

OpenAI Responses provider transport v1 已通过外部独立代码审阅、fake transport 专项测试和全量工程回归。

`Capability 12 — IN_PROGRESS`

下一阶段仍需要受控的本地 secret/model 配置、显式用户触发边界，以及在用户明确同意远程发送岗位内容和 API 成本后进行代表性真实模型评测，之后才可考虑将 Capability 12 升级为 `VERIFIED`。
