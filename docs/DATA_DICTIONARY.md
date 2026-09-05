# 数据字典基线

本文记录核心实体的当前已实现边界与未来字段方向。标为当前 schema 的字段已经落地；其余规划字段不代表已经实现。

## 时间与未知值原则

以下概念必须独立保存，不能互相冒充或由一个字段猜测另一个字段：

| 概念 | 建议字段 | 含义 |
| --- | --- | --- |
| 招聘者活跃时间 | `recruiter_activity_at` / `recruiter_activity` | 平台展示的招聘者最近活跃信息，可能是精确时间、相对描述或未知。 |
| 岗位发布时间 | `published_at` | 平台明确展示的岗位发布时间；未可靠取得时为未知。 |
| 程序第一次发现时间 | `first_seen_at` | 本程序第一次记录该岗位的时间。 |
| 程序最后一次看到时间 | `last_seen_at` | 本程序最近一次在用户当前页面中观察到该岗位的时间。 |
| 程序最后检查时间 | `last_checked_at` | 本程序最近一次执行自身检查或观察处理的时间。 |

明确禁止以下替代关系：

- `recruiter_activity` 不等于岗位发布时间。
- `first_seen_at` 不等于岗位发布时间。
- `last_seen_at` 不等于招聘者活跃时间。
- `last_checked_at` 只表示程序自身检查时间。

无法可靠获得的平台字段应使用 `null`、`unknown` 或等价的明确未知状态，不得根据其他字段推测。

## `Job`

表示可跨观察持续识别的岗位主体。schema version 2 的 `jobs` 只保存 identity 与观察生命周期：

- `id`：本地 Job 主键；
- `job_url`：canonical Job 的唯一强身份字符串；非 NULL 时按 exact equality 匹配；
- `unresolved_observation_id`：无可靠 URL 时指向创建该 unresolved Job 的 observation；
- `first_seen_at`：所属 observations 中最早的 `captured_at`；
- `last_seen_at`：所属 observations 中最新的 `captured_at`；
- `latest_observation_id`：按 `captured_at`、再按 observation id 选出的最新 observation。

`job_url` 与 `unresolved_observation_id` 严格二选一。NULL URL 不使用 title、company、location、salary、JD、`job_href_raw` 或 `source_page_url` 弱匹配，每条 observation 各自建立 unresolved Job。`jobs` 当前不复制岗位标题、公司、薪资、JD、经验、学历或 tags；展示事实应从 latest observation 取得，避免 aggregate copy 与原始历史漂移。用户审核状态、平台岗位标识与最终事实聚合仍属未来能力。

## `JobObservation`

表示某次用户页面观察中获得的永久事实快照，用于区分平台事实与后续 identity 或分析。当前 schema 保存：

- `id`、本地生成的 `job_id` 与 nullable `import_run_id`；HTTP input 不能指定这些数据库关联；
- `captured_at`、`page_type` 与 `source_page_url`；
- `job_href_raw` 与 canonical `job_url`；
- 当次观察到的 title、company、salary、location、experience、education 与 tags 原始事实；
- `recruiter_activity_text`、`published_text`、`full_jd_text` 与 `raw_text`；
- `missing_fields` 与 warnings。

observation 永久 append-only；不同用户点击即使 payload 或 `job_url` 相同仍产生新的 observation id，不执行 observation dedupe。同一 `clientImportId` 的相同请求重放返回原 IDs，不代表新的页面观察。新 HTTP import 的 `import_run_id` 必须有值；v1/v2 历史 observation 保持 `NULL`，读取正常，不按时间或 URL 猜测来源。底层直接 append API 仍允许无 import provenance。`last_checked_at` 和可解析的活动/发布时间仍属未来能力。

## `ImportRun`

schema version 3 的 `import_runs` 表示一次用户保存动作的持久导入事务：

- `id`：本地主键；
- `client_import_id`：每次点击 fresh CSPRNG UUID v4，唯一且非空；只在客户端当前保存调用内存中存在，服务端持久记录；
- `payload_sha256`：固定字段顺序序列化 `source` 与 `observations` 后的 SHA-256；不包含 token、headers、client ID 或服务端时间，只用于 import replay detection；
- `page_type`、`source_page_url`、`captured_at`：直接来自 structured extraction；
- `matched_card_count`：搜索页实际匹配数量，详情页为 `NULL`；
- `extraction_warnings_json`：页面 extraction warnings 原值、原顺序；
- `observation_count`：本次实际保存的 observation 数量；
- `created_at`：服务端创建时间，不替代 `captured_at`。

相同 client ID 与相同 fingerprint 返回该 ImportRun 下按 id 排序的原 observation IDs；相同 ID 与不同 fingerprint 返回 `409 { "error": "import_conflict" }`，不写入。新 ID 总是创建新 ImportRun 和 observations，并继续复用同一 canonical Job。runtime validation、fingerprint、provenance、observation append、Job resolve/link 与 lifecycle 更新在同一事务内完成，失败全部 rollback。

## `SearchRun`

schema version 3 的 `search_runs` 只在 `source.pageType === 'search_results'` 的保存事务中创建，表示这次搜索结果页保存的事实：

- `id`：本地主键；
- `import_run_id`：唯一且非空的 ImportRun 外键，每个搜索 import 恰有一条；
- `captured_at`、`source_page_url`：structured extraction 原始来源；
- `matched_card_count`：页面实际匹配数量；
- `saved_observation_count`：实际保存数量；
- `extraction_warnings_json`：页面 extraction warnings 原值与原顺序；
- `created_at`：服务端创建时间。

例如页面匹配 143 张卡片、解析上限保存 100 条时，分别保存 143 与 100，并保留 `card_limit_reached`。详情页只创建 ImportRun，不创建 SearchRun。空 extraction 不访问 localhost，也不创建任何 run。

当前没有可靠 structured source 来记录搜索词、query string 或 BOSS filters，因此不解析或推断这些字段。历史 observation 不反推 SearchRun。本次观察到的 Jobs 通过 `SearchRun → ImportRun → JobObservations → job_id` 查询，不增加 `job_search_runs`。

## `JobAnalysis`

表示对岗位事实快照的可追溯分析，不覆盖原始数据。本批具体实现见下方 `DeterministicJobAnalysis`；其余未来字段方向：

- 分析标识；
- 关联岗位和所依据观察版本；
- 分析时间；
- 分析方法/规则版本；
- 岗位性质；
- 入门可行性；
- 经验门槛；
- 岗位状态；
- 岗位适合度；
- 当前机会优先级；
- 成长价值；
- 风险标记；
- 解释依据；
- 面试追问建议；
- 未知项和置信信息。

用户审核状态属于用户事实，不能被 `JobAnalysis` 的模型或规则结论擅自替代。

## `DeterministicJobAnalysis`

schema version 4 新增 `deterministic_job_analyses`，独立于原始事实，当前规则版本为 `deterministic-job-analysis-v1`。

| 列 | 含义 |
| --- | --- |
| `id` | INTEGER 自增主键 |
| `job_id` | NOT NULL，指向 jobs |
| `latest_observation_id` | NOT NULL，指向分析时 jobs.latest_observation_id；提供当前 title/header/tags |
| `jd_observation_id` | nullable，指向同 Job 中 captured_at DESC、id DESC 的最近非空完整 JD；无 JD 为 NULL |
| `rules_version` | 显式规则语义版本，不使用日期或 commit SHA |
| `job_nature_status` | genuine_ecommerce_ops / mixed_ecommerce_ops / likely_non_ecommerce_ops / insufficient_evidence |
| `experience_status` | no_requirement / preference_only / hard_minimum / contradictory / insufficient_evidence |
| `hard_minimum_years` | JD 明确年限的最大值；未提取为 NULL，header 年限不填入此列 |
| `analysis_json` | 完整结构化结果，读取必须 runtime validate |
| `analyzed_at` | 本机分析记录创建时间，不替代 captured_at 或平台时间 |

唯一键 `(job_id, latest_observation_id, rules_version)`。同键幂等，不更新旧分析；新 latest/rules 键追加历史。所有来源都有 observation 外键，repository 另核对 Job 归属。

JSON 保存 jobId、rulesVersion、source、jobNature、experience 与 warnings。experience 包含标准化 header（kind/minYears/maxYears）、JD（status/hardMinimumValues/hasPreference/hasNoRequirement）、最终 status/hardMinimumYears、contradiction codes 和 evidence。无 JD 时两轴最终状态均为 insufficient_evidence，header 解析仍保留。

Evidence 为 `code/source/section/excerpt`，excerpt 是最多 160 chars 的原文连续片段。full_jd 指向 jdObservationId，title/header_experience/tags 指向 latestObservationId。复用旧 JD 保存 `jd_from_older_observation`；多个不同硬年限保存 `multiple_hard_minimum_values`，并保留全部 evidence。具体阈值、否定、软偏好和矛盾语义见 [ADR-0012](decisions/ADR-0012-deterministic-job-analysis-v1.md)。

`LocalDatabase.analyses` 提供 `analyzeJob(jobId)`、`getLatestForJob(jobId)`、`refreshAll()`。读取当前结果只匹配当前 latest/rules；尚未分析返回 null，损坏 JSON 或列/JSON 不一致抛固定错误。没有历史删除或人工覆写 API。

导入源事实先 commit，再独立事务分析受影响 Jobs；启动 HTTP 后 refreshAll 补已有 Jobs；重复补齐不插重复行。分析异常不撤销采集、不阻止服务或保存，仅记录固定 generic diagnostic。Migration 不分析业务文本。

## 当前边界

当前实现 Job identity/lifecycle、observation linking、ImportRun、SearchRun provenance、幂等导入，以及独立确定性岗位性质和经验分析；不实现 observation dedupe、最终 aggregate facts、其余分析维度、用户审核状态或自动 merge/reconciliation。Phase 4 已获外部 PASS；Phase 5 / Batch 1 已获外部 PASS；Batch 2 薪资解码实现等待外部审阅。

## SearchRun salary derived data（schema version 5）

`JobObservation.salaryText` 始终是原始事实，不 UPDATE、去 PUA 或 normalize。详情只提供 evidence，不生成 SearchRun decoding；无 SearchRun provenance 的列表观察不解码，NULL salary 不创建结果。

| 表 | 列与含义 |
| --- | --- |
| `search_run_salary_mappings` | `search_run_id` 主键/FK；`rules_version` 固定为 `search-run-salary-mapping-v1`；`status` active/conflicted；`characters_json` PUA→ASCII digit 对象；`revision` 从 0 开始；`evidence_count` 累计记录的 evidence 数（含 rejected 和被替换候选）；`selected_evidence_json` 当前选择的 searchObservationId:detailObservationId 键列表；`updated_at` 派生更新时间 |
| `salary_mapping_evidence` | `id`；`search_run_id`、`search_observation_id`、`detail_observation_id`、`job_id` 外键；`result` learned/rejected/mapping_conflict/state_conflicted；`rejection_reason` nullable core rejection reason；`created_at`；唯一键 (search_run_id, search_observation_id, detail_observation_id) |
| `salary_decoding_results` | `id`；`observation_id`、`search_run_id` 外键；`mapping_revision`；`status` plain_text/verified_mapping/incomplete_mapping/mapping_conflict/invalid_input；`decoded_text` nullable；`unresolved_characters_json` 未知 PUA 字符数组（包含补充平面）；`created_at`；唯一键 (observation_id, mapping_revision) |

新 revision 追加解码结果，不更新历史。只读当前结果时 join 当前 SearchRun mapping revision；缺当前记录返回 null，不回退旧 revision。mapping revision 对新增字符或首次进入冲突递增，重复或未新增字符的 evidence 不递增。若较近或同时间较高 ID 的详情在后续才保存，替换候选并重建当前有效证据集合，实际状态变化另追加 revision 以失效旧解码；旧 evidence/results 不删除。conflicted 状态保持关闭。

证据时间采用 observation capturedAt，允许 0 到 24h（含端点），与启动时钟无关。映射与解码不含原始 salary 副本，原文通过两个 observation IDs 追溯。各 Run 在独立事务内写入 mapping/evidence/results，任一派生写入失败该 Run 整体回滚，其他 Runs 可继续；已提交的事实和确定性分析不受影响。migration 只建结构，backfill 在服务启动后的 repository refresh 执行。
