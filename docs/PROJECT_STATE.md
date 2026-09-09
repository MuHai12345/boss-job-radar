# 项目状态

## 当前状态快照

- 仓库：`MuHai12345/boss-job-radar`
- 分支：`master`
- Phase 0–5：`PASS`
- Phase 6：`IN_PROGRESS`
- 最近完成批次：`Phase 6 / Batch 5B — Lave8 long-response timeout repair — PASS`
- 当前能力：Capability 12 — structured LLM analysis：`IN_PROGRESS`
- 核心能力矩阵：`12 / 15 VERIFIED`
- Lave8 provider：`lave8`
- Lave8 endpoint：`https://lave8.com/v1/responses`
- Lave8 当前唯一批准 model：`gpt-5.6-sol`
- `gpt-6-astra`：已退出当前产品 allowlist；不再继续做 Responses Lite 适配
- 当前 Lave8 wire compatibility：`background` property 已基于真实 HTTP 400 safe evidence 从 Lave8 request body 省略；其他 request shape 保持不变
- Sol switch 产品 commit：`6725198c8fc5103b095ed942311fd0e0b93fc773`
- Background repair 产品 commit：`5a5a5e634d845eb30a9aee723a31a9b447db0bc0`
- Safe output validation diagnostics 产品 commit：`a6e78e996d5180a6eb7806b5daff4ba4d748281c`
- Long-response timeout repair 产品 commit：`6429d41322864d93446a8fdda2a950d1229fd276`
- 当前 Lave8 provider timeout：`90s`
- 当前 browser/local analysis deadline：`100s`
- 最新外部测试 head：`4cf30d6d15f05d6ec5a0a992f4128a3635482c76`
- 最新工程 CI：`34327704721` — **58 test files / 783 tests passed**，typecheck/lint/Chrome/Edge/local/manifests 全部 PASS
- 当前产品实现阻塞：无
- 当前验证阻塞：尚无真实 `gpt-5.6-sol` strict validator → SQLite representative sample
- 下一步：使用已验证的 90s provider / 100s browser deadline，只做一次新的用户显式 Sol 真实分析；若 validator 失败，读取 fixed `validationReason`，若通过则验证 SQLite sample 与业务质量

## 已验证核心能力

1. 真实 BOSS 当前页面 structured extraction
2. 原始事实 / 完整 JD / canonical link / unknown 保真
3. 本地 SQLite persistence / migration / recovery
4. 安全 localhost observation ingestion
5. 手动 extension → localhost save
6. Job identity / canonical URL dedupe / first_seen / last_seen
7. SearchRun / provenance / idempotent import
8. 确定性岗位真实性质识别
9. 经验硬门槛 / 偏好 / 矛盾识别
10. 招聘者活跃 / 平台新鲜度 / local observation recency / link 状态判断
11. 成长性 / 转行价值 / 风险 / 当前机会优先级 / 面试追问
15. SearchRun 范围薪资 PUA 可信解码与正式产品链路

尚未整体验证：Capability 12–14。

## Capability 12 已完成产品链路

Capability 12 已通过外部工程验证的部分包括：

- provider-neutral structured LLM foundation；
- minimized snapshot + 完整 JD / authoritative upstream evidence；
- prompt injection / delimiter boundary；
- strict structured output schema + product validator；
- full-JD substring / upstream-code grounding；
- schema v8 persistence、provider/model/source-state identity、same-state idempotency；
- source-change race rejection、provider call outside SQLite transaction；
- official OpenAI Responses transport；
- local opt-in config、startup secret sanitization；
- protected localhost explicit analysis trigger；
- explicit browser user trigger、当前 100 秒 browser/local analysis deadline、zero automatic retry；
- persistent Side Panel；
- canonical BOSS detail URL handling；
- 独立 Lave8 provider + fixed relay endpoint；
- Bearer secret boundary；
- strict Responses request/schema/parser；
- 当前 90 秒 Lave8 provider timeout、zero retry / zero fallback / max one fetch；
- secret-safe relay/runtime diagnostics；
- accepted localhost analysis ordinal + fixed result diagnostics；
- fixed non-2xx request parameter / error structure / error type / error code categories；
- bounded token-aware fixed-enum `messageHints`，不反射 raw provider error；
- fixed `StructuredLlmOutputValidationReason`，validator failure 只输出固定 reason，不记录模型原文/JD/excerpt/code；
- Side Panel 明确提示手动再次点击属于新远程尝试并可能产生新 API 费用；
- 当前 Lave8 production model allowlist 已切换并外部验证为仅 `gpt-5.6-sol`；
- 真实 Sol one-click 调用已验证 cost boundary 为 1 accepted localhost / 1 provider start / 0 retry；
- 真实 HTTP 400 safe diagnostics 给出 `errorType=invalid_request` + `messageHints=["unsupported","background"]`；
- 基于该证据，Lave8 request body 省略 `background`，其余 request shape 保持；
- 后续真实 Sol 调用曾达到 HTTP 200 + `response_accepted`，证明 relay/Responses transport 可通；该次随后被本地 strict validator 拒绝，因此增加 fixed-safe validation reason diagnostics；
- 最近一次真实调用在旧 45s provider deadline 上超时，仍满足 1 accepted / 1 provider start / 0 retry；基于该证据，Lave8 timeout 扩为 90s，browser/local deadline 扩为 100s，完整 CI 已通过。

Capability 12 仍为 `IN_PROGRESS`，因为缺少 strict validator 通过并落入 SQLite 的 representative real sample，以及随后 grounding / business-usability 外部验收。

## Phase 6 批次记录

### Batch 1 — PASS

Provider-neutral structured LLM foundation、严格验证、grounding、schema v8 persistence 与 source-state/idempotency 边界。

记录：`docs/verification/2026-09-07-phase-6-batch-1-external-verification.md`

### Batch 2 — PASS

Official OpenAI Responses provider、fixed endpoint、approved model allowlist、strict Structured Outputs、completed-only parser、45 秒 timeout、zero retry/fallback。

记录：`docs/verification/2026-09-07-phase-6-batch-2-external-verification.md`

### Batch 3 — PASS

Local key/model config、secret sanitization、protected `POST /structured-llm-analyses`、explicit trigger 与 0 unintended provider-call boundary。

记录：`docs/verification/2026-09-07-phase-6-batch-3-external-verification.md`

### Batch 4 — PASS

Browser localhost client、explicit click、remote-data/API-cost disclosure、fresh bridge session、canonical request、zero automatic retry。

记录：`docs/verification/2026-09-08-phase-6-batch-4-external-verification.md`

### Batch 5A — PASS

首次加入独立 Lave8 relay adapter。该批历史批准 model 为 `gpt-6-astra`；这是历史记录，不代表当前 model。Endpoint 固定为 `https://lave8.com/v1/responses`，并保持 strict Responses / 45 秒 / zero retry/fallback。

记录：`docs/verification/2026-09-08-phase-6-batch-5a-external-verification.md`

### Batch UX-1 — PASS

主体验迁移到 persistent Side Panel；正常带 query/hash 的 BOSS detail URL 可 canonicalize；explicit link check 恢复。

产品：`2a994fcc5f86f8cde2518a5a7c5eb46c205ca5a8` + repair `a270abd90363807f5139b0f698ec7c55a5457c27`。

记录：`docs/verification/2026-09-08-phase-6-batch-ux-1-external-verification.md`

### Batch 5B diagnostics repair — PASS

加入 secret-safe Lave8 transport/runtime failure-stage diagnostics，同时保持 browser/server generic failure、zero retry/fallback 与 max-one-fetch。

产品：`2697dc232716e50fb60722820716efb540eb21d4`

最终 CI：`34215510564` — **54 test files / 762 tests passed**。

记录：`docs/verification/2026-09-08-phase-6-batch-5b-diagnostics-external-verification.md`

### Batch 5B pre-retry diagnostics V2 — PASS

加入 `analysis_http/request_accepted` process-local ordinal 与 fixed result，扩展 non-2xx fixed-safe diagnostics，从而可以区分 browser/local duplicate 与 provider-chain duplicate。

产品：`0a0c357569947fe8c03aa1570344a4656df7f15a`

最终外部测试 head：`3738ef14df85a66f4dfbbffee3ca6206d207b884`

最终 CI：`34219631874` — **56 test files / 769 tests passed**。

记录：`docs/verification/2026-09-08-phase-6-batch-5b-pre-retry-diagnostics-v2-external-verification.md`

### Batch 5B safe message hints — PASS

真实 Astra HTTP 400 的 fixed safe categories 仍不足以定位 relay 错误，因此加入 bounded fixed-enum `messageHints`；随后修复 `upstream→stream`、`restored→store`、`modeling→model` 等 substring false positives，改为 token-aware matching。

最终产品 repair：`7f1c4a726f530c1ab3658bcc63cb6eadf508390f`

最终工程基线：**57 test files / 776 tests passed**。

### Batch 5B Responses Lite research — RESEARCH COMPLETE

用户提供的 model metadata 把 Astra 标为 `use_responses_lite=true`，Sol 标为 false。对 OpenAI Codex / Sub2API 公开源码研究确认 Responses Lite 确有 header/request-construction 差异，但无法证明 Lave8 当前 Astra 路由要求客户端主动复制 Codex Lite contract。

Evidence classification：`B — RESPONSES_LITE_COMPATIBILITY_IS_WEAK_LEAD`。

因此没有向产品加入 `x-openai-internal-codex-responses-lite`、Codex metadata、additional_tools、reasoning.context 或 streaming 适配。

### Batch 5B Lave8 GPT-5.6 Sol switch — PASS

用户决定停止继续适配 Astra，直接将 Lave8 production structured-analysis model 切到 `gpt-5.6-sol`。

产品 commit：`6725198c8fc5103b095ed942311fd0e0b93fc773`

最终 CI：`34311086872` — **57 test files / 776 tests passed**；typecheck/lint/Chrome/Edge/local/manifests 全部 PASS。

记录：`docs/verification/2026-09-09-phase-6-batch-5b-lave8-sol-switch-external-verification.md`

### Batch 5B Lave8 background compatibility repair — PASS

首次受控 Sol 真实调用满足 1 accepted localhost / 1 provider start / 0 automatic retry，但 relay 返回 HTTP 400。Safe diagnostics 为 `errorType=invalid_request`、`messageHints=["unsupported","background"]`，提供了足够具体的 evidence。

只批准并实现 Lave8 request body 省略 `background` property；没有改变其他 wire contract。

产品 commit：`5a5a5e634d845eb30a9aee723a31a9b447db0bc0`

最终外部测试 head：`9bb38ee55e03227879ca6b83131f32c083f60d11`

最终 CI：`34315354975` — **57 test files / 776 tests passed**；typecheck/lint/Chrome/Edge/local/manifests 全部 PASS。

记录：`docs/verification/2026-09-09-phase-6-batch-5b-lave8-background-compatibility-external-verification.md`

### Batch 5B safe output validation diagnostics — PASS

Background repair 后的一次受控真实 Sol 调用首次达到 HTTP 200 + `lave8/response_accepted`，但随后进入本地 `output_validation_failed`。为避免继续猜测，产品增加固定 `StructuredLlmOutputValidationReason`，只记录固定原因类别，不泄露 raw provider output、JD/excerpt、structured code 或 arbitrary error text；validator semantics 不放宽。

产品 commit：`a6e78e996d5180a6eb7806b5daff4ba4d748281c`

最终外部测试 head：`b6339a185df7536cc15acc56471c044d6657b8e3`

最终 CI：`34317030455` — **58 test files / 783 tests passed**；typecheck/lint/Chrome/Edge/local/manifests 全部 PASS。

记录：`docs/verification/2026-09-09-phase-6-batch-5b-safe-output-validation-diagnostics-external-verification.md`

### Batch 5B Lave8 long-response timeout repair — PASS

增加 validation reason 后的下一次受控真实 Sol 调用没有收到 HTTP response，而是在旧 45 秒 provider deadline 上超时。Safe sequence 为 1 accepted localhost / 1 `lave8/request_started` / `lave8/timeout` / provider_failed，仍然没有 retry/fallback。

考虑到此前已证明同一 Sol relay 可到达 HTTP 200 + `response_accepted`，本批只扩展等待窗口，不改变 wire request/validator：

- Lave8 provider timeout：45s → 90s
- browser/local analysis deadline：50s → 100s

产品 commit：`6429d41322864d93446a8fdda2a950d1229fd276`

最终外部测试 head：`4cf30d6d15f05d6ec5a0a992f4128a3635482c76`

最终 CI：`34327704721` — **58 test files / 783 tests passed**；typecheck/lint/Chrome/Edge/local/manifests 全部 PASS。

记录：`docs/verification/2026-09-09-phase-6-batch-5b-lave8-timeout-repair-external-verification.md`

## 当前真实验证门槛

当前批准计划：`docs/decisions/ADR-0021-representative-real-lave8-sol-evaluation-v2.md`

下一次只允许一次新的用户显式真实调用，并且本地源码/编译产物必须包含：

- `5a5a5e634d845eb30a9aee723a31a9b447db0bc0` — background omitted
- `a6e78e996d5180a6eb7806b5daff4ba4d748281c` — fixed validationReason diagnostics
- `6429d41322864d93446a8fdda2a950d1229fd276` — 90s provider / 100s browser deadline

验证要求：

1. Lave8 key 只在用户本机可用；外部 ChatGPT/Codex 不接触 secret；
2. local service 使用 `BOSS_JOB_RADAR_LAVE8_MODEL=gpt-5.6-sol`，startup 保持 0 relay calls；
3. Lave8 request body 必须省略 `background`；
4. 用户在已保存且有完整 JD 的真实 BOSS detail page 打开 Side Panel；
5. 用户只点击一次 `AI 分析当前岗位`；
6. 必须同时记录 `analysis_http/request_accepted` count/ordinal 与 `lave8/request_started` count；
7. one-click 预期 1 accepted localhost request / 1 provider request / 0 automatic retry / 0 fallback；
8. provider 最多等待 90s，browser/local request 最多等待 100s；
9. 若 provider 2xx + `response_accepted` 后 validator 失败，必须读取 fixed `validationReason`，不再猜测或立即重试；
10. 若 validator 通过，则只新增一个 `provider=lave8` / `model=gpt-5.6-sol` analysis row；
11. 成功后导出 sanitized representative sample；
12. 外部 ChatGPT 完成 grounding、业务可用性与 secret/error/cost safety 验收。

真实 sample 通过后，才能考虑：

- Capability 12 → `VERIFIED`
- Phase 6 → `PASS`
- 核心能力 → `13 / 15 VERIFIED`

## 已确认但尚未修复的 Side Panel UX 问题

这两项继续与当前 Lave8 real-eval gate 分开处理：

- 搜索结果页薪资可能包含网页字体 PUA 字符；当前 Side Panel 尚未消费已经 VERIFIED 的可信 salary decoding result。后续 UI 应优先显示 trusted decoded/plain salary；未可信解码时显示“薪资待解码/未知”，不能把方框乱码当可信工资。
- persistent Side Panel 跨新标签页保留，但当前 manifest 使用 `activeTab` 且没有 BOSS 持续 host permission；新 tab 不继承旧 tab 的临时授权。后续单独设计 BOSS-only 最小 optional host permission，不扩大到 `<all_urls>`。

## 协作与测试规则

长期分工以 `AGENTS.md` 为准：

- Codex：负责外部 Prompt 指定的产品源码、必要 migration、commit、push。
- Codex 默认不修改 tests/docs，不承担完整 CI/QA/最终验收。
- 外部网页版 ChatGPT：负责测试代码、CI、代码审阅、验证、验收和状态文档。
- 用户不是 CMD 测试执行器；仅在真实登录 BOSS 浏览器或真实 provider 场景执行不可替代的最少量人工动作。
- Batch 5B 本机验证环境操作是一次明确例外，不改变长期角色分工。

## 长期产品边界

当前数据来源仍以用户本人正常使用 BOSS直聘 时可见的页面数据为基础。系统不保存密码、验证码、Cookie 或 Session，不调用/逆向 BOSS 私有 API，不后台无人值守采集，不自动翻页，不自动投递，不自动聊天。

所有岗位继续保留供用户人工查看；低优先级、疑似伪运营、经验不匹配、招聘状态差、模型低置信度或信息不足，只能被标记、解释或排序，不能被静默删除。
