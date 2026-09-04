# 项目状态

## 当前状态快照

- 当前阶段：`Phase 4 / Batch 3`
- 下一步骤：`Phase 4 / Batch 3 external review`
- 当前状态：`Phase 4 - IN PROGRESS / NOT YET PASSED`
- 已通过的最后 implementation commit：`da6d9d2916a7014eca77e1c91eb7af5aed584061`
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
- 当前能力：用户主动点击后，可在支持的当前 BOSS 页面执行一次结构化 DOM extraction；也可通过独立保存动作重新解析当前页面，并经安全 localhost session 把 observation append 到本机 SQLite
- Phase 2 / Batch 4 真实页面人工验证：最终结构化重验通过；verified detail visible-text extraction 能排除 `visibility: hidden`、zero-size、`display: none` 等隐藏 descendant 干扰，tags 恢复为正常可见语义
- 真实页面后台自动采集：仍未开始
- local service：Phase 3 / Batch 1 已通过外部验收；固定绑定 IPv4 loopback `127.0.0.1` 且 host 不可配置。Phase 4 / Batch 1 已通过外部验收并形成 SQLite + HTTP 的统一 production runtime lifecycle。Phase 4 / Batch 2 已通过外部验收，提供受严格 Host、Origin、ephemeral token、Content-Type、Content-Encoding、1 MiB body limit 和 runtime DTO validation 保护的 `POST /observations`，没有 permissive CORS
- SQLite storage foundation：Phase 3 / Batch 2 已通过外部验收；包含 `better-sqlite3` `13.0.3`、显式 database path 打开、`foreign_keys = ON`、ordered transactional migrations、schema version 1、append-only `job_observations` schema 和 future migration fail-closed；没有 Job identity 或 dedupe
- observation persistence API：Phase 3 / Batch 3 已通过外部验收；包含有限的 append、get by id、append-only semantics、runtime string-array JSON validation、prepared SQL parameter binding，以及 close / reopen / readback recovery。Phase 4 / Batch 2 新增 transactional `appendMany`，保持 input order、重复 observation 独立插入且失败时整批 rollback
- production DB path：Phase 4 / Batch 1 已通过外部验收；使用用户级 OS data directory policy，database filename 固定为 `boss-job-radar.sqlite3`，不接受 arbitrary production path override；Windows 仅接受明确 allowlist 中的 filesystem absolute roots，POSIX 最终 app directory 收紧为 `0700`
- Phase 3：`PASS`
- Phase 3 / Batch 1：`PASS`
- Phase 3 / Batch 2：`PASS`
- Phase 3 / Batch 3：`PASS`
- Phase 4：`IN PROGRESS / NOT YET PASSED`
- Phase 4 / Batch 1：`PASS`
- Phase 4 / Batch 2：`PASS`
- Phase 4 / Batch 3：`implementation_complete_awaiting_external_review`
- Phase 3 implementation lineage：`b73dc43869764f4bbd4d9de6e22d75acc0baed5f` → `b667eaa222bc065f1faff254e7a2d4c640fbf86d` → `05e5b3e6441499a213544b6b6961ecefa765afac`
- 当前阻塞：无实现阻塞；等待外部网页版 ChatGPT 独立审阅 Phase 4 / Batch 3
- 权限边界：Codex 无权自行宣布 Phase 4 / Batch 3 `PASS` 或开始下一批
- 仍未实现：
  - Job identity
  - dedupe
  - final Job aggregation
  - SearchRun integration
  - AI
  - deterministic job analysis
  - Dashboard
  - auto browsing
  - auto apply/chat

## 状态语义

这里的当前状态只表示：

> 外部网页版 ChatGPT 已完成独立代码审阅和独立验收测试，并作出结论：Phase 3 / Batch 1 `PASS`、Phase 3 / Batch 2 `PASS`、Phase 3 / Batch 3 `PASS`，Phase 3 `PASS`，Phase 4 / Batch 1 `PASS`、Phase 4 / Batch 2 `PASS`。Phase 4 / Batch 3 已完成实现并等待外部审阅；Phase 4 仍为 `IN PROGRESS / NOT YET PASSED`。

该结论不表示：

- verified selector 是 BOSS 官方或永久稳定的 contract；
- Phase 4 / Batch 3 已通过外部验收；
- Job identity、dedupe、SearchRun、AI 或 Dashboard 已实现。

Phase 2 最终验收对应的实现 lineage 为：`4f7b9909d1d9edfb6eb910aa35c1263925191800`（Batch 4 structured extraction）→ `af65049e7e0c789db1d5c42f10ab00c8a2bed0f3`（首轮 tag attribution repair）→ `30a794b65e2a7e347d7df1ef3d345d064a876cbc`（verified visible-text repair）→ `48b60ca88e4ce043dd96267fdbcc7f6a7c98c395`（保留的人工 hidden-node diagnostic）。

## 能力现状

仓库当前包含最小浏览器扩展工程、共享 BOSS URL policy，以及 synthetic fixture profiles 和经真人多样本人工验证的 BOSS selector profiles。岗位卡片与详情 parser 仍是由调用方传入 DOM root 的纯函数；verified detail 的 `fullJdText` 和 `rawDetailText` 均限定于 `.job-sec-text`，保留合理换行并排除 `SCRIPT`、`STYLE`、`NOSCRIPT`、`TEMPLATE`。selector 失效或字段未知时保留记录并显式报告 missing field。

popup 保留用户主动触发的通用有限 DOM 结构诊断和 Targeted DOM Structure Probe，并新增“解析当前岗位数据”。结构化解析只在用户点击后重新确认活动标签页，并且只支持 `/web/geek/jobs` 与单层 `/job_detail/*.html`。verified profiles 作为 JSON-safe 参数传入自包含 injected function；结果只显示在 popup，不保存、不上传、不发网络请求。

搜索页只解析当前 DOM 已有的前 100 张岗位卡片，保留实际 `matchedCardCount` 并在超限时返回 `card_limit_reached`；薪资保留列表 DOM 原始文本，不接入 salary mapping。详情页当前岗位 URL 来自清理后的 `document.location`，`fullJdText` 和 `rawDetailText` 都只来自 verified `.job-sec-text`。整个流程不自动点击、滚动、翻页、打开详情或读取 Cookie/storage。

用户已报告 BOSS 首页、搜索结果页和详情页的人工 probe 均成功，并已完成搜索页和多个详情页的 Targeted Probe。外部网页版 ChatGPT 已从匿名样本确认字段级 selector；本轮将它们与 synthetic profiles 明确分离并通过脱敏 real-shape fixtures 接入纯 parser。

列表 parser 继续忠实保留原始薪资 DOM 文本，不自动解码 PUA。独立 salary mapping core 只根据调用方提供的列表原文和已验证详情薪资学习当前内存映射；结构不一致、非数字映射、映射不完整或冲突均返回明确状态，不猜测薪资，也不持久化映射。

verified card link 只保留通过严格校验的 BOSS job detail canonical URL，并删除 query/hash；`jobHrefRaw` 和 `jobUrl` 都不会保存 security/tracking 参数。generic/synthetic parser 的原始链接兼容行为不变。

项目包含固定绑定 `127.0.0.1` 的 Node HTTP 服务；host 不可配置，production port 可在严格校验后有限配置，`GET /health` contract 保持不变。Phase 3 / Batch 2 新增 `better-sqlite3` `13.0.3` 本地存储基础：调用方显式提供 path，打开后启用 foreign keys 并运行 ordered transactional migrations；schema version 1 只包含 append-only `job_observations`。Phase 3 / Batch 3 在独立 Node build boundary 内新增 storage-facing `JobObservationInput` / `JobObservationRecord` 和有限 repository，支持 append 与按 positive safe integer id 读取；事实字符串、null、空字符串与数组顺序原样保持，三个 JSON 字段读取时必须验证为字符串数组。file-backed 测试已覆盖 close、reopen、readback recovery、迁移不重复、重复 observation 分别追加、非法 JSON fail-closed 和 SQL 参数绑定。Phase 4 / Batch 1 新增已通过外部验收的 production OS data path policy：database 固定命名为 `boss-job-radar.sqlite3`，位于用户级 `boss-job-radar` data directory，不接受 arbitrary production path override；Windows production root 必须是 fully-qualified path，macOS / Linux 最终 app directory 创建并收紧为 `0700`；production startup 会创建缺失目录并由统一 runtime 按 SQLite → HTTP 顺序启动、按 HTTP → SQLite 顺序关闭，启动失败时清理已打开资源。Phase 4 / Batch 2 已通过外部验收并提供 `GET /bridge/session` 与受保护的 `POST /observations`：token 每次 service instance 由 CSPRNG 重新生成并仅存进程内存；受保护路由严格匹配 `127.0.0.1:<actual-port>` Host；写请求在 Origin 存在时只允许有效 `chrome-extension://` origin，并强制 custom token、JSON-only、identity encoding、1 MiB 实收 body 上限、1–100 条严格 DTO validation。repository 的 transactional `appendMany` 保持 input order 和 append-only semantics，失败时整批 rollback；响应只返回新 IDs，且不提供 permissive CORS。Phase 4 / Batch 3 新增共享纯 `JobObservationInput` DTO、structured extraction → observation 纯 mapping、固定 `127.0.0.1:32123` 的 extension-context bridge client，以及独立的手动保存按钮；每次保存重新 extraction 和 session handshake，无数据时不访问 localhost，token 不持久化，GET 与 POST 各自 5 秒 timeout 且不重试。项目仍没有 Job identity、dedupe、最终 Job 聚合、SearchRun、AI 分析或 Dashboard。最终真实页面重验确认 detail tags 已恢复正常可见语义；`fullJdText` / `rawDetailText` 保持 JD scope，canonical job/page URL 正常，`publishedText` 在无可靠 selector 时保持 `null`，`recruiterActivityText` 在 `.boss-active-time` 不存在时保持 `null` 且不从其他状态推断。现有 Targeted tag diagnostic 继续保留，供后续页面变化时人工排查。Phase 3、Phase 4 / Batch 1 与 Phase 4 / Batch 2 已通过外部验收；Phase 4 / Batch 3 等待外部审阅，尚未获得 `PASS`。
