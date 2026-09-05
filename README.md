# BOSS直聘 AI 岗位雷达

`boss-job-radar` 是面向个人求职场景的岗位辅助工具项目，目标是在用户本人正常使用 BOSS直聘 的前提下，帮助发现、保存和后续分析上海的电商运营入门岗位。

GitHub 仓库：<https://github.com/MuHai12345/boss-job-radar>

## 当前阶段

**Phase 3、Phase 4 / Batch 1、Batch 2、Batch 3 与 Batch 4 均已由外部网页版 ChatGPT 验收为 `PASS`。Phase 4 当前为 `IN PROGRESS / NOT YET PASSED`；Phase 4 / Batch 5 为 `implementation_complete_awaiting_external_review`。**

当前已有能力包括 loopback-only local service、SQLite migration/storage foundation、append-only observation persistence/recovery、production database path 与统一 local runtime lifecycle、受保护 observation ingestion HTTP protocol、由用户明确点击触发的 extension → localhost save bridge，已通过外部验收的持久化 Job identity / canonical URL dedupe，以及等待外部审阅的 ImportRun、SearchRun provenance 与幂等请求重放。仍未实现 AI 和 Dashboard。

当前仓库同时包含通用人工 DOM Probe，以及只分析用户已经人工确认岗位区域的 Targeted DOM Structure Probe。两者都由用户主动触发，只用于帮助后续人工识别真实页面结构，不是正式岗位采集功能。

打开 popup 时仍只识别当前页面并显示页面状态、扩展版本与功能状态，不会自动读取 DOM。通用 Probe 保留“人工验证当前页面”按钮；Targeted Probe 的“深度验证岗位结构”按钮只在 `/web/geek/jobs` 或 `/job_detail/*.html` 页面显示，并且在点击当刻重新验证活动标签页。结果分别显示在 popup，不自动保存、不自动复制、不上传，也不发起网络请求。

新增 **Manual Structured Current-Page Extraction**：“解析当前岗位数据”仅在 `/web/geek/jobs` 或单层 `/job_detail/*.html` 页面可用，并且必须由用户点击。它只读取当前 DOM 中已验证的岗位字段，结果暂时只显示为 popup JSON；不保存、不上传、不自动导航、不自动浏览，也不是后台采集器。

新增独立 **Manual Local Save**：“保存当前岗位数据到本地”只在相同的受支持页面可用。每次点击都会重新取得活动标签页并重新执行 structured extraction，不复用 popup 中此前显示的 JSON；随后在 extension context 将纯 builder 生成的 protocol 2 envelope（`clientImportId`、`source`、`observations`）发送到固定 `http://127.0.0.1:32123`。空结果不会访问 localhost。每次保存 fresh 生成 `crypto.randomUUID()` 并获取 protocol 2 ephemeral session；UUID 与 token 只保留在当前调用内存。GET 与 POST 各自 5 秒 timeout 覆盖响应 body；POST 网络结果未知时最多复用相同 payload/UUID/token 重试一次，HTTP 错误不重试。session 与成功响应必须是 `application/json`（允许 charset），成功 UI 只显示保存条数。

Targeted Probe 只在 `manual-validation` 中使用已人工确认的诊断 roots，并以固定节点、深度和文本上限输出结构摘要。用户已完成搜索页和多个详情页的人工 Targeted Probe，外部网页版 ChatGPT 已完成多样本结构比对；仓库现包含与 synthetic profiles 分离的 verified BOSS selector profiles，以及由脱敏 real-shape fixtures 驱动的纯 parser 测试。

最终真实页面结构化重验确认，verified detail visible-text extraction 能排除动态插入的隐藏 tag descendants，并恢复正常可见语义。有限 Targeted tag diagnostic 继续保留，供后续页面结构变化时由用户手动排查。

仓库还包含纯内存、动态、证据驱动的 salary character mapping core。列表 parser 始终保留原始薪资 DOM 文本；mapping core 只处理调用方显式提供的列表原文和已验证详情薪资，不保存真人映射，不访问 DOM、storage 或网络，也不下载、解析或逆向字体。

本地存储使用 `better-sqlite3` `13.0.3`。production database 固定命名为 `boss-job-radar.sqlite3`，位于用户级 OS data directory 下的 `boss-job-radar` 子目录；production 不接受任意 database path override。底层 API 和测试仍显式传入 path。打开连接时启用 SQLite foreign keys 并自动运行显式 ordered migrations。schema version 2 新增小型 `jobs` identity/lifecycle 表及 `job_observations.job_id` 关联；迁移会按已保存的非 NULL `job_url` exact equality 回填 canonical Job，NULL URL observation 各自建立 unresolved Job。observation 继续永久 append-only，`jobs` 不复制 title、company、salary 或 JD 等事实字段。有限 repository 支持 observation `append` / transactional `appendMany` / `getById` 与 Job `getById` / `findByJobUrl`；每次成功 append 都在同一事务内完成 observation 插入、Job resolve/create、link 与 first/last/latest 更新。

local service 每次启动都会在进程内生成新的高熵 bridge session token。`GET /bridge/session` 只在严格匹配当前 `127.0.0.1:<actual-port>` Host 时返回 protocol version 和当前 token，并设置 `Cache-Control: no-store`。`POST /observations` 还要求 extension-only Origin（当 Origin 存在时）、custom token header、`application/json`、identity encoding、1 MiB 实收 body 上限和严格 protocol 2 envelope DTO 与 source/observation 一致性校验；每批最多 100 条，并通过有限 ImportRepository 在单一 SQLite transaction 中完成 provenance、observation append 和 Job lifecycle。服务不提供 permissive CORS，错误响应不回显 token、请求 payload、SQL 或数据库路径。

当前 schema version 3 在既有 Job linking 基础上新增 `import_runs`、`search_runs` 与 nullable `job_observations.import_run_id`。历史 observation 保持 unknown provenance（NULL），不猜测历史 runs。每次新的保存动作创建 ImportRun，搜索页同时创建一个 SearchRun；详情页 matched count 为 NULL，不创建 SearchRun。source 直接来自 structured extraction，保留页面、capturedAt、matchedCardCount 和 warning 原值、原顺序；例如 143 张 matched / 100 条 saved 分别保留。通过 SearchRun → ImportRun → observations → job_id 可追溯本次观察到的 Jobs。

相同 `clientImportId` 与相同 payload 使用固定字段 serialization 的 SHA-256 识别重放，并返回第一次成功产生的 observation IDs（数据库重开后仍有效）；相同 ID 与不同 payload 返回 `409 { "error": "import_conflict" }`，不写入。不同用户点击生成新 UUID，即使页面不变仍新增 observations，canonical Job 继续复用。ImportRun、SearchRun、observations 和 Job lifecycle 任一步失败全部 rollback。local service 与 extension 需同时升级至 protocol 2，不兼容 protocol 1；`GET /health` 不变。
## 文档入口

- [产品宪章](docs/PRODUCT_CHARTER.md)
- [架构基线](docs/ARCHITECTURE.md)
- [领域规则骨架](docs/DOMAIN_RUBRIC.md)
- [数据字典](docs/DATA_DICTIONARY.md)
- [阶段路线](docs/ROADMAP.md)
- [项目状态](docs/PROJECT_STATE.md)
- [产品能力矩阵](docs/PRODUCT_CAPABILITY_MATRIX.md)
- [架构决策记录](docs/decisions/)
- [协作规则](AGENTS.md)

## 双角色开发流程

外部网页版 ChatGPT 负责产品目标、架构决策、任务拆分、GitHub 审阅、验收和阶段推进；Codex 仅执行当前批次的明确实现、运行适用检查、提交结果并记录事实。Codex 的实现和测试结果不等于外部验收。

## 开发者命令

```powershell
npm install
npm run prepare
npm run typecheck
npm run lint
npm test
npm run build
npm run build:edge
npm run build:local
npm run verify:manifests
```

本地服务 build 后可运行 `npm run start:local`。它固定监听 `127.0.0.1:32123`，提供稳定的 `GET /health`、`GET /bridge/session` 和受保护的 `POST /observations`；可用 `BOSS_JOB_RADAR_LOCAL_PORT` 覆盖 port，但 host 不可配置。production 启动会在用户级 OS data directory 下创建 `boss-job-radar` 目录（如尚不存在），打开 `boss-job-radar.sqlite3` 并运行 schema migration；不要把该命令用于不希望触碰真实 production app-data 的 developer smoke test。

构建完成后，可在浏览器扩展管理页面开启开发者模式并选择“加载已解压的扩展”：

- Chrome：`.output/chrome-mv3`
- Edge：`.output/edge-mv3`

这些路径仅用于后续人工加载；当前工作日志不把构建成功表述为已经完成人工浏览器验收。

## 当前边界

- 搜索城市固定为上海，核心方向是电商运营入门岗位。
- 追求高召回，低分或信息不完整岗位只能被降级或标记，不能被静默隐藏。
- 只读取用户当前页面已经存在且任务明确允许的 DOM，不调用 BOSS 私有 API。
- 通用 DOM Probe、Targeted DOM Probe 和结构化当前页解析都只在用户点击对应按钮后运行一次，不自动运行、不后台运行、不保存、不上传。
- 手动本地保存也只在用户点击独立按钮后运行；它重新解析当前页面，只向固定 localhost 发送 mapping 后的 observation DTO，不发送 whole document、HTML、DOM diagnostics、Cookie、Session、storage 或浏览历史。
- 不获取或导出 Cookie、Session、密码或验证码。
- 不自动投递、自动打招呼、自动聊天、自动翻页或后台无人值守浏览。
- 不进行后台自动采集，不自动打开岗位详情，不自动点击“查看更多信息”。
- 当前 HTTP 服务固定 loopback-only，`GET /health` contract 不变，并新增受严格 Host、Origin、token、media type、body size 和 DTO validation 保护的 observation ingestion；没有 permissive CORS。
- 当前 SQLite schema version 3 包含 production OS data path policy、ordered transactional migration、append-only observations、Job identity/lifecycle、canonical URL exact-match dedupe、unresolved policy、ImportRun / SearchRun provenance、幂等导入和有限 repositories；没有 observation dedupe、final aggregate facts、AI 或 Dashboard。
- 当前 extension host permission 仅为 `http://127.0.0.1:32123/*`；没有其他 localhost 范围、`<all_urls>`、自动采集、AI 或 Dashboard。
- 最终查看和投递决定由用户本人完成。

Phase 3、Phase 4 / Batch 1、Batch 2、Batch 3 与 Batch 4 已通过外部验收；Phase 4 / Batch 5 已完成实现并等待外部网页版 ChatGPT 独立审阅，尚未获得 `PASS`。Phase 4 仍为 `IN PROGRESS / NOT YET PASSED`。
