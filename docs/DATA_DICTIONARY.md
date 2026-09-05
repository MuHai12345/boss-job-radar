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

表示对岗位事实快照的可追溯分析，不覆盖原始数据。计划字段方向：

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

## 当前边界

当前实现 Job identity/lifecycle、observation linking、ImportRun、SearchRun provenance 与幂等导入；不实现 observation dedupe、最终 aggregate facts、JobAnalysis、用户审核状态或自动 merge/reconciliation。Batch 5 实现等待外部审阅。
