# Phase 6 / Batch 5B — Lave8 GPT-5.6 Sol Switch External Verification

- 日期：2026-09-09
- Formal outcome：`PASS`
- Capability 12：`IN_PROGRESS`
- Phase 6：`IN_PROGRESS`
- 核心能力矩阵：`12 / 15 VERIFIED`

## Scope

用户决定停止继续适配 `gpt-6-astra`，将 Lave8 structured analysis 的唯一批准模型切换为 `gpt-5.6-sol`。本批只允许修改 Lave8 model allowlist，不允许加入 Responses Lite、改变 endpoint/request schema/parser/timeout/retry/fallback，也不允许真实 provider 调用。

## Product implementation

Codex 产品 commit：`6725198c8fc5103b095ed942311fd0e0b93fc773`

外部审阅确认该 commit 相对批准 base `1836c02d2f3378f2d87721d7a14edd3634c49a5d` 只修改：

- `src/domain/llm/lave8-structured-llm-provider.ts`

唯一产品行为变更：

```ts
LAVE8_STRUCTURED_LLM_MODEL_IDS = ['gpt-5.6-sol']
```

确认：

- `gpt-5.6-sol` accepted；
- `gpt-6-astra` rejected；
- 其他 Lave8 model rejected；
- endpoint 仍为 `https://lave8.com/v1/responses`；
- Bearer auth / Content-Type 不变；
- `store:false` / `background:false` / `stream:false` 不变；
- `reasoning.effort=low` 不变；
- `max_output_tokens=4000` 不变；
- system/user input 与 strict `text.format.json_schema` 不变；
- 45 秒 timeout 不变；
- parser / safe diagnostics 不变；
- zero retry / zero fallback 不变；
- 未加入 `x-openai-internal-codex-responses-lite` 或任何 Codex Lite metadata。

## External tests

外部 ChatGPT 更新既有测试基线：

- `a5c877ad7b0010f8afe99ad9cd5a11f8565c91a6` — provider model / request snapshot 改为 Sol，并确认 Astra 非法；
- `c8057f78c69c8582730ae8109ff24d0a1d577970` — runtime config 改为 Sol，并确认 Astra fail closed；
- `c1910dccdd45671aa76087c4239adae2a889aa70` — secret-safe diagnostics helper 改为 Sol，诊断语义不变。

第一次外部测试 head `c8057f78...` 的 CI `34310943209` 在 Test 阶段失败：`tests/lave8-diagnostics.test.ts` 的 helper 仍使用旧 `gpt-6-astra`，因此 provider 配置按新产品规则正确 fail closed。Typecheck 与 lint 已通过；这属于 stale external test baseline，不是产品缺陷。

修正最后一个外部测试 helper 后，最终工程 head：

`c1910dccdd45671aa76087c4239adae2a889aa70`

最终 CI：`34311086872`

结果：

- Typecheck：PASS
- Lint：PASS
- Test：**57 test files / 776 tests PASS**
- `lave8-structured-llm-provider.test.ts`：14/14 PASS
- `lave8-diagnostics.test.ts`：11/11 PASS
- `lave8-runtime-config.test.ts`：5/5 PASS
- `lave8-message-hints.test.ts`：7/7 PASS
- `structured-llm-runtime-diagnostics.test.ts`：8/8 PASS
- `structured-llm-local-trigger.test.ts`：17/17 PASS
- Chrome MV3 build：PASS
- Edge MV3 build：PASS
- local-service build：PASS
- manifest verification：PASS

## Security / cost

本批真实 Lave8 请求：`ZERO`。

没有读取或提交用户 API key，没有改变 secret boundary，没有增加自动 retry/fallback，也没有增加新的远程字段或 Codex internal metadata。

## Decision

`Phase 6 / Batch 5B — Lave8 GPT-5.6 Sol production model switch`：`PASS`。

Astra 路径停止继续适配；此前 Responses Lite 研究仅保留为历史调查证据，不进入当前产品 wire contract。

Capability 12 与 Phase 6 仍不能通过，因为还没有 `gpt-5.6-sol` 的真实 representative browser → localhost → Lave8 → strict validator → SQLite sample。

下一门槛：只做一次新的用户显式 Sol 真实分析，继续验证 one-click / one-accepted-localhost / one-provider-request cost boundary，并在成功后导出 sanitized sample 做 grounding 与业务可用性人工验收。
