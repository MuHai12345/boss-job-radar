# BOSS直聘 AI 岗位雷达

`boss-job-radar` 是面向个人求职场景的岗位辅助工具项目，目标是在用户本人正常使用 BOSS直聘 的前提下，帮助发现、保存和后续分析上海的电商运营入门岗位。

GitHub 仓库：<https://github.com/MuHai12345/boss-job-radar>

## 当前阶段

**Phase 3 / Batch 1、Batch 2、Batch 3 及 Phase 3 均已由外部网页版 ChatGPT 验收为 `PASS`。当前处于 Phase 3 closeout；Phase 4 尚未开始。**

当前已有能力包括 loopback-only local service、SQLite migration/storage foundation，以及 append-only observation persistence/recovery。仍未实现 extension bridge、HTTP ingestion、dedupe、production DB path、AI 和 Dashboard。

当前仓库同时包含通用人工 DOM Probe，以及只分析用户已经人工确认岗位区域的 Targeted DOM Structure Probe。两者都由用户主动触发，只用于帮助后续人工识别真实页面结构，不是正式岗位采集功能。

打开 popup 时仍只识别当前页面并显示页面状态、扩展版本与功能状态，不会自动读取 DOM。通用 Probe 保留“人工验证当前页面”按钮；Targeted Probe 的“深度验证岗位结构”按钮只在 `/web/geek/jobs` 或 `/job_detail/*.html` 页面显示，并且在点击当刻重新验证活动标签页。结果分别显示在 popup，不自动保存、不自动复制、不上传，也不发起网络请求。

新增 **Manual Structured Current-Page Extraction**：“解析当前岗位数据”仅在 `/web/geek/jobs` 或单层 `/job_detail/*.html` 页面可用，并且必须由用户点击。它只读取当前 DOM 中已验证的岗位字段，结果暂时只显示为 popup JSON；不保存、不上传、不自动导航、不自动浏览，也不是后台采集器。

Targeted Probe 只在 `manual-validation` 中使用已人工确认的诊断 roots，并以固定节点、深度和文本上限输出结构摘要。用户已完成搜索页和多个详情页的人工 Targeted Probe，外部网页版 ChatGPT 已完成多样本结构比对；仓库现包含与 synthetic profiles 分离的 verified BOSS selector profiles，以及由脱敏 real-shape fixtures 驱动的纯 parser 测试。

最终真实页面结构化重验确认，verified detail visible-text extraction 能排除动态插入的隐藏 tag descendants，并恢复正常可见语义。有限 Targeted tag diagnostic 继续保留，供后续页面结构变化时由用户手动排查。

仓库还包含纯内存、动态、证据驱动的 salary character mapping core。列表 parser 始终保留原始薪资 DOM 文本；mapping core 只处理调用方显式提供的列表原文和已验证详情薪资，不保存真人映射，不访问 DOM、storage 或网络，也不下载、解析或逆向字体。

本地存储使用 `better-sqlite3` `13.0.3`。调用方必须显式提供数据库 path；打开连接时启用 SQLite foreign keys 并自动运行显式 ordered migrations。schema version 1 只包含 append-only `job_observations` 事实快照表。有限 persistence API 只支持 `append` 和 `getById`，会在读取时把三个 JSON 字段恢复并验证为字符串数组；它不对事实字段做归一化，也不对 `job_url` 去重或建立最终 Job、SearchRun、dedupe、identity 模型。

## 文档入口

- [产品宪章](docs/PRODUCT_CHARTER.md)
- [架构基线](docs/ARCHITECTURE.md)
- [领域规则骨架](docs/DOMAIN_RUBRIC.md)
- [数据字典](docs/DATA_DICTIONARY.md)
- [阶段路线](docs/ROADMAP.md)
- [项目状态](docs/PROJECT_STATE.md)
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

本地服务 build 后可运行 `npm run start:local`。它固定监听 `127.0.0.1:32123`，只提供 `GET /health`；可用 `BOSS_JOB_RADAR_LOCAL_PORT` 覆盖 port，但 host 不可配置。当前启动流程不会打开数据库、创建 SQLite 文件或写入用户目录。

构建完成后，可在浏览器扩展管理页面开启开发者模式并选择“加载已解压的扩展”：

- Chrome：`.output/chrome-mv3`
- Edge：`.output/edge-mv3`

这些路径仅用于后续人工加载；当前工作日志不把构建成功表述为已经完成人工浏览器验收。

## 当前边界

- 搜索城市固定为上海，核心方向是电商运营入门岗位。
- 追求高召回，低分或信息不完整岗位只能被降级或标记，不能被静默隐藏。
- 只读取用户当前页面已经存在且任务明确允许的 DOM，不调用 BOSS 私有 API。
- 通用 DOM Probe、Targeted DOM Probe 和结构化当前页解析都只在用户点击对应按钮后运行一次，不自动运行、不后台运行、不保存、不上传。
- 不获取或导出 Cookie、Session、密码或验证码。
- 不自动投递、自动打招呼、自动聊天、自动翻页或后台无人值守浏览。
- 不进行后台自动采集，不自动打开岗位详情，不自动点击“查看更多信息”。
- 当前 HTTP 服务只有 loopback-only `GET /health`，没有 CORS bridge、HTTP ingestion、岗位导入或数据库接入。
- 当前 SQLite 只有显式打开 API、migration runner、append-only observation schema，以及有限的 `append` / `getById` persistence API；没有 production path policy、Job identity 或 dedupe。
- 当前没有扩展到本地服务的 bridge、AI 或 Dashboard。
- 最终查看和投递决定由用户本人完成。

Phase 3 已通过外部验收；Phase 4 仍为 `NOT STARTED`，须等待外部网页版 ChatGPT 单独批准 Phase 4 / Batch 1。
