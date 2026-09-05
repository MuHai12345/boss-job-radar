# Phase 5 / Batch 1：确定性岗位与经验分析

## 本轮范围与执行计划

基线：`master` / `148f244a0501017a147889be3f31615f9e6b5c60`。按本轮外部 Prompt 实现，不改变产品原则；单一 implementation commit 后推送 origin/master。

1. 为 `src/domain/analysis/` 编写纯函数定向测试：section、A–E 岗位性质、否定、header、JD 硬门槛/偏好/无要求、矛盾及原文 evidence；确认未实现时失败，再实现版本化规则和完整 runtime validator。
2. 为 analysis repository 编写来源选择、幂等历史、stale、JSON 损坏、v3→v4 数据保留与 backfill 测试；新增 migration 与独立 repository，不修改 observation facts。
3. 为导入提交后的分析异常及启动 backfill 异常编写定向验证；接入 ImportRepository 与 local runtime，分析失败只输出固定 generic diagnostic，继续采集。
4. 更新 ADR-0012、README、PROJECT_STATE、DATA_DICTIONARY、能力矩阵。运行本批定向 tests、typecheck、lint、build:local、diff --check；记录实际结果后 commit / push。

执行方式：本会话顺序实现。附件已给定 source selection、schema、状态和 failure isolation 设计；设计记录放在指定 ADR，计划与事实日志放在本文件。不另设产品审批或提前进入下一批。

## Developer verification

以下均为本批 developer verification，不等于 external acceptance。

| 命令 | 结果 |
| --- | --- |
| `npm test -- tests/deterministic-job-analysis.test.ts tests/deterministic-analysis-repository.test.ts tests/deterministic-analysis-integration.test.ts tests/database-migrations.test.ts tests/import-repository.test.ts tests/local-database.test.ts tests/local-runtime.test.ts` | 7 files / 130 tests 通过 |
| `npm test -- tests/observation-repository.test.ts -t "preserves observations across close and reopen"` | 1 test 通过；同文件其他 17 tests 未运行 |
| `npm run typecheck` | exit 0 |
| `npm run lint` | exit 0 |
| `npm run build:local` | exit 0 |
| `git diff --check` | exit 0；Git 提示现有 CRLF 策略下会转换 LF，无 whitespace error |

未运行 full npm test、全部 DOM tests、Phase 4 HTTP security suite、Chrome/Edge build 或 manifest verification。扩展、bridge 与 HTTP security contract 未修改；HTTP failure isolation 在新增定向 integration test 中验证。

规则与 repository 测试先于实现写入；初次运行因新模块尚不存在而失败。自动刷新测试在接入前 4 项失败，接入后通过。开发过程中新增数字边界及同句软硬经验测试，复现 3 个失败断言；修复了不支持年限的部分数字匹配，以及软偏好掩盖独立硬要求的问题，当前规则测试 82 项通过。

## 实际实现

- `src/domain/analysis/`：纯类型、显式 v1、section parser、集中岗位性质规则、header/JD 经验规则、矛盾、证据与 JSON runtime validator。
- SQLite v4：独立分析表及来源排序索引；analysis repository 提供 analyzeJob/getLatestForJob/refreshAll。
- 来源：Job latest pointer 与最近非空 JD 分别选取、分别持久化；验证旧 detail + 新 search 复用、同时间戳较大 ID、空白 JD 排除及无 JD 时 unknown。
- 历史：同 latest/rules 键幂等，新 latest 追加；getLatestForJob 不返回 stale，损坏 JSON/索引列不一致 fail closed。
- 自动刷新：Import 源事务 commit 后逐 Job 分析；启动 HTTP listener 后 backfill。单 Job 分析失败不妨碍其他 Job，日志仅固定 generic 文本。
- 隔离验证：SQLite trigger 人为拒绝 analysis insert 后 HTTP 返回 201；ImportRun、SearchRun、Observation、Job 在关闭/重开后仍存在，解除 trigger 后可补齐。启动刷新失败后 health 与后续保存仍可用。
- v3 migration fixture 从原始 base 的真实 schema 导出，只含 schema 和合成 ledger，无用户数据；验证迁移保留 Jobs、observations、ImportRun、SearchRun，migration 本身不生成分析。
- 无新增依赖；未触碰真实 production app-data，只用内存库与临时合成测试数据库。

## 续接现场

收到续接 Prompt 后执行 `git status --short`、`git diff --stat`、`git diff`、`git diff --cached`、`git log -10 --oneline`、`git rev-parse HEAD`。Starting HEAD 仍为 `148f244a0501017a147889be3f31615f9e6b5c60`，存在未提交实现且无 staged diff，属于情况 B。保留全部已有正确代码，从尚未同步的 PROJECT_STATE 和最终验证继续；未 reset、clean、丢弃文件或开始下一批。

## 状态与限制

Phase 4 与 Capability 7 的 VERIFIED 状态来自本轮外部 Prompt。Capability 8、9 为 IMPLEMENTED_AWAITING_REVIEW；矩阵仍为 15 项（7 verified / 2 awaiting review / 6 not started）。Phase 5 为 IN PROGRESS / NOT YET PASSED，本批为 implementation_complete_awaiting_external_review。

无已知实现阻塞。v1 是保守文本规则，不做复杂 NLP；未覆盖的措辞可能保持 insufficient_evidence。按指定唯一键，同 latest/rules 已存在时不重选 JD 或覆写分析；损坏当前分析 fail closed，不自动修改历史。具体语义见 ADR-0012。总分、成长性、招聘时效、LLM、审核 UI 及其他后续能力均未实现。

提交目标：单一 `feat: add deterministic job and experience analysis` implementation commit，推送 `origin/master`；实际 SHA 与 push/working tree 结果由最终报告记录，避免日志自引用 commit SHA。
