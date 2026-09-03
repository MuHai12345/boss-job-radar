# 项目状态

## 当前状态快照

- 当前阶段：`Phase 3 - IN PROGRESS / NOT YET PASSED`
- 当前批次：`Phase 3 / Batch 1`
- 当前状态：`implementation_complete_awaiting_external_review`
- 已通过的最后 commit：`48b60ca88e4ce043dd96267fdbcc7f6a7c98c395`
- Phase 0：`PASS`
- Phase 1：`PASS`
- Phase 1 / Batch 1：`PASS`
- Phase 1 / Batch 2：`PASS`
- Phase 1 / Batch 3：`PASS`
- Phase 1 / Batch 1 人工浏览器验证：用户报告 `PASS`
- Phase 2 / Batch 1：`PASS`
- Phase 2 / Batch 1 privacy repair：`PASS`
- 真实 BOSS 首页 probe：用户报告成功
- 真实 BOSS 搜索结果页验证：`PASS`；已确认 `ul.rec-job-list` 列表容器和 `li.job-card-box` 岗位卡片容器
- 真实 BOSS 详情页：用户报告多个 Targeted Probe 样本成功，字段级 selector 已经外部多样本比对
- 真实页面结构：用户已完成搜索页和多个详情页 Targeted Probe，外部网页版 ChatGPT 已完成多样本结构比对
- Phase 2 / Batch 2：`PASS`
- Phase 2 / Batch 3：`PASS`
- Phase 2 / Batch 4：`PASS`
- Phase 2：`PASS`
- verified parser：`PASS`
- verified URL privacy repair：`PASS`
- 真实 search selector：已形成 verified profile；业务 tags、招聘者活跃状态和发布时间保持未知
- 真实 detail selector：已形成 verified profile；发布时间保持未知，当前岗位 URL 由调用方显式提供
- salary PUA：已建立纯内存、动态、证据驱动的 mapping core；未硬编码真人映射，未下载、解析或逆向字体
- 当前能力：用户主动点击后，可在支持的当前 BOSS 页面执行一次结构化 DOM extraction
- Phase 2 / Batch 4 真实页面人工验证：最终结构化重验通过；verified detail visible-text extraction 能排除 `visibility: hidden`、zero-size、`display: none` 等隐藏 descendant 干扰，tags 恢复为正常可见语义
- 真实页面后台自动采集：仍未开始
- local service：已实现最小 loopback-only HTTP runtime baseline，等待外部审阅
- Phase 3：`IN PROGRESS / NOT YET PASSED`
- Phase 3 / Batch 1：`implementation_complete_awaiting_external_review`
- 当前阻塞：无实现阻塞；等待外部网页版 ChatGPT 审阅 Phase 3 / Batch 1
- 权限边界：Codex 无权自行宣布本批次通过或进入下一批
- 尚未开发或验证：
  - JSON 导出
  - SQLite
  - AI
  - Dashboard

## 状态语义

这里的当前状态只表示：

> 外部网页版 ChatGPT 已基于用户最终真实页面结构化重验作出结论：Phase 2 / Batch 4 `PASS`，Phase 2 `PASS`。Phase 3 / Batch 1 本地服务基线已完成实现，当前等待外部审阅；Phase 3 尚未通过。

该结论不表示：

- verified selector 是 BOSS 官方或永久稳定的 contract；
- Phase 3 已通过；
- SQLite、扩展桥接、AI 或 Dashboard 已实现。

Phase 2 最终验收对应的实现 lineage 为：`4f7b9909d1d9edfb6eb910aa35c1263925191800`（Batch 4 structured extraction）→ `af65049e7e0c789db1d5c42f10ab00c8a2bed0f3`（首轮 tag attribution repair）→ `30a794b65e2a7e347d7df1ef3d345d064a876cbc`（verified visible-text repair）→ `48b60ca88e4ce043dd96267fdbcc7f6a7c98c395`（保留的人工 hidden-node diagnostic）。

## 能力现状

仓库当前包含最小浏览器扩展工程、共享 BOSS URL policy，以及 synthetic fixture profiles 和经真人多样本人工验证的 BOSS selector profiles。岗位卡片与详情 parser 仍是由调用方传入 DOM root 的纯函数；verified detail 的 `fullJdText` 和 `rawDetailText` 均限定于 `.job-sec-text`，保留合理换行并排除 `SCRIPT`、`STYLE`、`NOSCRIPT`、`TEMPLATE`。selector 失效或字段未知时保留记录并显式报告 missing field。

popup 保留用户主动触发的通用有限 DOM 结构诊断和 Targeted DOM Structure Probe，并新增“解析当前岗位数据”。结构化解析只在用户点击后重新确认活动标签页，并且只支持 `/web/geek/jobs` 与单层 `/job_detail/*.html`。verified profiles 作为 JSON-safe 参数传入自包含 injected function；结果只显示在 popup，不保存、不上传、不发网络请求。

搜索页只解析当前 DOM 已有的前 100 张岗位卡片，保留实际 `matchedCardCount` 并在超限时返回 `card_limit_reached`；薪资保留列表 DOM 原始文本，不接入 salary mapping。详情页当前岗位 URL 来自清理后的 `document.location`，`fullJdText` 和 `rawDetailText` 都只来自 verified `.job-sec-text`。整个流程不自动点击、滚动、翻页、打开详情或读取 Cookie/storage。

用户已报告 BOSS 首页、搜索结果页和详情页的人工 probe 均成功，并已完成搜索页和多个详情页的 Targeted Probe。外部网页版 ChatGPT 已从匿名样本确认字段级 selector；本轮将它们与 synthetic profiles 明确分离并通过脱敏 real-shape fixtures 接入纯 parser。

列表 parser 继续忠实保留原始薪资 DOM 文本，不自动解码 PUA。独立 salary mapping core 只根据调用方提供的列表原文和已验证详情薪资学习当前内存映射；结构不一致、非数字映射、映射不完整或冲突均返回明确状态，不猜测薪资，也不持久化映射。

verified card link 只保留通过严格校验的 BOSS job detail canonical URL，并删除 query/hash；`jobHrefRaw` 和 `jobUrl` 都不会保存 security/tracking 参数。generic/synthetic parser 的原始链接兼容行为不变。

项目新增了固定绑定 `127.0.0.1` 的最小 Node HTTP 服务，只提供 `GET /health`；host 不可配置，production port 可在严格校验后有限配置。该实现没有 CORS bridge、ingestion、SQLite、局域网或公网监听。项目仍没有真实页面后台自动采集、自动打开详情、JSON 导出、数据库、AI 分析或 Dashboard。最终真实页面重验确认 detail tags 已恢复正常可见语义；`fullJdText` / `rawDetailText` 保持 JD scope，canonical job/page URL 正常，`publishedText` 在无可靠 selector 时保持 `null`，`recruiterActivityText` 在 `.boss-active-time` 不存在时保持 `null` 且不从其他状态推断。现有 Targeted tag diagnostic 继续保留，供后续页面变化时人工排查。Phase 3 当前为 `IN PROGRESS / NOT YET PASSED`。
