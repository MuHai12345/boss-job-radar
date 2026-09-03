# Phase 2 / Batch 4 Manual Structured Current-Page Extraction 工作日志

## 范围与接手状态

- 分支：`master`
- 基准 commit：`bf66591c66e9854b6415ad2e9787bd5b4257450e`
- 接手时本地 HEAD 与 `origin/master`：均与基准 commit 一致
- 接手时工作区：存在 Phase 2 / Batch 4 未提交修改和新文件，本轮在该现场上继续完成
- 当前状态：`implementation_complete_awaiting_external_review`

本轮只完成用户主动触发的当前页面结构化 DOM extraction bridge、相关测试、最小 popup 文案修正和事实性文档更新。未进入 Phase 3。

## 完成内容

- 新增 `StructuredPageExtractionResult`，区分 `search_results`、`job_detail` 和 `unsupported` 页面。
- popup 新增“解析当前岗位数据”；打开 popup 不会自动解析，仅在用户点击后重新确认活动标签页并执行一次。
- injected function 保持自包含，verified search/detail selector profiles 通过 `executeScript` 参数传入，没有复制另一套真实 BOSS selectors。
- 搜索页只解析当前 DOM 中匹配的前 100 张岗位卡片，保留 `matchedCardCount`，超限返回 `card_limit_reached`；薪资保留原始 DOM 文本，不接入 salary mapping。
- verified card URL 使用 canonical BOSS job detail URL；`rawCardText` 只来自当前 card。
- 详情页 URL 来自清理后的 `document.location`；`fullJdText` 和 `rawDetailText` 只来自 `.job-sec-text`，并排除 `SCRIPT`、`STYLE`、`NOSCRIPT`、`TEMPLATE`。
- 覆盖 `page_navigated`、`missing_extraction_result`、`scripting_failed`、空列表、缺失 body、in-flight 防重复等状态。
- 补齐 live structured extraction 与 verified pure parser 的 reference equivalence assertions：search 增加 parse-level `warnings`、`rawCardText` 和 card `warnings`，detail 增加 `warnings`；其余 `ParsedJobCard` / `ParsedJobDetail` 业务字段也已逐项覆盖。
- 将 popup 过期的“当前尚未开始采集”改为“支持用户点击后解析当前页面”。
- 修正 Batch 3 external review 文件中仍写为等待复审的事实性状态；Batch 3 的外部复审结论仍按既有记录为 `PASS`。

## 开发验证

| 命令 | 结果 |
| --- | --- |
| `git status` | 成功；确认分支为 `master`，Batch 4 未提交工作存在 |
| `git rev-parse HEAD` | `bf66591c66e9854b6415ad2e9787bd5b4257450e` |
| `git rev-parse origin/master` | `bf66591c66e9854b6415ad2e9787bd5b4257450e` |
| `npm test -- tests/structured-page-extraction.test.ts tests/popup-controller.test.ts` | RED：新增 popup 文案断言按预期失败；23 passed、1 failed |
| `npm test -- tests/structured-page-extraction.test.ts tests/popup-controller.test.ts` | GREEN：2 files、24 tests 全部通过 |
| `npm run typecheck` | 成功；exit 0 |
| `npm run lint` | 成功；exit 0 |
| `npm test` | 成功；14 files、187 tests 全部通过 |
| `npm run build` | 成功；WXT 0.21.4 完成 Chrome MV3 production build，exit 0 |

## 尚未执行与边界

- `REAL BOSS PAGE MANUAL VALIDATION: NOT PERFORMED`
- 外部网页版 ChatGPT 审阅：`PENDING`
- 未请求或读取 Cookie、Session、密码、验证码或其他浏览器私密状态。
- 未新增 network request、BOSS private API、storage、SQLite、localhost service、AI、Dashboard、salary mapping 接入、自动滚动、自动翻页、自动点击、自动打开详情、MutationObserver、自动投递或自动聊天。

本工作日志只记录实现和开发验证事实，不构成 Phase 2 / Batch 4 外部验收结论。

## Real page detail tag attribution repair

- 外部网页版 ChatGPT 首轮审阅与用户真实页面验证确认：verified detail tags 可能被固定平台 attribution `来自BOSS直聘` 插入文本中间并污染语义文本。
- 根因是 pure verified detail parser 与 live structured extractor 均直接归一化 `tag.textContent`，没有先移除该已确认 marker。
- repair 仅在两条 verified detail 路径中移除固定 marker，再执行原有 whitespace normalization；清理后为空的 tag 不进入结果，并继续通过 `missingFields` 报告整体 tags 缺失。
- verified selector、search extraction、generic/synthetic parser、URL policy 和其他字段处理均未改变。
- 使用匿名 synthetic fixture 覆盖文本中间 marker、多个 tag、attribution-only tag、正常 tag、pure/live 输出和 reference equivalence；未写入用户真实公司、URL、JD 或招聘者信息。
- 当前状态：`repair_implemented_awaiting_external_re-review`。
- `REAL BOSS PAGE RE-VALIDATION: NOT PERFORMED`。

## Second real page detail tag validation and visible-text repair

- 第二次真实页面验证确认：detail tag contamination 的根因是 `textContent` 读取了隐藏 descendant text，而不是 selector 错误或单一固定 marker。
- 上一轮 marker-specific `replaceAll` 已被移除；当前实现不维护 `直聘`、`kanzhun`、`来自BOSS直聘` 或其他字符串 blacklist。
- visible-text repair 在 DOM 顺序中递归保留普通 Text node 和可见 inline child，并跳过带 `hidden` 属性、computed `display: none`、`visibility: hidden`、`visibility: collapse` 的整个 element subtree，以及 `SCRIPT`、`STYLE`、`NOSCRIPT`、`TEMPLATE`。
- pure `parseVerifiedBossJobDetail` 与 self-contained live `runVerifiedBossStructuredExtraction` 均应用相同语义；generic parser 继续保留原有 `textContent` 行为，search extraction、verified selectors 和其他 detail 字段未改变。
- 当前状态：`visible_text_repair_implemented_awaiting_external_re-review`。
- `REAL BOSS PAGE RE-VALIDATION: NOT PERFORMED`。

## Detail tag hidden-node diagnostic

- 重复真实页面验证显示 detail tag 会出现动态变化的隐藏干扰文本。
- 本轮不再继续猜测或修改 parser repair。
- 人工 Targeted Probe 已增加有限、脱敏的 detail tag diagnostic。
- 当前等待外部审阅，并等待用户在真实 BOSS 详情页手动运行 diagnostic。
