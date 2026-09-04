# ADR-0010：Job identity、dedupe 与 observation linking

- 状态：Phase 4 / Batch 4 实现完成，等待外部审阅
- 日期：2026-09-04

## 背景

schema version 1 只保存 append-only `job_observations`。同一 canonical 岗位被用户反复保存时，系统能保留每次事实快照，但无法表达这些 observations 属于同一个持续存在的岗位主体，也没有 first seen、last seen 或 latest observation pointer。

## 决策

- `Job` 与 `JobObservation` 分离。observation 永久 append-only，Job 只承担 identity 与观察生命周期。
- 唯一自动 strong identity 是已保存的非 NULL `jobUrl` 字符串，并按 exact equality 匹配。identity layer 不 trim、lowercase、重写协议、decode/re-encode 或再次 canonicalize。
- 禁止使用 title、company、location、salary、experience、JD、`jobHrefRaw` 或 `sourcePageUrl` 做自动 dedupe。
- `jobUrl === null` 时不猜 identity；每条 observation 创建一个独立 unresolved Job，以 `unresolved_observation_id` 明确来源。
- schema version 2 新增 `jobs`，包含 `job_url`、`unresolved_observation_id`、`first_seen_at`、`last_seen_at` 与 `latest_observation_id`；identity 两列严格二选一且分别唯一。
- `job_observations.job_id` 关联 Job。迁移对所有 v1 observations 回填：非 NULL URL exact group 共用 Job，NULL URL 各自独立，且不删除或覆盖任何 observation。
- first/last seen 来自 `captured_at`。latest observation 先按 `captured_at`，相同时按更大 observation id 决定。
- `append` 与 `appendMany` 在同一事务内完成 observation insert、Job resolve/create、link 和 lifecycle update；任一步失败全部 rollback。
- `JobRepository` 只提供 `getById` 与 `findByJobUrl`。HTTP request contract 仍不接受 `jobId`，成功响应仍只有 observation `ids`。

## 明确未包含

- 不做 observation dedupe、幂等导入或 SearchRun。
- 不做 unresolved → canonical reconciliation、manual merge 或 delete。
- `jobs` 不保存 title、company、salary、JD、experience、education、tags 等 final aggregate facts。
- 不做 JobAnalysis、AI、review status 或 Dashboard。

## 结果

同一 canonical URL 的多次 observations 关联同一个 Job，同时完整保留 changed-fact 历史。URL 不可靠或缺失时系统优先避免错误合并。该实现仍需外部网页版 ChatGPT 独立审阅；Phase 4 保持 `IN PROGRESS / NOT YET PASSED`。
