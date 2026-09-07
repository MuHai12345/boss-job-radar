# ADR-0014：确定性岗位机会评估 v1

- 状态：Phase 5 / Batch 4 已实现并通过外部验收
- 日期：2026-09-07
- 对应能力：Capability 11 — 成长性 / 转行价值 / 风险 / 当前机会优先级 / 面试追问

## 背景

Capability 8–10 已分别形成岗位性质、经验门槛和招聘状态的可追溯确定性结论，但这些轴尚未被组合成面向目标用户的“是否值得作为转行入口”和“当前是否值得优先查看”的结构化结论。

依据 ADR-0004，岗位适合度与当前机会优先级必须分离。任何低优先级、风险或未知结论都不得删除或隐藏岗位。Capability 11 仍属于 Phase 5 确定性规则，不引入 LLM，也不生成不可追溯的职业预测。

## 输入边界

v1 只使用仓库已经保存或已经确定性派生的数据：

1. 当前 `DeterministicJobAnalysis`：
   - `jobNature.status`
   - `jobNature.evidence`
   - `experience.status`
   - `experience.hardMinimumYears`
   - `experience.evidence`
   - contradictions / warnings
2. 当前 `JobStatusAssessment`：
   - recruiter activity band
   - platform freshness band
   - local observation recency band
   - link status / marker
   - source IDs / warnings
3. 当前 Job / observation identity only for provenance.

v1 不使用 LLM、简历相似度、主观文本补全、Cookie/Session、私有 API、用户人工审核状态或自动投递行为。薪资不进入本批优先级规则；Capability 15 的薪资事实保留给后续展示和分析，不在此批重新定义。

## 规则版本

固定版本：

`job-opportunity-assessment-v1`

改变阈值、状态语义、风险映射或优先级规则时必须升级版本，不得覆盖旧历史。

## 输出结构

每个 Job 的 `JobOpportunityAssessment` 至少包含：

- `jobId`
- `rulesVersion`
- `source`
  - deterministic rules version
  - status rules version
  - latest observation id
  - JD observation id
  - recruiter activity observation id
  - published observation id
  - latest link check id
  - local observation recency band
- `growthValue`
  - `band`: `strong | moderate | limited | unknown`
  - `skillFamilies`: 去重后的核心能力族
  - `advancedFamilies`: 其中属于进阶能力的能力族
  - `evidence`: 复用原确定性分析中可定位的 evidence，不制造新事实
- `careerSwitchValue`
  - `status`: `suitable | worth_trying | hard_mismatch | unclear`
  - `reasonCodes`
- `risks`: 稳定顺序的结构化风险数组，每项至少有 `code`、`severity`、`reason`
- `priority`
  - `tier`: `S | A | B | C | REVIEW`
  - `reasonCodes`
- `interviewQuestions`: 稳定顺序、去重、最多 6 条；每条至少包含 `code`、`question`、`reason`
- `warnings`
- `assessedAt`

不输出单一 0–100 总分。`priority.tier` 只是当前机会排序轴，不能覆盖 growth / careerSwitch / risk 的独立结论。

## 成长价值 v1

成长能力族直接从现有 `jobNature.evidence` 中 code 为 `ecommerce_core.<family>` 的**正向职责 evidence**提取，不重新解析 JD，不使用 `context.*` 或 `negated.*` 计数。

核心能力族固定为：

- `merchandise`：商品/SKU/上下架等
- `content`：标题、关键词、主图、详情等
- `store`：店铺/平台日常运营
- `campaign`：活动报名、大促
- `data`：数据/竞品/流量/点击/转化/客单/GMV
- `promotion`：推广计划、直通车、万相台、引力魔方、京准通等

进阶能力族固定为：`campaign | data | promotion`。

聚合：

- `strong`：至少 4 个不同核心能力族，且至少 1 个进阶能力族；
- `moderate`：至少 2 个不同核心能力族，但未达到 strong；
- `limited`：岗位性质已经是 `likely_non_ecommerce_ops`；
- `unknown`：其余情况，尤其是 JD / 岗位性质证据不足时。不能把“没匹配到足够关键词”自动解释为低成长。

## 转行价值 v1

目标是“上海电商运营入门/转行候选人”，但不读取或猜测个人隐私信息。

### `suitable`

同时满足：

- job nature = `genuine_ecommerce_ops`
- experience = `no_requirement` 或 `preference_only`

### `worth_trying`

满足任一：

- genuine + `hard_minimum` 且 hard minimum 为 1–2 年；
- genuine + `contradictory`，且没有明确 3 年及以上 hard minimum；
- mixed + (`no_requirement` / `preference_only` / 1–2 年 hard minimum / 可人工澄清的 contradictory)。

### `hard_mismatch`

满足任一：

- job nature = `likely_non_ecommerce_ops`；
- 明确 hard minimum >= 3 年，包括 contradictory 中仍保留的 3 年及以上 JD hard minimum。

### `unclear`

其余信息不足、状态无法可靠组合的情况。

`hard_mismatch` 不等于删除。1–2 年硬门槛保留为 `worth_trying`，因为本产品目标允许把有成长空间但有一定门槛的岗位留给用户人工判断。

## 风险 v1

风险按固定顺序生成并去重。建议 code / severity：

- `explicitly_unavailable` / `high`
- `likely_non_ecommerce_ops` / `high`
- `hard_experience_3_plus` / `high`
- `mixed_role` / `medium`
- `hard_experience_1_to_2` / `medium`
- `experience_contradiction` / `medium`
- `recruiter_stale` / `medium`：`within_half_year | older`
- `platform_stale` / `medium`：`older`
- `link_unknown` / `info`
- `link_unchecked` / `info`
- `analysis_information_gap` / `info`
- `status_information_gap` / `info`
- `older_source_evidence` / `info`：上游 status warnings 表示 recruiter/published 来自旧 observation

unknown / unchecked 只能作为信息缺口，不能被偷偷等价为 unavailable。

## 当前机会优先级 v1

优先级必须可解释、稳定、无静默过滤。

按以下顺序确定：

1. `C`
   - link = `explicitly_unavailable`；或
   - job nature = `likely_non_ecommerce_ops`。
2. `REVIEW`
   - career switch = `unclear`；或
   - 关键上游分析缺失，无法可靠判断。
3. `B`
   - career switch = `hard_mismatch`；或
   - mixed role；或
   - recruiter band 为 `within_half_year | older`；或
   - platform freshness = `older`。
4. `S`
   - career switch = `suitable`；
   - growth = `strong`；
   - link = `available`；
   - recruiter activity 属于 `online_or_just_now | today | within_3_days | within_week`；
   - platform freshness 不为 `older | unknown`；
   - 没有 high / medium risk。
5. `A`
   - 其余 career switch = `suitable` 且 growth = `moderate | strong`，没有 high risk；或
   - career switch = `worth_trying` 且 growth = `strong`，没有 high risk。
6. 其他为 `B`。

link `unknown` / `unchecked` 本身不能触发 C；它只能阻止 S 并保留解释。

## 面试追问 v1

只生成供用户本人阅读和手动询问的问题，不自动发送。稳定顺序、code 去重、最多 6 条。

候选问题：

1. `role_scope`
   - “入职后前 3 个月主要负责哪些电商运营模块？哪些工作会由我独立负责？”
   - 对所有非 `hard_mismatch` 且信息足够的运营候选岗位提供。
2. `non_ops_share`
   - mixed / likely-non 时询问销售、客服、直播、仓储/发货、订单录入等非目标职责的实际占比。
3. `experience_requirement`
   - hard minimum 或 contradictory 时询问 JD 年限到底是硬门槛还是优先条件，以及是否接受转行候选人。
4. `growth_scope`
   - growth != strong 时询问是否实际接触商品、标题/关键词、主图详情、活动、数据和推广中的哪些模块。
5. `data_ownership`
   - 缺少 `data` 能力族时询问日常是否看流量、点击率、转化率、客单价、GMV，以及是否参与复盘。
6. `hiring_status`
   - recruiter stale、platform stale、link unknown/unchecked 时确认岗位是否仍在招聘、HC 和预计到岗时间。
7. `onboarding_growth`
   - suitable / worth_trying 时询问新人带教方式以及多久可以独立负责店铺或模块。

实现按固定优先顺序选择最多 6 条，不得根据缺失事实编造公司制度、晋升路径或培训承诺。

## 持久化

新增 schema v7 表 `job_opportunity_assessments`，append-only：

- `id INTEGER PRIMARY KEY AUTOINCREMENT`
- `job_id` FK
- `rules_version`
- `latest_observation_id` FK
- `jd_observation_id` nullable FK
- `latest_link_check_id` nullable FK
- `source_state_key`
- `growth_band`
- `career_switch_status`
- `priority_tier`
- `assessment_json`
- `assessed_at`
- unique `(job_id, rules_version, source_state_key)`

`source_state_key` 必须包含会改变结果的上游状态：deterministic/status rules version、latest/JD observation IDs、recruiter/published observation IDs、latest link check ID、local recency band。仅时间流逝导致 local recency band 跨 bucket 时也必须形成新的当前 assessment；同一 source state 重复读取必须幂等，不 UPDATE 历史。

读取存储 JSON 时必须 fail closed：校验版本、枚举、索引列、source IDs 与 Job 归属；损坏的当前记录不得静默忽略或强转。

## Repository / refresh integration

新增 `JobOpportunityAssessmentRepository`，至少提供：

- `assessJob(jobId, assessedAt?)`
- `getLatestForJob(jobId, assessedAt?)`
- `refreshAffectedByJobs(jobIds)`
- `refreshAll()`

实现允许 materialize 当前所需的 deterministic/status upstream assessment，但不得改写 JobObservation 原始事实。

刷新顺序：

1. import 原始事实 commit；
2. deterministic analysis refresh；
3. salary refresh（既有链路不变）；
4. link/status refresh；
5. opportunity refresh。

手动 link check commit 后，先刷新 status，再安全刷新 opportunity。Local runtime 启动后，在 deterministic / salary / status backfill 后执行 opportunity `refreshAll()`。

新增类似既有 refresh helper 的固定错误隔离。Opportunity 派生失败不得 rollback 已提交的 import 或 link check，不得向日志输出 JD、公司、路径、token、payload、stack 等私密/原始内容。

`LocalDatabase` 暴露 opportunity repository，供后续 UI / LLM 阶段读取；本批不新增 HTTP 读接口，不新增 popup UI。

## 非目标

本批明确不做：

- LLM / embedding / 简历相似度；
- 单一 0–100 总分；
- Dashboard / local review UI；
- 自动筛掉、删除或隐藏低优先级岗位；
- 自动投递、自动打招呼、自动聊天；
- 私有 API、Cookie/Session、验证码/风控绕过；
- 后台无人值守采集或自动翻页；
- 薪资门槛/城市门槛的新规则；
- 猜测“一年后必然晋升到什么职位”的自然语言职业预测。

## 验收原则

Codex 只实现产品代码，不编写或运行测试。外部网页版 ChatGPT 将独立覆盖：纯规则边界、schema v7、持久化/幂等/损坏读取、upstream source-state 切换、time-only recency bucket、import/link/runtime refresh、失败隔离和全量回归，并据此给出最终验收。