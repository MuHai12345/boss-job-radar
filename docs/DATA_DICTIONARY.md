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

- `id` 与本地生成的 `job_id`；HTTP input 不能指定 `job_id`；
- `captured_at`、`page_type` 与 `source_page_url`；
- `job_href_raw` 与 canonical `job_url`；
- 当次观察到的 title、company、salary、location、experience、education 与 tags 原始事实；
- `recruiter_activity_text`、`published_text`、`full_jd_text` 与 `raw_text`；
- `missing_fields` 与 warnings。

observation 永久 append-only；相同 payload 或相同 `job_url` 再次保存仍产生新的 observation id，不执行 observation dedupe。SearchRun 关联、`last_checked_at` 和可解析的活动/发布时间仍属未来能力。

## `SearchRun`

表示用户本人一次搜索/浏览活动对应的程序记录范围，不表示后台自动搜索。计划字段方向：

- 搜索运行标识；
- 开始与结束时间；
- 城市（当前固定为上海）；
- 搜索词或用户可见筛选条件；
- 页面来源；
- 观察到的岗位数量；
- 成功、部分完成或失败状态；
- 缺失字段、解析异常和人工验证备注。

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

当前只实现 Job identity/lifecycle 与 observation linking，不实现 SearchRun、幂等导入、最终 aggregate facts、JobAnalysis、用户审核状态或自动 merge/reconciliation。
