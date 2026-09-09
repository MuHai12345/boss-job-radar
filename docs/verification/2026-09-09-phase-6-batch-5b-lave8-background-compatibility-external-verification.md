# Phase 6 / Batch 5B — Lave8 `background` Compatibility Repair — External Verification

- 日期：2026-09-09
- Formal outcome：`PASS`
- Capability 12：仍为 `IN_PROGRESS`
- Phase 6：仍为 `IN_PROGRESS`
- 核心能力：`12 / 15 VERIFIED`

## 触发证据

在 `gpt-5.6-sol` 的一次受控真实评测中，用户只执行一次 Side Panel AI 分析点击。safe diagnostics 显示：

1. `analysis_http/request_accepted` ordinal `1`；
2. `lave8/request_started` 一次；
3. relay 返回 HTTP `400`；
4. non-2xx fixed-safe summary 为：`errorType=invalid_request`、`requestParameter=unknown`、`messageHints=["unsupported","background"]`；
5. runtime 进入 `analysis/provider_failed`；
6. 同 ordinal `analysis_http/result=analysis_failed`。

因此该次真实评测的 one-click cost boundary 为 **1 accepted localhost request / 1 provider start / 0 automatic retry / 0 fallback**。同时，bounded safe message hints 首次给出足够具体的 relay compatibility evidence：`background` 参数被上游错误文本归类为 unsupported。

没有基于该失败做自动或手动重放。

## 批准的窄修复

只批准 Lave8 provider 省略 `background` request-body property。

产品实现：

`5a5a5e634d845eb30a9aee723a31a9b447db0bc0`

真实 diff 只有：

```diff
- model: modelId, store: false, background: false, stream: false,
+ model: modelId, store: false, stream: false,
```

确认没有修改：

- endpoint `https://lave8.com/v1/responses`；
- model `gpt-5.6-sol`；
- Bearer auth / Content-Type；
- `store:false`；
- `stream:false`；
- `reasoning:{effort:"low"}`；
- `max_output_tokens:4000`；
- system/user input；
- strict `text.format.json_schema`；
- parser；
- diagnostics；
- 45 秒 timeout；
- zero retry / zero fallback。

Official OpenAI provider 未修改。

## 外部测试

外部 ChatGPT 更新 `tests/lave8-structured-llm-provider.test.ts`：

- request snapshot 不再期望 `background:false`；
- 明确断言 request body **不存在** `background` property；
- 继续断言 `store:false`、`stream:false`、reasoning、input、strict schema、endpoint、auth 和 max-one-fetch 行为不变。

外部测试 commits：

- `324ff6605d6a0302f108a62dee42d863f51912aa` — 新 background omission baseline；
- `9bb38ee55e03227879ca6b83131f32c083f60d11` — 修复外部测试自身 lint fixture。

第一轮 CI `34315248324` 仅因外部测试 fixture 的 `no-useless-escape` lint 错误失败；Typecheck 已 PASS，未发现产品缺陷。

## 最终工程验证

最终 head：

`9bb38ee55e03227879ca6b83131f32c083f60d11`

最终 CI：

`34315354975`

结果：

- Typecheck：PASS
- Lint：PASS
- Vitest：**57 test files / 776 tests PASS**
- `tests/lave8-structured-llm-provider.test.ts`：**14 / 14 PASS**
- `tests/lave8-diagnostics.test.ts`：**11 / 11 PASS**
- `tests/lave8-message-hints.test.ts`：**7 / 7 PASS**
- `tests/analysis-http-diagnostics.test.ts`：**3 / 3 PASS**
- `tests/structured-llm-runtime-diagnostics.test.ts`：**8 / 8 PASS**
- `tests/structured-llm-local-trigger.test.ts`：**17 / 17 PASS**
- Chrome MV3 build：PASS
- Edge MV3 build：PASS
- local-service build：PASS
- manifest verification：Chrome PASS / Edge PASS

## 外部结论

本轮 `background` compatibility repair 正式 `PASS`。

这只证明：

- 真实 400 已提供足够证据支持省略 `background`；
- 产品实现精确落实该单点 repair；
- 工程回归与 cost/retry/security contract 未被破坏。

这**不等于**真实 Lave8 Sol end-to-end 已通过。

下一次代表性真实评测仍必须保持一次显式用户点击、1 / 1 cost boundary、0 automatic retry，并验证 relay 是否进入 2xx → `response_accepted` → strict product validator → SQLite persistence。

在成功 representative sample 完成外部 grounding / business-usability / secret-error-cost safety 验收前：

- Capability 12 保持 `IN_PROGRESS`；
- Phase 6 保持 `IN_PROGRESS`；
- 核心能力保持 `12 / 15 VERIFIED`。
