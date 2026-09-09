# Phase 6 / Batch 5B — Safe Output Validation Diagnostics — External Verification

- 日期：2026-09-09
- 正式结果：`PASS`
- Capability 12：`IN_PROGRESS`
- Phase 6：`IN_PROGRESS`

## 背景

在 Lave8 `background` compatibility repair 之后，新的真实 GPT-5.6 Sol 单次评测首次成功通过 relay transport：

- `analysis_http/request_accepted = 1`
- `lave8/request_started = 1`
- HTTP `200`
- `lave8/response_accepted`
- 随后进入 `analysis/output_validation_failed`
- `analysis_http/result = analysis_failed`

因此 provider/relay/Responses transport 已不再是当前失败点；剩余阻塞位于本地 strict structured-output validator。

## 产品实现

产品 commit：`a6e78e996d5180a6eb7806b5daff4ba4d748281c`

仅修改：

- `src/domain/llm/structured-llm-analysis-validation.ts`
- `src/local-service/runtime.ts`

实现内容：

- 新增固定 `StructuredLlmOutputValidationReason` 枚举；
- 使用内部 `WeakMap` 按错误对象身份记录 fixed reason；
- public error message 仍为 `Invalid structured LLM analysis output`；
- runtime 仅在 `stage=output_validation_failed` 时增加 fixed `validationReason`；
- 未向 browser/localhost public response 暴露 reason；
- 未记录 raw provider output、JD/excerpt、structured evidence code、arbitrary error message 或 stack；
- validator acceptance/rejection rules未放宽。

Fixed reasons 包含：

- `unexpected_object_shape`
- `schema_version_mismatch`
- `invalid_text_type`
- `blank_or_invisible_text`
- `text_too_long`
- `enum_value_not_allowed`
- `invalid_array_shape_or_bounds`
- `invalid_evidence_shape`
- `full_jd_excerpt_not_exact`
- `structured_evidence_code_not_allowed`
- `duplicate_evidence_reference`
- `duplicate_responsibility_statement`
- `duplicate_ambiguity_question`
- `duplicate_interview_question`
- `other_validation_failure`

## 外部测试

外部测试 commits：

- `3cb8434d41712f692dddf1a120ed05b70961230d` — fixed validation-reason unit coverage
- `b6339a185df7536cc15acc56471c044d6657b8e3` — runtime fixed-reason / no-leak coverage

新增/更新验证覆盖：

- fully valid grounded output 仍接受；
- structural/text/enum/array failures 固定分类；
- exact JD grounding failure → `full_jd_excerpt_not_exact`；
- invented structured code → `structured_evidence_code_not_allowed`；
- duplicate evidence / statement / questions 固定分类；
- unknown validator-side throw → `other_validation_failure`；
- runtime diagnostic 不反射 private output/excerpt/code/JD；
- public localhost 仍返回 generic `502 {"error":"analysis_failed"}`；
- provider/source/persistence 其他 failure-stage observable shape 保持。

## 最终 CI

GitHub Actions run：`34317030455`

结果：`SUCCESS`

- Typecheck：PASS
- Lint：PASS
- Tests：**58 test files / 783 tests PASS**
- Chrome build：PASS
- Edge build：PASS
- local-service build：PASS
- manifest verification：PASS

关键测试：

- `tests/structured-llm-validation-diagnostics.test.ts` — 5/5 PASS
- `tests/structured-llm-runtime-diagnostics.test.ts` — 10/10 PASS
- `tests/lave8-structured-llm-provider.test.ts` — 14/14 PASS
- `tests/lave8-diagnostics.test.ts` — 11/11 PASS

## 安全 / 成本结论

本批没有真实 provider request。

保持：

- Lave8 model = `gpt-5.6-sol`
- `background` omitted
- zero automatic retry
- zero fallback
- max one provider fetch per generate
- public generic failure contract
- strict validator semantics

## 下一步

允许进行一次新的显式 representative Sol 调用。

目标不是再次猜测，而是直接读取 safe diagnostic：

`analysis/output_validation_failed + validationReason=<fixed enum>`

如果这次 validator 通过，则继续检查 SQLite persistence 和 representative sample；如果失败，则只针对固定 reason 做窄分析，不重复调用。

在真实 sample 通过 grounding / business-usability / secret-error-cost safety 验收之前：

- Capability 12 保持 `IN_PROGRESS`
- Phase 6 保持 `IN_PROGRESS`
- 核心能力保持 `12 / 15 VERIFIED`
