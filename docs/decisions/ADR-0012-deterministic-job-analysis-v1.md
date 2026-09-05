# ADR-0012：确定性岗位性质与经验要求分析 v1

- 状态：Phase 5 / Batch 1 实现完成，等待外部审阅
- 日期：2026-09-05
- 依据：本轮外部 Prompt 明确批准的 Phase 5 / Batch 1 设计

## 原始事实与派生结论

`JobObservation` 永远是原始事实。分析只写入独立的 `deterministic_job_analyses`，不更新 title、experienceText、tags、JD、Job identity 或观察历史。任何分析状态都不删除、隐藏岗位，不限制未来 UI 展示或用户投递。没有总分、排序、成长性、招聘时效、LLM 或审核 UI。

## Analysis Source Selection

- 最新页面事实来自 `jobs.latest_observation_id`；title、experienceText、tags 使用该 observation 的原值。
- JD 从同一 Job 的全部 observations 中选择：`full_jd_text IS NOT NULL AND trim(full_jd_text) != ''`，按 `captured_at DESC, id DESC`。另用 JavaScript `trim()` 排除仅含 tab、换行或 Unicode 空白的文本。不以 page_type 限制已有事实。
- 分别记录 `jobId`、`latestObservationId`、`jdObservationId | null`。不创建合并后的假 observation。
- JD 来源与最新观察不同，保存非阻塞 `jd_from_older_observation`。之后保存列表不会抹掉既有完整 JD 证据。
- 没有 JD 时，岗位性质与最终经验状态都为 `insufficient_evidence`；仍保留 normalized header 和来自 title/tags 的上下文 evidence。

## 规则版本与历史

显式版本固定为 `deterministic-job-analysis-v1`，持久化到列和 JSON。规则文本、聚合阈值和解析语义都属于该版本。未来修改语义必须增加版本并保留旧版本实现/读取 contract；不能以日期或 commit SHA 作为版本。

唯一键为 `(job_id, latest_observation_id, rules_version)`。同一键重复分析返回原记录，不 UPDATE。不同最新观察或未来新规则版本可追加历史。若导入较早 captured_at 的详情没有改变 latest pointer，而当前键已经存在，该键的 JD 来源也保持首次分析时的选择；遵守本批明确的幂等键，不偷偷改写旧结果。通常后续保存产生新的 latest observation 后才形成新分析。

`getLatestForJob` 只查询当前规则与当前 latest pointer；未补分析时返回 `null`，不将旧历史伪装为当前结论。当前 API 不提供删历史、人工改分或 LLM override。

## Section 与岗位性质规则

按行识别职责和要求 heading；支持常见编号、括号、冒号和 heading 后同行正文，保留原文片段。section 持续到下一已知 heading，其他为 `unknown`。不做复杂 NLP。

`job-nature-rules.ts` 集中定义六个核心能力族（商品、内容搜索、店铺平台、活动、数据、推广）与五个偏离职责族（销售、客服、直播执行、仓储履约、订单录入）。同族采用最长优先且不重叠的匹配，避免 `在线客服接待` 被拆成两个独立信号。

职责证据须来自 JD，且满足其一：在职责 section；或在 unknown section 的同一行出现 `负责/承担/通过/完成/维护/分析/协助/执行/进行/主要/日常` 之一。要求 section、title 和 tags 仅作为 `context.<family>` evidence，不计入职责聚合。这是 v1 对上下文权重的固定实现。

紧邻 phrase 前的 `不/无需/不需要/不涉及`，可接 `负责/承担/从事/进行`，作为简单否定。保留 `negated.<family>` evidence，但不计为正向职责。无匹配 phrase 的泛词（如“客服”）不会生成独立偏离证据。不处理复杂反讽、跨句否定或完整语义消歧。

| 状态 | v1 聚合条件 |
| --- | --- |
| `genuine_ecommerce_ops` | 非空完整 JD 至少 16 chars；至少两个不同核心职责能力族，且无正向偏离职责族 |
| `mixed_ecommerce_ops` | 同样的实质核心职责，加上至少一个正向偏离职责族 |
| `likely_non_ecommerce_ops` | JD 至少 16 chars、无核心职责族，且至少两个偏离职责族或同族至少两个不同且不重叠的职责 phrase |
| `insufficient_evidence` | 无 JD、过短或未达到上述证据阈值；只有一个核心能力族也保守留为未知 |

内部只使用有限族/phrase 数量，不输出最终总分。标题“运营助理”不能单独支持 genuine。

## 经验与矛盾语义

Header 独立标准化为 `unlimited/range/up_to/minimum/unknown`，保留 min/max 或 null。v1 支持经验不限、年以内、年以下、范围（横线/至）和年以上。`hardMinimumYears` 只来自 JD，绝不从 header 或 title 补出；header 仍完整保存其解析结果。

JD 以行、标点及明确连接词（并且、而且、同时、但是、且、但）分条款，识别 `至少 N 年` / `N 年以上`；阿拉伯数字支持 1–99，中文支持一、二、两至十。不将不支持的较长数字部分匹配为较小年限。职责段的时长和明确公司历史、计划、合同、保修语境不作为经验年限。

包含经验“优先/加分”的条款是软偏好，不提取其年限为 hard minimum。接受无经验、应届等明确表达作为无要求 evidence。明显紧邻否定的年限不提取。多条明确 hard minimum 保留全部 evidence，distinct values 升序保存，最大值为 `hardMinimumYears`；distinct > 1 增加 `multiple_hard_minimum_values`，本身不强行判矛盾。

JD 状态优先级：hard + no requirement → `contradictory`；hard → `hard_minimum`；preference（可同时接受新人）→ `preference_only`；no requirement → `no_requirement`；无明确证据 → `insufficient_evidence`。没有写经验要求不等于明确“不限”。

| 矛盾 code | 触发条件 |
| --- | --- |
| `header_unlimited_vs_jd_hard_minimum` | header 经验不限，JD 有硬年限 |
| `header_max_below_jd_minimum` | header max 小于 JD 明确最大 minimum |
| `header_minimum_vs_jd_no_requirement` | header min > 0，JD 明确接受无经验/应届 |
| `header_minimum_vs_jd_preference` | header min > 0，JD 只有软偏好而无 hard minimum |
| `jd_no_requirement_vs_hard_minimum` | JD 内同时存在硬年限与明确无要求 |

任一矛盾存在，最终 experience status 为 `contradictory`，保留所有 header/JD 结构与 evidence。真实已知样例 `1年以内` + `工作2年以上` 为 contradictory，minimum=2。`1-3年` + `1年经验优先` 同样显式记录 mismatch，但 minimum=null；不能把“优先”升级成硬门槛。Header 下限高于 JD minimum 但范围仍能满足时不自动判冲突。

以上实现名称与经验输入限制以本轮 Prompt 为准；早期 `DOMAIN_RUBRIC.md` 是规划骨架，其旧名称不是此持久化 contract，标题不参与本批经验推断。

## Evidence contract 与读取

每条 evidence 包含非空 rule `code`、`source`（title/header_experience/full_jd/tags）、`section`（responsibilities/requirements/unknown）和最多 160 chars 的原文连续 `excerpt`。不改写引文、不重复存整份 JD。full_jd 定位到 jdObservationId，其余定位到 latestObservationId。unknown header 也可保留原文 evidence。

`analysis_json` 保存完整结构。读取先解析为 unknown，再递归验证版本、ID、状态枚举、header 边界、JD 数值/布尔值、evidence、warnings 与矛盾一致性；另核对 JSON 与索引列以及来源 Job 归属。损坏或不支持的当前 analysis 抛固定错误，不强制转换类型、不返回半可信对象、不覆盖旧记录。旧版本行不会被当前查询取出。

## Schema v4、刷新与失败隔离

Migration 仅创建分析表和 Job observation 来源查询索引，不进行业务文本分析。新增字段见数据字典。

ImportRepository 先完成原有 import transaction 的 commit，再去重本次返回 IDs 对应的 Job IDs，对每个 Job 在独立事务中分析；幂等 replay 也可补之前失败的分析。单 Job 失败不阻止其余受影响 Jobs。

Local runtime 在 HTTP listener 建立后调用 `refreshAll()`。它只查缺少当前 latest/rules 键的 Jobs，逐 Job 事务补齐；重复执行不增加同键行，一个 Job 失败仍继续其他 Job。SQLite 打开本身不执行 backfill，分析 SQL 延迟到实际操作时 prepare。

Import 自动刷新和启动 backfill 的异常只记录固定 `Deterministic analysis refresh failed.`，不输出 error 对象、JD、title、company、路径、token、payload 或 stack。分析失败不会 rollback 已 commit 的 ImportRun/SearchRun/Observation/Job，HTTP save 仍成功，用户可继续保存，后续 refreshAll 可以补齐。无新增网络或模型依赖。
