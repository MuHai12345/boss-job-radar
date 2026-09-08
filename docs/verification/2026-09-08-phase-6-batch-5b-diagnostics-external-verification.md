# Phase 6 / Batch 5B Diagnostics — External Verification

- 日期：2026-09-08
- Formal outcome：`PASS`
- 对应能力：Capability 12 — structured LLM analysis（仍为 `IN_PROGRESS`）
- 产品实现 commit：`2697dc232716e50fb60722820716efb540eb21d4`
- 产品实现 base：`43e51a3a05581221dfd6a5356f2ec97e0a3d59dd`
- 最终外部测试 head：`5880db94242849b5cc610d15e4e59cc8f5e45fd4`
- 最终 CI run：`34215510564`
- 真实 Lave8 请求：`ZERO`

## 范围

本轮不是第二次真实付费评测，而是针对首次 Batch 5B `502 analysis_failed` 后暴露的诊断盲区，增加只在本机 local-service console 可见的 secret-safe 固定阶段诊断。

产品实现只涉及：

- `src/domain/llm/lave8-structured-llm-diagnostics.ts`
- `src/domain/llm/lave8-structured-llm-provider.ts`
- `src/local-service/runtime.ts`
- `src/local-service/main.ts`

未修改 Side Panel、popup、localhost server contract、数据库 schema/migration、provider request schema、endpoint、model allowlist 或依赖。

## 代码审阅结论

外部逐项审阅确认：

### Lave8 transport diagnostics

固定安全事件包括：

- `request_started`
- `http_response`（仅整数 HTTP status）
- `timeout`
- `network_failure`
- `http_non_2xx`
- `response_json_invalid`
- `response_contract_invalid`
- `response_accepted`

`http_non_2xx` 允许对第三方 JSON error body 做一次诊断性读取，但只把 `error.param` 精确映射到本地 allowlist：

- `background`
- `store`
- `stream`
- `reasoning`
- `max_output_tokens`
- `input`
- `text`
- `text.format`
- `unknown`

不会把第三方 `message`、`code`、`type`、原始 `param`、response body 或 headers 输出到日志。

对于 2xx 但不符合现有 Responses outer contract 的响应，只输出固定枚举与 bounded counts 组成的 structural summary；未知外部 type/status 一律映射为本地 `other`，不会输出 output text、refusal text、reasoning text、ID 或 metadata。

诊断 callback 自身异常被安全吞掉，不改变 provider 结果，不增加 fetch，不触发 retry/fallback。

### Runtime analysis-stage diagnostics

`startLocalRuntime` 只依据产品自己控制的 exact error message 映射到固定 stage：

- `invalid_source`
- `provider_failed`
- `output_validation_failed`
- `source_changed`
- `stored_analysis_invalid`
- `internal_or_persistence`

未知异常统一为 `internal_or_persistence`。不会把 `Error.message`、stack、SQLite detail、JD、prompt、job URL 或 secret 发送给 observer。

原异常随后继续 rethrow，现有 server 仍将分析异常转换为固定 `502 {"error":"analysis_failed"}`；浏览器/HTTP contract 未变。

### 成本与调用边界

验证确认：

- 每次 provider `generate` 最多一次 fetch；
- 45 秒 timeout 保持；
- timeout 不会再次误报为 network failure；
- zero automatic retry；
- zero endpoint/model/request-shape fallback；
- startup/import/link/status/opportunity/health 工作保持 0 provider calls；
- diagnostics 自身不会触发网络。

## 外部测试

外部 ChatGPT 更新了一个已过期测试基线：旧测试要求 non-2xx 完全不读取 error JSON；新批准诊断 contract 明确允许**一次只用于 allowlisted parameter 映射的安全 JSON read**。这是测试基线变化，不是产品缺陷。

新增：

- `tests/lave8-diagnostics.test.ts` — 8 tests
- `tests/structured-llm-runtime-diagnostics.test.ts` — 8 tests

覆盖：

- success diagnostic sequence；
- non-2xx allowlisted parameter 与 unknown mapping；
- raw relay error / API key / prompt / JD 非泄漏；
- invalid 2xx JSON；
- response-contract structural summary；
- one-fetch network failure；
- timeout without network double-report；
- diagnostic callback throw isolation；
- provider/output/source/source-change/stored/persistence failure-stage mapping；
- normal `job_not_found` / `analysis_unavailable` 不伪装为 502 diagnostic；
- generic browser/server 502 contract 保持；
- callback failure 后 local service 仍可用。

## 最终工程验证

最终 CI `34215510564`：

- `npm ci`：PASS
- typecheck：PASS
- lint：PASS
- tests：PASS — **54 test files / 762 tests**
- `tests/lave8-diagnostics.test.ts`：**8 / 8 PASS**
- `tests/structured-llm-runtime-diagnostics.test.ts`：**8 / 8 PASS**
- `tests/lave8-structured-llm-provider.test.ts`：**14 / 14 PASS**
- `tests/structured-llm-local-trigger.test.ts`：**17 / 17 PASS**
- Chrome MV3 build：PASS
- Edge MV3 build：PASS
- local-service build：PASS
- manifest verification：PASS

## Phase Gate

`Phase 6 / Batch 5B diagnostics repair = PASS`。

这只表示第二次真实评测前的安全诊断前置条件已经通过，不表示真实 Lave8 Responses/Structured Outputs 兼容性已经验证。

因此：

- Capability 12：保持 `IN_PROGRESS`
- Phase 6：保持 `IN_PROGRESS`
- 核心能力矩阵：保持 `12 / 15 VERIFIED`

下一步恢复 `Phase 6 / Batch 5B — representative real Lave8 evaluation v1`：用户本机安全输入 key，并在真实已保存 BOSS 岗位详情页**显式点击一次** AI 分析；失败时只使用已验证的 `BJR_LLM_DIAGNOSTIC` 安全事件判断阶段，不自动重试；成功时导出单个 sanitized `real-eval-sample.json` 供外部 grounding / 业务可用性验收。
