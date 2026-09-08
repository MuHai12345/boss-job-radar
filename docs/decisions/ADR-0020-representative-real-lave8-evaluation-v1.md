# ADR-0020：Representative Real Lave8 Evaluation v1

- 状态：Phase 6 / Batch 5B 验证计划已批准，等待真实本机执行
- 日期：2026-09-08
- 对应能力：Capability 12 — structured LLM analysis
- 前置：Phase 6 / Batch 1–4 PASS；Batch 5A Lave8 adapter PASS
- 本批性质：**验证批，不是产品编码批**

## 背景

用户明确选择第三方 Lave8 relay 作为真实 LLM provider。Batch 5A 已经通过外部代码审阅、fake transport/config tests 与完整 CI，正式支持：

- provider identity：`lave8`
- endpoint：`https://lave8.com/v1/responses`
- model：`gpt-6-astra`
- Bearer auth
- strict Responses request contract
- zero automatic retry / zero fallback
- product-specific local config
- provider-neutral popup disclosure

但尚未对 Lave8 执行任何真实远程请求，因此真实 Responses/Structured Outputs 兼容性仍未知。

## 用户参与边界

用户不承担 CMD、PowerShell、build、local service、SQLite 查询或导出工作。Codex 在本批获得一次**本地验证环境操作例外**，负责这些环境工作，但不得修改产品代码。

用户本人只做：

1. 在本机安全输入窗口输入 Lave8 API key；
2. 在已登录的真实 BOSS canonical job detail page 中打开 popup；
3. 主动点击一次 `发送到已配置的 AI 服务并分析当前岗位`。

若需要重新加载扩展，用户只执行浏览器 UI 的 Reload 动作。

## Secret 边界

Lave8 API key 绝不能发送到 ChatGPT、Codex chat 或 GitHub。

只允许在仓库外临时 launcher 中通过本机 `Read-Host -AsSecureString` 获取，并在当前 local-service process 生命周期内设置：

- `BOSS_JOB_RADAR_LAVE8_API_KEY`
- `BOSS_JOB_RADAR_LAVE8_MODEL=gpt-6-astra`

不得写入 `.env`、repository、SQLite、browser storage、日志或导出文件。

## 真实调用边界

启动 local service、打开数据库、import、link check、status/opportunity refresh、health/session 均必须保持 0 relay calls。

只有用户主动点击 popup 的显式分析按钮才能进入：

browser → protected localhost endpoint → existing structured LLM repository → Lave8 provider

每次用户点击：

- 最多一个 localhost analysis POST；
- 最多一个 Lave8 provider request；
- 0 automatic retries；
- 0 request-shape fallback；
- 0 endpoint fallback；
- 0 model fallback。

未知失败后不得自动重放。

## 第一轮 smoke sample

优先使用一个已经正常保存到本地、具有完整 JD 的真实电商运营岗位。

最低 smoke 成功路径：

1. popup 成功提示 `AI 分析已完成并保存到本地。`；
2. SQLite 新增 `structured_llm_analyses` row；
3. persisted provider/model 为 `lave8` / `gpt-6-astra`；
4. result 通过现有 strict product validator；
5. 没有 secret/error leakage；
6. 没有自动重复付费请求。

如果自然样本充足，再逐步覆盖经验硬门槛与职责模糊/疑似伪运营岗位；不得为了凑样本伪造 BOSS 页面或故意触发风控。

## 失败处理

真实 Lave8 请求失败时：

- 不自动 retry；
- Codex 只做本地非敏感诊断；
- 不把 raw provider body、API key、prompt、完整 JD 或 stack 发到 chat；
- 不修改产品源码；
- 生成诊断报告交给外部 ChatGPT。

如果证据显示是 Lave8 对当前 request/response contract 的具体兼容问题，外部 ChatGPT 再决定是否生成一个窄 repair Prompt。

## 成功后的最小导出

Codex 在仓库外 `%TEMP%\boss-job-radar-phase6-batch5b\` 生成 `real-eval-sample.json`，只包含本次 selected analysis 的最小人工验收数据：

- analysis metadata / parsed analysis JSON；
- 绑定 JD 与最小岗位事实；
- deterministic/status/opportunity upstream assessment。

必须排除：

- Lave8 API key / Authorization；
- Cookie / Session / BOSS login data；
- company name；
- job URL / source page URL；
- whole-page raw text；
- bridge token；
- database path / Windows username path；
- unrelated jobs / unrelated analyses。

用户只需把这个 sanitized JSON 上传给外部网页版 ChatGPT。

## 人工评测

外部 ChatGPT 至少检查：

- strict schema / persistence identity；
- full-JD evidence grounding；
- upstream code grounding；
- 不伪造缺失事实；
- role summary / responsibilities；
- career-switch interpretation；
- growth interpretation；
- risk interpretation；
- interview questions；
- confidence 与信息完整度；
- secret/error/cost safety。

## 通过标准

Batch 5B 最低 PASS 条件：

- 至少 1 个真实 Lave8 browser → localhost → relay → validation → SQLite sample 成功；
- 没有 critical grounding violation；
- 没有 secret/error leakage；
- 没有 automatic paid retry；
- 人工评测确认结果具有实际岗位判断价值。

真实兼容问题：`CHANGES_REQUIRED`。

真实评测通过后，外部 ChatGPT 才能考虑：

- Capability 12 → `VERIFIED`
- Phase 6 → `PASS`
- 进入 Phase 7 / Capability 13
