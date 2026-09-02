# BOSS直聘 AI 岗位雷达

`boss-job-radar` 是面向个人求职场景的岗位辅助工具项目，目标是在用户本人正常使用 BOSS直聘 的前提下，帮助发现、保存和后续分析上海的电商运营入门岗位。

GitHub 仓库：<https://github.com/MuHai12345/boss-job-radar>

## 当前阶段

当前处于 **Phase 2 / Batch 1：人工 DOM 验证 probe**，状态为 `implementation_complete_awaiting_external_review`。

当前仓库在 Phase 1 的脱敏 fixture 解析能力基础上，增加了由用户主动触发、只针对当前活动 BOSS 页面的一次性有限 DOM 结构诊断工具。它只用于帮助后续人工识别真实页面结构，不是正式岗位采集功能。

打开 popup 时仍只识别当前页面并显示页面状态、扩展版本与功能状态，不会自动读取 DOM。只有在当前页面属于 BOSS直聘且用户本人点击“人工验证当前页面”后，扩展才执行一次只读 probe，并在 popup 内显示最多 20 个候选结构、每个最多 120 字符文本预览的脱敏 JSON 摘要。结果不自动保存、不自动复制、不上传，也不发起网络请求。

本轮没有建立真实 BOSS selector，也没有验证任何真实岗位字段。用户本人已报告首页、搜索结果页和详情页的人工 probe 均成功；真实验证发现的顶层页面 URL query/hash 隐私问题已完成代码整改，当前状态仍为 `CHANGES_REQUIRED`，等待外部审阅。

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
- 只规划读取用户当前页面已经展示的 DOM，不调用 BOSS 私有 API。
- DOM probe 只在用户点击按钮后运行一次，不自动运行、不后台运行、不保存、不上传。
- 不获取或导出 Cookie、Session、密码或验证码。
- 不自动投递、自动打招呼、自动聊天、自动翻页或后台无人值守浏览。
- 最终查看和投递决定由用户本人完成。

后续批次和阶段均需外部网页版 ChatGPT 独立审阅并明确批准；本仓库当前不得自行进入 Phase 2 / Batch 2。
