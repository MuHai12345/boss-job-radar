# 项目状态

## 当前状态快照

- 当前阶段：`Phase 2`
- 当前批次：`Batch 1 - manual DOM validation probe`
- 当前状态：`implementation_complete_awaiting_external_review`
- 已通过的最后 commit：`aa38416e084e5da1dcbdb4dd71385fe700ce7d21`
- Phase 0：`PASS`
- Phase 1：`PASS`
- Phase 1 / Batch 1：`PASS`
- Phase 1 / Batch 2：`PASS`
- Phase 1 / Batch 3：`PASS`
- Phase 1 / Batch 1 人工浏览器验证：用户报告 `PASS`
- Phase 2 / Batch 1：`CHANGES_REQUIRED - privacy repair pending external review`
- 已完成：顶层 `pageUrl` query/hash 脱敏与安全页面身份导航比较整改（仍等待外部审阅）
- 真实 BOSS 首页 probe：用户报告成功
- 真实 BOSS 搜索结果页 probe：用户报告成功
- 真实 BOSS 详情页 probe：用户报告成功
- 真实页面结构：仅记录用户人工观察事实，尚未建立生产 selector profile
- 真实字段 selector：尚未完成
- 真实岗位采集：未进行
- Phase 2 / Batch 2：未开始
- 当前阻塞：等待外部网页版 ChatGPT 审阅隐私整改
- 权限边界：Codex 无权自行进入 Phase 2 / Batch 2
- 尚未开发或验证：
  - 真实 BOSS selector profile
  - 真实 BOSS DOM 采集接入
  - JSON 导出
  - 本地服务
  - SQLite
  - AI
  - Dashboard

## 状态语义

这里的 `implementation_complete` 只表示：

> Codex 已完成 Phase 2 / Batch 1 本轮要求的实现内容，等待外部审阅。

它不表示：

- Phase 2 / Batch 1 已验收通过；
- 真实 BOSS DOM 已经完成验证；
- 项目可以自行进入 Phase 2 / Batch 2。

只有外部网页版 ChatGPT 审阅 GitHub 中的真实 commit 后，才能决定是否更新验收状态或进入下一阶段。

## 能力现状

仓库当前包含最小浏览器扩展工程、共享 BOSS URL policy，以及由各自 synthetic selector profile 驱动的人工 fixture 岗位卡片和岗位详情纯解析器。详情解析器能从 fixture 指定的 JD container 提取并保留基础换行结构。上述 parser 均尚未映射或验证真实 BOSS DOM。

popup 现已提供用户主动触发的当前活动 BOSS 页面有限 DOM 结构诊断。probe 只在点击后执行一次，结果只显示在 popup，不保存、不上传、不发网络请求，也不使用真实 BOSS 专属 selector。用户已完成真实页面人工 probe，该能力的隐私整改仍等待外部审阅。

用户已报告 BOSS 首页、搜索结果页和详情页的人工 probe 均成功。真实验证仅形成有限结构事实，未形成生产 selector profile；同时发现的顶层页面 URL query/hash 隐私问题已经完成代码整改，当前仍为 `CHANGES_REQUIRED` 并等待外部审阅。

项目没有真实页面采集、JSON 导出、本地服务、数据库、AI 分析或 Dashboard，仍不是可采集真实 BOSS 岗位的程序。
