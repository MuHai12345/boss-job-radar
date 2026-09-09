# ADR-0022：Safe Output Validation Reason Diagnostics

- 状态：APPROVED
- 日期：2026-09-09
- 对应能力：Capability 12 — structured LLM analysis

## 背景

在 Lave8 `background` compatibility repair 后，一次受控 GPT-5.6 Sol 真实调用已经达到：

- one-click cost boundary 1 / 1；
- HTTP 200；
- `response_accepted`；
- 随后本地 `output_validation_failed`。

这证明 relay transport 已可用，但旧的单一 `output_validation_failed` 无法指出 strict validator 的具体失败规则。

## 决策

允许产品内部为 structured-output validation failure 增加 fixed-enum reason，同时继续保持 fail-closed validator。

仅允许固定、代码定义的 reason，例如 exact JD grounding、structured evidence code membership、duplicate reference、text length、object shape 等。

不得记录或反射：

- provider raw output；
- JD/excerpt；
- model supplied evidence code；
- arbitrary error message；
- prompt；
- job/company identity；
- secret/header/stack。

Browser/localhost public failure contract保持 generic，不暴露 internal reason。

## 实现与验证

产品：`a6e78e996d5180a6eb7806b5daff4ba4d748281c`

外部测试 head：`b6339a185df7536cc15acc56471c044d6657b8e3`

CI：`34317030455` — **58 test files / 783 tests PASS**，typecheck/lint/Chrome/Edge/local/manifests 全部 PASS。

正式验证记录：

`docs/verification/2026-09-09-phase-6-batch-5b-safe-output-validation-diagnostics-external-verification.md`

## 下一次真实调用

只允许一次新的用户显式 Sol 分析。

若出现：

`stage=output_validation_failed`

则必须同时出现一个 fixed `validationReason`，以此决定是否需要后续窄修复。

不得因为失败自动 retry；不得为了采样连续人工重试。

若 validator 通过，则继续进入 SQLite persistence 与 representative sample 外部人工验收。

Capability 12 / Phase 6 在真实 sample 验收前仍保持 `IN_PROGRESS`。
