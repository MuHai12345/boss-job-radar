# ADR-0019：Representative Real OpenAI Evaluation v1

- 状态：Phase 6 / Batch 5 验证计划已批准，等待用户明确同意
- 日期：2026-09-08
- 对应能力：Capability 12 — structured LLM analysis
- 前置：Phase 6 / Batch 1–4 均已通过外部验收
- 本批性质：**验证批，不是 Codex 产品编码批**

## 背景

Phase 6 / Batch 1–4 已经把 structured LLM 的产品链路推进到完整的显式用户动作：

1. provider-neutral input / prompt / output / persistence foundation；
2. OpenAI Responses provider transport；
3. 产品专用本地 OpenAI 配置 + protected localhost trigger；
4. popup 中透明、明确、zero-retry 的用户点击动作。

现有自动化测试已经使用 fake provider / fake transport 覆盖结构、错误、费用边界、安全边界和完整回归。剩余风险无法再通过“继续写更多产品代码”合理消除：必须验证真实 OpenAI Responses API 是否能在当前 prompt/schema/input 上稳定产生可用、grounded 的 structured result。

因此 Batch 5 不预先要求 Codex 改产品。先做真实 provider 验证；只有真实评测暴露具体产品缺陷时，才生成窄范围 repair Prompt。

## 明确用户同意门槛

在任何真实 OpenAI 请求发生前，用户必须明确同意：

- 选定的岗位将通过本地服务发起真实 OpenAI API 请求；
- provider input 包含该岗位的完整 JD 与已经批准的最小化结构化岗位上下文；
- 请求可能产生 OpenAI API 费用；
- 用户自行选择批准 allowlist 中的模型；
- 用户知道本批不会自动重试，也不会后台批量分析。

没有明确同意：

**0 real provider calls**。

## API key 边界

API key 只能由用户配置在本机 local-service process 的：

`BOSS_JOB_RADAR_OPENAI_API_KEY`

模型只通过：

`BOSS_JOB_RADAR_OPENAI_MODEL`

配置。

用户**不要**把 API key：

- 粘贴到 ChatGPT；
- 发给 Codex；
- 提交到 GitHub；
- 写入 issue / docs / screenshot；
- 上传到测试 fixture；
- 保存到 SQLite。

本批继续不增加 `.env` loader、secret UI 或 secret persistence。

## 模型选择

当前产品 allowlist：

- `gpt-5.6-luna`
- `gpt-5.6-terra`
- `gpt-5.6-sol`

外部网页版 ChatGPT 在 2026-09-08 已通过 OpenAI 官方 API 文档确认这三个 model ID 当前均支持 Responses API 与 Structured Outputs。

真实评测开始前仍应再次确认模型可用性与最新价格，不把当前价格硬编码进产品或验收标准。

建议第一轮使用一个模型完成小规模代表性评测，不自动跨模型 fallback。若用户优先控制成本，可选择 Luna；若希望兼顾质量与成本，可选择 Terra；Sol 可作为更高质量对照，但不是首轮强制要求。

最终模型由用户明确选择。

## 代表性样本

优先选 3 个已经正常保存到本地、具有完整 JD 的代表性岗位：

1. **明显适合转行的真实电商运营入门岗**；
2. **存在明确经验硬门槛 / 高成长但不适合当前阶段的岗位**；
3. **职责模糊、疑似伪运营、销售/客服混合或信息矛盾岗位**。

如果当前没有足够自然样本，可以先做 1 个真实 smoke sample，再补其余类别；不得为了凑样本伪造 BOSS 页面或故意触发风险控制。

岗位内容本身由用户选择是否愿意发送到 OpenAI。若用户不愿发送某个真实岗位，可换成已保存的公开/脱敏代表性岗位。

## Real browser end-to-end flow

每个样本只执行用户主动动作：

1. 用户正常打开已登录的 canonical BOSS detail page；
2. 确认该岗位已经“保存到本地”；
3. 打开 popup；
4. 确认 `AI 岗位分析` 区域和费用/远程数据披露可见；
5. 用户主动点击 `发送到 OpenAI 并分析当前岗位`；
6. 等待固定成功或失败状态；
7. 不在未知网络结果后自动重放；如果要再次尝试，必须是用户新的明确点击。

这一步同时完成 Batch 4 尚未重复要求用户做的真实浏览器 acceptance。

## 结果获取与人工评测

当前 Phase 6 popup 只显示成功/失败状态，不显示完整 analysis JSON；这是 Batch 4 的批准边界，不为验证便利而临时扩张产品 UI。

若真实调用成功，人工评测可以使用以下安全路径之一：

- 用户明确同意后，向外部 ChatGPT 上传**本地 SQLite 数据库的副本**，由外部 ChatGPT只读取所选 analysis 记录；或
- 后续如果用户更偏好本地可视化，再在新的明确产品 ADR 中设计读取/展示能力，而不是在 Batch 5 临时绕过边界。

上传数据库不是强制；如果数据库包含用户不愿分享的其他岗位信息，应优先选择不上传，并暂停人工内容评测，直到有更窄的安全查看路径。

绝不上传 API key、Cookie、Session、验证码或 BOSS 登录凭证。

## 人工评测维度

对每个真实 structured output 至少检查：

### 1. Schema / persistence

- 请求真实完成；
- 结果通过现有 strict validator；
- persisted result 可重新读取；
- provider/model/source-state identity 正确；
- same-state 已成功结果不会因为再次手动点击而产生不必要 provider call。

### 2. Grounding

- `full_jd` evidence excerpt 必须能在绑定 JD snapshot 中找到；
- upstream structured evidence 只能引用批准 code；
- 不把缺失字段猜成确定事实；
- 不把 prompt injection / JD 内命令当作系统指令；
- 不伪造招聘者活跃度、发布时间、薪资、经验或链接状态。

### 3. 业务可用性

人工判断：

- role summary 是否准确概括岗位；
- responsibilities 是否抓住核心工作；
- career-switch interpretation 是否符合确定性证据；
- growth interpretation 是否对入职后的可学习内容有帮助；
- risk interpretation 是否指出真正风险而非泛泛而谈；
- interview questions 是否能帮助用户实际追问 JD 中的模糊点；
- confidence 是否与信息完整度相符。

### 4. 安全与失败语义

- popup / localhost 不显示 raw OpenAI error body；
- 不泄露 API key；
- timeout / failure 不自动 retry；
- refusal / incomplete / invalid structured output 继续 fail closed；
- 失败不得写入伪成功 analysis。

## 通过标准

Phase 6 / Batch 5 可以 PASS 的最低条件：

- 至少 1 个真实 OpenAI end-to-end sample 成功通过 browser → localhost → OpenAI → validation → persistence；
- 最终代表性样本集达到外部 ChatGPT批准的覆盖度；
- 没有 critical grounding violation；
- 没有 secret/error leakage；
- 没有自动重复付费请求；
- 人工评测确认输出对岗位理解、转行判断、成长性、风险和面试追问具有实际价值；
- 发现的问题均被分类为：产品缺陷、模型能力限制、样本信息不足或可接受表现，而不是混为一谈。

如果真实调用暴露产品缺陷：

`CHANGES_REQUIRED`

外部 ChatGPT 生成一个窄 repair Prompt 给 Codex。

如果产品链路正确但用户暂不愿进行真实远程调用：

Capability 12 保持 `IN_PROGRESS`，不是产品失败。

## Phase 6 退出条件

只有 Batch 5 真实 provider 评测通过后，外部 ChatGPT 才能考虑：

- `Capability 12 → VERIFIED`
- `Phase 6 → PASS`

然后才允许进入：

`Phase 7 — 本地岗位审核界面 / Capability 13`

在 Phase 6 PASS 前，不为了保持 Codex 忙碌而提前开始 Capability 13。
