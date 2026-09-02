# BOSS直聘 AI 岗位雷达

`boss-job-radar` 是面向个人求职场景的岗位辅助工具项目，目标是在用户本人正常使用 BOSS直聘 的前提下，帮助发现、保存和后续分析上海的电商运营入门岗位。

GitHub 仓库：<https://github.com/MuHai12345/boss-job-radar>

## 当前阶段

当前处于 **Phase 2 / Batch 3：verified real selector profiles and parser integration**，状态为 `implementation_complete_awaiting_external_review`。

当前仓库同时包含通用人工 DOM Probe，以及只分析用户已经人工确认岗位区域的 Targeted DOM Structure Probe。两者都由用户主动触发，只用于帮助后续人工识别真实页面结构，不是正式岗位采集功能。

打开 popup 时仍只识别当前页面并显示页面状态、扩展版本与功能状态，不会自动读取 DOM。通用 Probe 保留“人工验证当前页面”按钮；Targeted Probe 的“深度验证岗位结构”按钮只在 `/web/geek/jobs` 或 `/job_detail/*.html` 页面显示，并且在点击当刻重新验证活动标签页。结果分别显示在 popup，不自动保存、不自动复制、不上传，也不发起网络请求。

Targeted Probe 只在 `manual-validation` 中使用已人工确认的诊断 roots，并以固定节点、深度和文本上限输出结构摘要。用户已完成搜索页和多个详情页的人工 Targeted Probe，外部网页版 ChatGPT 已完成多样本结构比对；仓库现包含与 synthetic profiles 分离的 verified BOSS selector profiles，以及由脱敏 real-shape fixtures 驱动的纯 parser 测试。

仓库还包含纯内存、动态、证据驱动的 salary character mapping core。列表 parser 始终保留原始薪资 DOM 文本；mapping core 只处理调用方显式提供的列表原文和已验证详情薪资，不保存真人映射，不访问 DOM、storage 或网络，也不下载、解析或逆向字体。

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
npm run verify:manifests
```

构建完成后，可在浏览器扩展管理页面开启开发者模式并选择“加载已解压的扩展”：

- Chrome：`.output/chrome-mv3`
- Edge：`.output/edge-mv3`

这些路径仅用于后续人工加载；当前工作日志不把构建成功表述为已经完成人工浏览器验收。

## 当前边界

- 搜索城市固定为上海，核心方向是电商运营入门岗位。
- 追求高召回，低分或信息不完整岗位只能被降级或标记，不能被静默隐藏。
- 只读取用户当前页面已经存在且任务明确允许的 DOM，不调用 BOSS 私有 API。
- 通用和 Targeted DOM Probe 都只在用户点击对应按钮后运行一次，不自动运行、不后台运行、不保存、不上传。
- 不获取或导出 Cookie、Session、密码或验证码。
- 不自动投递、自动打招呼、自动聊天、自动翻页或后台无人值守浏览。
- 不自动采集真实页面，不自动打开岗位详情，不自动点击“查看更多信息”。
- 当前没有 local service、SQLite、AI 或 Dashboard。
- 最终查看和投递决定由用户本人完成。

后续批次和阶段均需外部网页版 ChatGPT 独立审阅并明确批准；本仓库当前不得自行进入下一批。
