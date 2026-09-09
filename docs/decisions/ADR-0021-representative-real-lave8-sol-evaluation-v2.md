# ADR-0021：Representative Real Lave8 Sol Evaluation v2

- 状态：APPROVED FOR ONE REPRESENTATIVE REAL EVALUATION
- 日期：2026-09-09
- 对应能力：Capability 12 — structured LLM analysis
- 当前 provider：`lave8`
- 当前 endpoint：`https://lave8.com/v1/responses`
- 当前唯一批准 Lave8 model：`gpt-5.6-sol`
- 本批性质：验证批，不是产品编码批

## 决策背景

早期 Batch 5B 使用 `gpt-6-astra` 的真实请求稳定进入 localhost/provider 链，但最后一次受控调用得到 HTTP 400，safe diagnostics 仍只能归类为 unknown/other。后续对公开 OpenAI Codex / Sub2API Responses Lite 行为的研究把 Astra Lite compatibility 评为弱线索，不能支持继续向产品加入 OpenAI-internal Lite header 或 Codex-specific request metadata。

用户随后决定停止继续适配 Astra，并将 Lave8 structured analysis 的生产模型直接切换为 `gpt-5.6-sol`。

产品 switch commit：`6725198c8fc5103b095ed942311fd0e0b93fc773`。

外部测试 head：`c1910dccdd45671aa76087c4239adae2a889aa70`。

最终工程 CI：`34311086872` — **57 test files / 776 tests passed**，typecheck、lint、Chrome、Edge、local-service、manifest verification 全部 PASS。

正式验证记录：`docs/verification/2026-09-09-phase-6-batch-5b-lave8-sol-switch-external-verification.md`。

## Wire contract

切换到 Sol 后只允许 model 字段变化。继续固定：

- POST `https://lave8.com/v1/responses`
- Bearer auth
- `Content-Type: application/json`
- `store:false`
- `background:false`
- `stream:false`
- `reasoning:{effort:"low"}`
- `max_output_tokens:4000`
- system/user text input
- strict `text.format.json_schema`
- 45 秒 provider timeout
- completed-only Responses parser
- zero automatic retry
- zero fallback

不加入：

- `x-openai-internal-codex-responses-lite`
- `reasoning.context`
- `additional_tools`
- Codex client/thread/session/install metadata
- model fallback
- protocol fallback

## 用户参与边界

用户只做：

1. 在本机安全启动器输入 `YES`；
2. 通过隐藏输入输入 Lave8 API key；
3. 在最终 BOSS 岗位详情标签页打开 BOSS Job Radar Side Panel；
4. 必要时先解析/保存岗位；
5. 只点击一次 `AI 分析当前岗位`。

用户不承担 CMD、PowerShell 命令、build、SQLite 查询或日志整理。

## Secret 边界

API key 只允许在本机启动器 / local-service process 生命周期内存在：

- `BOSS_JOB_RADAR_LAVE8_API_KEY`
- `BOSS_JOB_RADAR_LAVE8_MODEL=gpt-5.6-sol`

不得写入 repository、`.env`、SQLite、browser storage、诊断日志或导出文件，也不得发送到 ChatGPT/Codex chat。

## One-call cost boundary

真实评测前必须确认：

- `analysis_http/request_accepted = 0`
- `lave8/request_started = 0`

一次用户显式点击后预期：

- `analysis_http/request_accepted = 1`
- `lave8/request_started = 1`
- automatic retry = 0
- fallback = 0

如果 accepted localhost request > 1，停止并调查 browser/local duplicate trigger。

如果 accepted = 1 但 provider request_started > 1，停止并调查 provider chain。

如果两者都是 0，说明请求没有进入分析链，不应进行额外 relay 调用。

## 成功标准

最低成功路径：

1. Side Panel 显示分析成功并保存；
2. one-click cost boundary 为 1 / 1；
3. provider 获得 2xx，并出现 `response_accepted`；
4. `analysis_http/result = ok`；
5. SQLite 只新增一条对应 analysis；
6. persisted identity 为 `provider=lave8` / `model=gpt-5.6-sol`；
7. existing strict validator 通过；
8. 无 secret/error leakage；
9. 导出 sanitized representative sample 给外部 ChatGPT 做 grounding 与业务可用性人工验收。

## 失败处理

任何失败后都不得自动或手动马上重试。

只使用现有 fixed safe diagnostics：

- analysis HTTP accepted/result ordinal；
- Lave8 request_started；
- HTTP integer status；
- allowlisted request parameter；
- fixed body structure / error type / error code；
- bounded fixed-enum message hints；
- fixed response structural summary；
- fixed runtime analysis stage。

不输出 raw provider body/message、prompt/JD、key、Authorization、stack、database path 或身份元数据。

## Capability gate

Sol 的真实 representative sample 通过前：

- Capability 12 保持 `IN_PROGRESS`
- Phase 6 保持 `IN_PROGRESS`
- 核心能力保持 `12 / 15 VERIFIED`

真实 sample 通过外部 grounding / business-usability / secret-error-cost safety 验收后，才考虑 Capability 12 → `VERIFIED` 与 Phase 6 → `PASS`。
