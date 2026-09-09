# Phase 6 / Batch 5B — Lave8 Long-Response Timeout Repair — External Verification

- 日期：2026-09-09
- 正式结果：`PASS`
- Capability 12：`IN_PROGRESS`
- Phase 6：`IN_PROGRESS`

## 背景

在 safe output validation diagnostics 完成后，新的受控真实 `gpt-5.6-sol` 单次调用没有进入 validator，而是在当前 Lave8 provider deadline 前超时：

- `analysis_http/request_accepted = 1`
- `lave8/request_started = 1`
- `lave8/timeout`
- `analysis/provider_failed`
- `analysis_http/result = analysis_failed`

该调用仍满足 one-click cost boundary：1 accepted localhost request / 1 provider request / 0 automatic retry / 0 fallback。

此前另一受控 Sol 调用已经成功到达 HTTP 200 + `lave8/response_accepted`，因此本批不改变 relay request shape、model、prompt、schema、parser 或 validator，只扩大等待窗口。

## 产品实现

产品 commit：`6429d41322864d93446a8fdda2a950d1229fd276`

仅修改：

- `src/domain/llm/lave8-structured-llm-provider.ts`
- `src/bridge/local-service-client.ts`

精确变化：

- `LAVE8_STRUCTURED_LLM_TIMEOUT_MS`: `45_000` → `90_000`
- `STRUCTURED_LLM_ANALYSIS_REQUEST_TIMEOUT_MS`: `50_000` → `100_000`

保持不变：

- Lave8 endpoint `https://lave8.com/v1/responses`
- model `gpt-5.6-sol`
- `background` omitted
- `store:false`
- `stream:false`
- `reasoning:{effort:'low'}`
- `max_output_tokens:4000`
- input / strict json_schema / parser
- validator / fixed validationReason diagnostics
- official OpenAI provider
- zero retry / zero fallback / max one provider fetch per generate
- one localhost analysis POST per explicit browser action

## 外部测试

外部测试 commits：

- `261e2ae1ea1d01030bb6e1c6a0462f3fb45f54b0` — Lave8 90-second provider timeout boundary
- `4cf30d6d15f05d6ec5a0a992f4128a3635482c76` — browser 100-second analysis deadline boundary

验证覆盖确认：

- provider fixed timeout = 90 seconds；
- provider timeout aborts the one in-flight request；
- provider request count stays 1；
- browser analysis deadline = 100 seconds；
- hanging 200 body is bounded by 100-second browser deadline；
- rejected/failed POST is never replayed；
- request shape, strict schema and secret boundary remain unchanged。

## 最终 CI

GitHub Actions run：`34327704721`

结果：`SUCCESS`

- Typecheck：PASS
- Lint：PASS
- Tests：**58 test files / 783 tests PASS**
- Chrome build：PASS
- Edge build：PASS
- local-service build：PASS
- manifest verification：PASS

关键测试：

- `tests/lave8-structured-llm-provider.test.ts` — 14/14 PASS
- `tests/structured-llm-browser-client.test.ts` — 29/29 PASS
- `tests/structured-llm-validation-diagnostics.test.ts` — 5/5 PASS
- `tests/structured-llm-runtime-diagnostics.test.ts` — 10/10 PASS

## 安全 / 成本结论

本批没有真实 provider request。

扩大 timeout 不增加远程调用次数：

- automatic retries = ZERO
- fallbacks = ZERO
- max provider fetch per generate = ONE
- max localhost analysis POST per explicit browser action = ONE

## 下一步

允许进行一次新的显式 representative Sol 调用，使用已外部验证的 90s provider / 100s browser deadline。

下一次真实调用必须继续满足：

1. startup/pre-click provider activity = 0；
2. one user click → exactly 1 `analysis_http/request_accepted`；
3. exactly 1 `lave8/request_started`；
4. no automatic retry / no fallback；
5. 若 transport/Responses 成功，则读取 fixed-safe validator diagnostic；
6. 若 validator 通过，则确认 SQLite 中只新增一个 `provider=lave8` / `model=gpt-5.6-sol` analysis row，并导出 sanitized representative sample 做 grounding / business-usability external review。

在 representative sample 最终通过之前：

- Capability 12 保持 `IN_PROGRESS`
- Phase 6 保持 `IN_PROGRESS`
- 核心能力保持 `12 / 15 VERIFIED`
