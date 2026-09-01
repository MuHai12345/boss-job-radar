# BOSS直聘 AI 岗位雷达

`boss-job-radar` 是面向个人求职场景的岗位辅助工具项目，目标是在用户本人正常使用 BOSS直聘 的前提下，帮助发现、保存和后续分析上海的电商运营入门岗位。

GitHub 仓库：<https://github.com/MuHai12345/boss-job-radar>

## 当前阶段

当前处于 **Phase 0：项目基线**，状态为 `implementation_complete_awaiting_external_review`。

当前仓库只包含项目文档、治理基线、目录结构、双角色协作规则和长期仓库记忆，尚未形成可以实际采集或分析 BOSS 岗位的可用程序。

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

## 当前边界

- 搜索城市固定为上海，核心方向是电商运营入门岗位。
- 追求高召回，低分或信息不完整岗位只能被降级或标记，不能被静默隐藏。
- 只规划读取用户当前页面已经展示的 DOM，不调用 BOSS 私有 API。
- 不获取或导出 Cookie、Session、密码或验证码。
- 不自动投递、自动打招呼、自动聊天、自动翻页或后台无人值守浏览。
- 最终查看和投递决定由用户本人完成。

后续阶段均需外部网页版 ChatGPT 独立审阅并明确批准；本仓库当前不得自行进入 Phase 1。
