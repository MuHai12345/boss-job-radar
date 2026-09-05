# ADR-0013：SearchRun 范围的可信薪资 PUA 解码

- 状态：Phase 5 / Batch 2 实现完成，等待外部审阅
- 日期：2026-09-05
- 依据：外部 Prompt 指定的本批设计；不改变产品原则或采集方式

## 原始事实与派生存储

`JobObservation.salaryText` 永久保留用户当前页面的原始文本，包括 PUA。解码仅写入独立的 `search_run_salary_mappings`、`salary_mapping_evidence`、`salary_decoding_results`。schema 4→5 只创建结构，不在 migration 中学习或猜测历史映射，既有 Jobs、Observations、ImportRuns、SearchRuns 和 deterministic analyses 完整保留。

每个 SearchRun 从 empty active mapping、revision 0 开始，规则版本固定为 `search-run-salary-mapping-v1`。相同 PUA 在不同 Run 可以映射到不同数字；不存在全局缓存或永久全局映射。

## 证据选择与结构校验

只处理通过 `search_runs.import_run_id → import_runs → job_observations` 明确关联的 search_results observations。搜索薪资须包含至少一个 Unicode Private Use 字符。detail 必须为同 canonical `jobId` 的 job_detail observation，薪资非 NULL、非空白且不含任何 PUA。不按 title、company 或 salary shape 猜测同一 Job，不推断历史搜索 provenance。

采用两个 observation 的 capturedAt：`0 ≤ detail - search ≤ 24h`，包含端点，与当前时间无关。多个候选按时间差最小优先，同时间选择 observation id 最大的一条。先选候选再验证结构；最近候选结构失败不回退另一个较晚薪资，也不同时使用多个详情解释同一条搜索薪资。

复用 `learnSalaryCharacterMapping()` 验证 codepoint 长度、非 PUA 字符一致性、PUA 对应 ASCII 数字及已有映射冲突。为满足无效证据不得污染映射的要求，core 完整检查结构后再返回 conflict，避免前部字符冲突掩盖后部 `non_pua_mismatch`。结构失败记录 core rejection reason，不更新 active characters，不抛成数据库错误。

## Revision、冲突与候选替换

新 evidence 真正新增字符时 revision +1；首次进入 conflicted 时 +1。同一 `(searchRunId, searchObservationId, detailObservationId)` 只新增一行 evidence；重复刷新、重放、重开不重复记录或递增 revision。不同 evidence 若未新增字符，也不递增 revision。

两个不同搜索 observation 的合法 evidence 对同一字符给出不同数字时，该 Run 永久 conflicted，不投票、不覆写、不选第一条或最新一条。其所有 PUA 结果为 mapping_conflict、decodedText=null；其他 Run 不受影响。平台本身已为明文的 salary 仍为 plain_text。

后续导入可能带来 capturedAt 更近或同时间 ID 更大的详情。为始终满足候选选择规则，`selected_evidence_json` 记录当前候选键；被替换时从当前候选集合重建映射，不把旧候选与新候选合并学习。历史 evidence 的首次处理结果保留。若重建改变了 active characters，追加一个 revision 使旧解码失效，包括新候选被 reject 而移除旧候选所学字符的情况；若状态未变，不增加 revision。已经 conflicted 的 Run 不恢复 active。此处 revision 也承担候选替换导致的当前结果失效标识。

## 解码与可追溯性

只为 SearchRun 的列表 observations 创建 decoding result，详情只作证据来源，NULL salary 不伪造空字符串。使用既有 `decodeSalaryWithMapping()`；plain salary 通过 empty mapping 解码，确保不受 PUA conflict 影响。空字符串为 invalid_input，未知字符为 incomplete_mapping，保存 unresolvedCharacters，decodedText=null，不输出部分解码。

每个 revision 追加独立结果，唯一键 `(observation_id, mapping_revision)`。自动学习产生新 revision 时为该 Run 各 observation 保存新结果，保留旧 incomplete、verified、conflict 历史。当前查询只使用当前 mapping revision；缺少时返回 null。映射保存规则版本、字符、revision、evidence count（累计含 rejected/被替换候选）与更新时间。Evidence 仅存 Run、两条 observation、Job 的 ID、结果、拒绝原因和创建时间，不复制岗位文本或薪资原文。

## 生命周期与失败隔离

`LocalDatabase.salaryDecoding` 提供有限 API：refreshSearchRun、refreshAffectedByJobs、refreshAll、getCurrentForObservation、getMappingForSearchRun。不提供 raw SQL、删除历史或人工 override。

ImportRun 先提交源事实，再完成既有独立 deterministic analysis 阶段，最后安全刷新 salary。search import 产生初始 decoding；detail import 通过 Job 找到历史 SearchRuns，只有满足上述 24h 条件的搜索 observation 能学习。重放可以补先前失败的派生阶段。

HTTP listener 建立后 safe refreshAll，回填已有 SearchRuns。每个 Run 的 mapping、evidence、decoding 在一个独立事务内提交，失败不留下半个 revision；其他 Run 仍尝试刷新。异常只输出 `Salary decoding refresh failed.`，不输出错误对象、原文、解码值、标题、公司、JD、token、DB path、payload 或 stack。

salary 阶段失败不能 rollback 已提交的 ImportRun、SearchRun、Observation、Job 或 deterministic analysis，也不使 HTTP save 失败、不阻止启动。SQLite 打开仅迁移结构，不自动 backfill；派生 SQL 延迟 prepare。

## 明确边界

不修改 selectors、salary DOM extraction、raw scope 或 URL canonicalization。不下载字体、不解析 glyph 或轮廓、不 OCR、不逆向字体、不调用私有 API、外部破解服务或隐藏接口，不绕过风控。证据只来自用户正常浏览并保存的本地页面事实。

没有自动打开详情、浏览、翻页、投递、打招呼或聊天。没有 LLM、salary ranking、最低薪资过滤、招聘者新鲜度、成长性、优先级或审核 UI。developer verification 不等于 external acceptance；Phase 5 保持 IN PROGRESS / NOT YET PASSED。
