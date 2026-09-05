# 项目状态

## 当前状态快照

- 当前阶段：`Phase 5 / Batch 1`
- 下一步骤：`Phase 5 / Batch 1 external review`
- 当前状态：`Phase 5 - IN PROGRESS / NOT YET PASSED`
- 已通过的最后 implementation commit：`148f244a0501017a147889be3f31615f9e6b5c60`
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
- SQLite storage foundation：Phase 3 / Batch 2 已通过外部验收；包含 `better-sqlite3` `13.0.3`、显式 database path 打开、`foreign_keys = ON`、ordered transactional migrations 和 future migration fail-closed。Phase 4 / Batch 4 将 schema 升至 version 2，新增 `jobs` identity/lifecycle 表、observation link 与安全 backfill
- observation persistence API：Phase 3 / Batch 3 已通过外部验收；包含有限的 append、get by id、append-only semantics、runtime string-array JSON validation、prepared SQL parameter binding，以及 close / reopen / readback recovery。Phase 4 / Batch 2 新增 transactional `appendMany`；Phase 4 / Batch 4 让单条与批量成功事务都完成 Job resolve/create、observation linking 和 lifecycle update，重复 observation 仍独立保留
- Job identity：Phase 4 / Batch 4 已通过外部验收；非 NULL `job_url` 按已保存字符串 exact equality 复用 canonical Job，NULL URL 每条 observation 独立 unresolved，不使用 title/company 等弱字段合并；first/last/latest 只基于 `captured_at` 与 observation id
- production DB path：Phase 4 / Batch 1 已通过外部验收；使用用户级 OS data directory policy，database filename 固定为 `boss-job-radar.sqlite3`，不接受 arbitrary production path override；Windows 仅接受明确 allowlist 中的 filesystem absolute roots，POSIX 最终 app directory 收紧为 `0700`
- Phase 3：`PASS`
- Phase 3 / Batch 1：`PASS`
- Phase 3 / Batch 2：`PASS`
- Phase 3 / Batch 3：`PASS`
- Phase 4：`PASS`
- Phase 4 / Batch 1：`PASS`
- Phase 4 / Batch 2：`PASS`
- Phase 4 / Batch 3：`PASS`
- Phase 4 / Batch 4：`PASS`
- Phase 4 / Batch 5：`PASS`
- Phase 5：`IN PROGRESS / NOT YET PASSED`
- Phase 5 / Batch 1：`implementation_complete_awaiting_external_review`
- 核心能力矩阵：7 / 15 VERIFIED；2 项 IMPLEMENTED_AWAITING_REVIEW；6 项 NOT_STARTED
- Phase 3 implementation lineage：`b73dc43869764f4bbd4d9de6e22d75acc0baed5f` → `b667eaa222bc065f1faff254e7a2d4c640fbf86d` → `05e5b3e6441499a213544b6b6961ecefa765afac`
- 当前阻塞：无实现阻塞；等待外部网页版 ChatGPT 独立审阅 Phase 5 / Batch 1
- 权限边界：Codex 无权自行宣布 Phase 5 / Batch 1 `PASS` 或开始下一批
- 仍未实现：
  - final Job aggregation
  - observation dedupe（按设计不实现）
  - AI
  - Dashboard
  - auto browsing
  - auto apply/chat

## 状态语义

这里的当前状态只表示：

> 依据本轮外部 Prompt，Phase 0–4 均已获外部 `PASS`，Phase 4 / Batch 1–5 全部 `PASS`。Phase 5 / Batch 1 的确定性岗位性质与经验要求分析已完成实现，等待外部审阅；Phase 5 为 `IN PROGRESS / NOT YET PASSED`。developer verification 不等于 external acceptance。

该结论不表示：

- verified selector 是 BOSS 官方或永久稳定的 contract；
- Phase 5 / Batch 1 已通过外部验收；
- observation dedupe、AI 或 Dashboard 已实现。

Phase 2 最终验收对应的实现 lineage 为：`4f7b9909d1d9edfb6eb910aa35c1263925191800`（Batch 4 structured extraction）→ `af65049e7e0c789db1d5c42f10ab00c8a2bed0f3`（首轮 tag attribution repair）→ `30a794b65e2a7e347d7df1ef3d345d064a876cbc`（verified visible-text repair）→ `48b60ca88e4ce043dd96267fdbcc7f6a7c98c395`（保留的人工 hidden-node diagnostic）。

## 能力现状

仓库当前包含最小浏览器扩展工程、共享 BOSS URL policy，以及 synthetic fixture profiles 和经真人多样本人工验证的 BOSS selector profiles。岗位卡片与详情 parser 仍是由调用方传入 DOM root 的纯函数；verified detail 的 `fullJdText` 和 `rawDetailText` 均限定于 `.job-sec-text`，保留合理换行并排除 `SCRIPT`、`STYLE`、`NOSCRIPT`、`TEMPLATE`。selector 失效或字段未知时保留记录并显式报告 missing field。

popup 保留用户主动触发的通用有限 DOM 结构诊断和 Targeted DOM Structure Probe，并新增“解析当前岗位数据”。结构化解析只在用户点击后重新确认活动标签页，并且只支持 `/web/geek/jobs` 与单层 `/job_detail/*.html`。verified profiles 作为 JSON-safe 参数传入自包含 injected function；结果只显示在 popup，不保存、不上传、不发网络请求。

搜索页只解析当前 DOM 已有的前 100 张岗位卡片，保留实际 `matchedCardCount` 并在超限时返回 `card_limit_reached`；薪资保留列表 DOM 原始文本，不接入 salary mapping。详情页当前岗位 URL 来自清理后的 `document.location`，`fullJdText` 和 `rawDetailText` 都只来自 verified `.job-sec-text`。整个流程不自动点击、滚动、翻页、打开详情或读取 Cookie/storage。

用户已报告 BOSS 首页、搜索结果页和详情页的人工 probe 均成功，并已完成搜索页和多个详情页的 Targeted Probe。外部网页版 ChatGPT 已从匿名样本确认字段级 selector；本轮将它们与 synthetic profiles 明确分离并通过脱敏 real-shape fixtures 接入纯 parser。

列表 parser 继续忠实保留原始薪资 DOM 文本，不自动解码 PUA。独立 salary mapping core 只根据调用方提供的列表原文和已验证详情薪资学习当前内存映射；结构不一致、非数字映射、映射不完整或冲突均返回明确状态，不猜测薪资，也不持久化映射。

verified card link 只保留通过严格校验的 BOSS job detail canonical URL，并删除 query/hash；`jobHrefRaw` 和 `jobUrl` 都不会保存 security/tracking 参数。generic/synthetic parser 的原始链接兼容行为不变。

项目包含固定绑定 `127.0.0.1` 的 Node HTTP 服务；host 不可配置，production port 可在严格校验后有限配置，`GET /health` contract 保持不变。Phase 3 / Batch 2 建立 `better-sqlite3` `13.0.3`、foreign keys 与 ordered transactional migrations；Phase 3 / Batch 3 建立 append-only observation repository 与 file-backed recovery。Phase 4 / Batch 1、Batch 2、Batch 3 已分别完成并通过 production data path/runtime、受保护 `POST /observations` 和手动 extension → localhost bridge。Phase 4 / Batch 4 将 schema 升至 version 2：migration 保留并关联全部既有 observations，非 NULL `job_url` exact group 形成一个 canonical Job，NULL URL observation 各自形成 unresolved Job；first/last/latest 使用 `captured_at` 与 observation id。新的 `append` / `appendMany` 在完整事务内插入 observation、resolve/create Job、写入 `job_id` 并更新 lifecycle，任一步失败全部 rollback。Job repository 只提供 `getById` / `findByJobUrl`；HTTP input 仍不接受 `jobId`，成功响应仍只返回 observation IDs。Phase 4 / Batch 4 已由外部验收为 `PASS`。项目仍没有 observation dedupe、最终 Job aggregate facts、AI 分析或 Dashboard。

Phase 4 / Batch 5 将 schema 升至 version 3、bridge protocol 升至 version 2。每次用户保存从 structured extraction 原样构造 source 与 observations，并 fresh 生成仅保留在当前调用内存中的 clientImportId。ImportRepository 在单一事务内执行 runtime validation、固定字段 SHA-256、ImportRun、搜索页 SearchRun、observation provenance 与 Job lifecycle。历史 observation 的 import_run_id 保持 NULL，读取正常，不推测历史 runs。

相同 clientImportId 与相同 payload 的 replay 返回原 observation IDs，关闭/重开数据库后仍然有效；不同 payload 返回 409 import_conflict。不同点击始终新增 observations，canonical Job 继续复用。搜索保存保留实际 matched count 与 saved count（例如 143/100）及 warning 原顺序；detail matched count 为 NULL 且不创建 SearchRun。空结果不连接 localhost。SearchRun 通过 ImportRun 和 observations 可追溯到本次观察到的 Jobs。

客户端只对 POST 网络失败、响应 body 丢失或传输 timeout 最多重试一次，复用已序列化的同一 payload 和 UUID；400/403/409/413/500 不重试。session 与成功 POST 均验证 application/json Content-Type，允许 charset。Host、Origin、token、identity encoding、1 MiB body limit、loopback-only 和无 permissive CORS 边界保持不变，GET /health 不变。Batch 5 已获外部 PASS。

## Phase 5 / Batch 1 实现状态

- 新增 schema version 4：独立 `deterministic_job_analyses`，migration 不执行业务 backfill，不更新 JobObservation facts。
- 规则版本：`deterministic-job-analysis-v1`。两轴为岗位性质四种状态、经验要求五种状态；无总分和 LLM。
- source selection：latest pointer 提供当前 title/header/tags；从同 Job 全部历史按 captured_at DESC、id DESC 复用最近非空完整 JD，分别保存两个来源 ID。复用旧 JD 增加非阻塞 warning。
- 简单 section detection、核心/偏离职责族、紧邻否定与保守聚合均已实现；要求段和 title/tags 作为上下文，不等同职责。
- 经验解析保留 header、JD 显式硬年限/优先/无要求、原文 evidence 与矛盾。`1年以内` + `工作2年以上` 输出 contradictory、hardMinimumYears=2；`1-3年` + `1年经验优先` 保留软偏好，记录 mismatch，minimum=null。
- `LocalDatabase.analyses` 提供 analyzeJob/getLatestForJob/refreshAll；同 latest/rules 幂等，新键追加历史；当前查询不返回 stale；存储 JSON 经 runtime validation 后读取。
- ImportRun 源数据 commit 后再独立分析受影响 Jobs；HTTP listener 启动后 backfill 已有 Jobs。异常只记录固定 generic diagnostic，不撤销采集、不阻止服务或保存，可随后补齐。
- 详细阈值、读取 contract 与限制见 [ADR-0012](decisions/ADR-0012-deterministic-job-analysis-v1.md)；开发命令和结果见 [本批工作日志](worklogs/2026-09-05-phase-5-batch-1-deterministic-analysis.md)。
- 状态为 `implementation_complete_awaiting_external_review`；不开始下一批。
