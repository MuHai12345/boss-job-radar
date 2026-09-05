# Phase 5 / Batch 2：SearchRun 范围薪资解码

- 日期：2026-09-05
- 分支：master
- Base commit：`7f7ff619ca03c1855a2fdd0d1fa88731207d1328`
- 实现状态：`implementation_complete_awaiting_external_review`
- 外部已确认：Phase 0–4、Phase 5 / Batch 1 为 PASS；Phase 5 为 IN PROGRESS / NOT YET PASSED。

## 本轮范围与执行

按 AGENTS.md、产品宪章、项目状态、架构、相关 ADR、数据字典、能力矩阵及真实代码读取当前状态；基线与外部 Prompt 一致，初始工作区干净。在本地 master 实现本轮明确任务，不开启下一批。

执行顺序：先增加 mapping/repository 定向测试并确认新模块缺失导致失败，再添加 schema v5 与有限 repository API；接入事实提交后的独立刷新与启动 backfill；补 migration/reopen/HTTP failure isolation；同步文档，运行必要 developer verification，单一 implementation commit 后 push origin/master。

新增三张派生表，SearchRun 独立 mapping，same-Job + 明文详情 + 向后 24h 的候选选择，core 结构验证，revision 与 append-only decoding history。原始 observation salary、Job identity、parser selectors、DOM extraction、URL policy、extension 和 manifest 均未改变。没有依赖新增，没有真实 BOSS 访问或生产数据库操作。

Evidence 选最近时间、同时间最大 ID；重复 pair 不重复新增 evidence 或 revision。无新增字符的合法 evidence 保留 provenance 但不增加 revision。冲突只关闭当前 Run，plain salary 仍保留明文；incomplete 只保存未知字符而不输出部分解码。NULL salary 不创建假结果。

迟到的较近详情会替换当前候选，重建当前选择集合，状态变化才追加 revision；被替换 evidence 和全部旧 decoding results 保留。此边界及 revision 失效语义在 ADR-0013 中明确记录并定向覆盖，不合并同一搜索 observation 的多个详情。

## 实现中发现并修复的相关边界

core 原先遇到映射冲突立即返回，可能漏掉后部结构不匹配。新增两条测试在修改前均明确失败：应 rejected/non_pua_mismatch，实际 mapping_conflict。改为完成整段结构验证后才确认冲突；原有 mapping core 测试同时通过。没有另写映射算法。

schema 升级使现有 database/runtime/observation/analysis migration 测试中的 v4 ledger 断言过期。只更新直接受影响的版本预期；future-schema fail-closed 测试改为 v6 对 v5。不修改其他历史 DOM 或安全测试。

## Developer verification

以下最终命令全部 exit 0；仅为开发验证，不代表 external acceptance：

```text
npx vitest run tests/salary-character-mapping.test.ts tests/salary-decoding-repository.test.ts tests/salary-decoding-integration.test.ts tests/database-migrations.test.ts tests/local-runtime.test.ts tests/deterministic-analysis-repository.test.ts tests/deterministic-analysis-integration.test.ts tests/import-repository.test.ts tests/local-database.test.ts tests/local-database-initialization-failure.test.ts tests/observation-repository.test.ts
11 files / 107 tests passed

npm run typecheck
npm run lint
npm run build:local
git diff --check
```

覆盖内容：

- 冻结 v4 fixture 来自本轮 base；升级前已有五类事实/分析数据，逐表逐行保持一致，FK clean，migration 不生成派生行。
- plain、动态真实已知 synthetic shape `\ue038-\ue039K → 8-9K`、同 Run 其他卡片解码、补充平面未知 PUA、NULL/empty、incomplete 历史。
- 同 Run conflict、两 Run 相同 codepoint 不同数字的 rotation、不同 Job、不足/超出 24h、before search、PUA/blank detail、结构拒绝及最近候选选择。
- 新字符、重复/无新增字符 evidence、首次 conflict、迟到候选替换、被拒绝候选替换后的旧解码失效、current revision 缺失不返回旧值。
- 自动 search/detail import、import replay、file-backed reopen、重复 refreshAll 完全保持三张派生表快照。
- 三张派生表逐一注入 insert failure，HTTP 201，Jobs/Observations/ImportRuns/SearchRuns/deterministic analyses 仍已提交；诊断仅固定 generic 文本，不含敏感 sentinel。
- startup backfill 成功/失败均能启动 HTTP；单 Run 派生事务失败回滚完整 revision，其他 Run 继续，解除故障后可补齐。

未运行 full npm test、全量历史 DOM 测试、完整 Phase 4 security suite、Chrome/Edge build 或 manifest verification；当前改动不需要这些宽泛检查。

## 提交与外部审阅

提交信息：`feat: add search-run scoped salary decoding`，目标 `origin/master`，不强推、不重写历史。提交前远端 master 与 base 一致。默认 Git 连接因失效的本机代理失败，使用单命令 `git -c http.proxy= -c https.proxy= ...` 成功读取远端；不修改持久 Git 或系统代理配置。实际 commit SHA、push 结果与最终工作区状态见本轮最终报告。

能力矩阵：8、9 依据外部 PASS 更新 VERIFIED；15 为 IMPLEMENTED_AWAITING_REVIEW；10–14 保持 NOT_STARTED。合计 9 VERIFIED、1 awaiting review、5 remaining。

未发现待修复的本轮实现问题；最终验收由外部网页版 ChatGPT 决定。无全局映射、字体逆向、私有 API、LLM、薪资排序、招聘时效、自动浏览/投递或审核 UI。

提交补记：implementation commit 为 `0be73b9`。staged diff 检查发现冻结 SQL fixture 的空白行仍有尾随空格；首次清理未去除 CRLF 行末前空格，implementation commit 已生成。随后单独提交纯格式修正及本条事实记录，保留有效提交历史，不 amend 或重写。最终 base→HEAD diff 检查结果见最终报告。
