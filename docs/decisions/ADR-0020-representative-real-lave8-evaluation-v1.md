# ADR-0020：Representative Real Lave8 Evaluation v1

- 状态：Phase 6 / Batch 5B 真实评测恢复；secret-safe diagnostics 前置已 PASS
- 日期：2026-09-08
- 对应能力：Capability 12 — structured LLM analysis
- 前置：Phase 6 / Batch 1–4 PASS；Batch 5A Lave8 adapter PASS；Batch UX-1 PASS；Batch 5B diagnostics repair PASS
- 本批性质：**验证批，不是产品编码批**

## 背景

用户明确选择第三方 Lave8 relay 作为真实 LLM provider。现有产品已经通过外部代码审阅、fake transport/config tests 与完整 CI，正式支持：

- provider identity：`lave8`
- endpoint：`https://lave8.com/v1/responses`
- model：`gpt-6-astra`
- Bearer auth
- strict Responses request contract
- zero automatic retry / zero fallback
- product-specific local config
- provider-neutral browser disclosure
- persistent Side Panel explicit trigger
- 正常 BOSS detail query/hash 在浏览器边界 canonicalize 后发送 canonical job URL

第一次真实 Batch 5B 用户点击得到 generic `502 analysis_failed`，没有新增 `structured_llm_analyses` row。该证据不足以区分 key、relay HTTP、Responses outer contract、structured output validation、source state 或 persistence，因此没有推测根因，也没有自动重试。

随后增加并外部验证了 secret-safe diagnostics：

- Lave8 transport 固定事件：request / HTTP status / timeout / network / non-2xx / invalid JSON / response-contract structural summary / accepted；
- non-2xx 只把第三方 `error.param` 映射到固定 allowlist；
- runtime 只输出固定 analysis stage；
- browser/server 继续 generic `502 analysis_failed`；
- diagnostics 不输出 raw provider body/error、prompt、JD、API key、Authorization、stack 或 SQLite detail；
- zero retry / zero fallback / max one fetch 保持。

Diagnostics 产品实现：`2697dc232716e50fb60722820716efb540eb21d4`。最终外部工程验证 head：`5880db94242849b5cc610d15e4e59cc8f5e45fd4`，CI：`34215510564`，**54 test files / 762 tests passed**。

## 用户参与边界

用户不承担 CMD、PowerShell、build、local service、SQLite 查询或导出工作。Codex 在本批获得一次**本地验证环境操作例外**，负责这些环境工作，但不得修改产品代码。

用户本人只做：

1. 在本机安全输入窗口确认真实评测并输入 Lave8 API key；
2. 必要时在 Edge/Chrome 扩展管理 UI 点击 Reload；
3. 在已登录的真实 BOSS job detail page 中打开 Side Panel；
4. 主动点击一次 `AI 分析当前岗位`。

## Secret 边界

Lave8 API key 绝不能发送到 ChatGPT、Codex chat 或 GitHub。

只允许在仓库外临时 launcher 中通过本机 `Read-Host -AsSecureString` 获取，并在当前 local-service process 生命周期内设置：

- `BOSS_JOB_RADAR_LAVE8_API_KEY`
- `BOSS_JOB_RADAR_LAVE8_MODEL=gpt-6-astra`

不得写入 `.env`、repository、SQLite、browser storage、日志或导出文件。

## 真实调用边界

启动 local service、打开数据库、import、link check、status/opportunity refresh、health/session 均必须保持 0 relay calls。

只有用户主动点击 Side Panel 的显式分析按钮才能进入：

browser → protected localhost endpoint → existing structured LLM repository → Lave8 provider

每次用户点击：

- 最多一个 localhost analysis POST；
- 最多一个 Lave8 provider request；
- 0 automatic retries；
- 0 request-shape fallback；
- 0 endpoint fallback；
- 0 model fallback。

未知失败后不得自动重放。

## 恢复后的第二次真实 sample

优先使用一个已经正常保存到本地、具有完整 JD 的真实电商运营岗位。

正常 BOSS 详情 URL 即使包含 query/hash，也由 Side Panel 先 canonicalize；`securityId`、`ka` 等参数不进入 localhost analysis request、UI snapshot 或 AI provider input。

最低成功路径：

1. Side Panel 成功提示 AI 分析已完成并保存到本地；
2. SQLite 新增 `structured_llm_analyses` row；
3. persisted provider/model 为 `lave8` / `gpt-6-astra`；
4. result 通过现有 strict product validator；
5. 没有 secret/error leakage；
6. 没有自动重复付费请求。

如果自然样本充足，再逐步覆盖经验硬门槛与职责模糊/疑似伪运营岗位；不得为了凑样本伪造 BOSS 页面或故意触发风控。

## 失败处理

如果第二次真实 Lave8 请求仍失败：

- 不自动 retry；
- Codex 不发起 direct relay probe 或 localhost analysis replay；
- 只采集 `BJR_LLM_DIAGNOSTIC` 固定安全事件；
- 可以报告固定 event sequence、HTTP integer status、allowlisted request parameter、fixed-enum structural summary 与 analysis stage；
- 不把 raw provider body、API key、prompt、完整 JD、response text、stack、SQLite detail 或其他 secret 发到 chat；
- 不修改产品源码；
- 生成安全诊断报告交给外部 ChatGPT。

外部 ChatGPT 再基于该安全证据决定：具体 relay compatibility repair、环境问题处理，或其他窄范围下一步。

## 成功后的最小导出

Codex 在仓库外 `%TEMP%\boss-job-radar-phase6-batch5b\` 生成 `real-eval-sample.json`，只包含本次 selected analysis 的最小人工验收数据：

- analysis metadata / parsed analysis JSON；
- 绑定 JD 与最小岗位事实；
- deterministic/status/opportunity upstream assessment。

必须排除：

- Lave8 API key / Authorization；
- Cookie / Session / BOSS login data；
- company name（结构化字段）；
- job URL / source page URL；
- whole-page raw text；
- bridge token；
- database path / Windows username path；
- unrelated jobs / unrelated analyses。

完整 JD 是 grounding 人工验收所需内容；如果公司名等普通文本自然出现在 JD 中，不应通过关键词替换破坏 JD 原文。

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
