# 项目状态

## 当前状态快照

- 当前阶段：`Phase 1`
- 当前批次：`Batch 2 - fixture-based job card parser`
- 当前状态：`implementation_complete_awaiting_external_review`
- 已通过的最后 commit：`9b5e1e3bb4788ec578ebc3e242f22b0ce57d475b`
- Phase 0：`PASS`
- Phase 1 / Batch 1：`PASS`
- Batch 1 人工浏览器验证：用户报告 `PASS`
- 已完成：Phase 1 / Batch 2 fixture parser 实现（仅表示 Codex 已完成本轮实现，仍等待外部审阅）
- 真实 BOSS DOM 验证：未进行
- 真实 BOSS 岗位列表 selector 验证：未进行
- 真实岗位列表解析验证：未进行
- 当前阻塞：等待外部网页版 ChatGPT 审阅 Batch 2 commit
- 权限边界：Codex 无权自行进入 Batch 3 或 Phase 2
- 尚未开发或验证：
  - 真实 BOSS selector profile
  - 真实 BOSS DOM 采集
  - 岗位详情完整 JD 解析
  - JSON 导出
  - 后端
  - SQLite
  - AI
  - Dashboard

## 状态语义

这里的 `implementation_complete` 只表示：

> Codex 已完成 Phase 1 / Batch 2 本轮要求的实现内容，等待外部审阅。

它不表示：

- Phase 1 / Batch 2 已验收通过；
- 项目可以自行进入 Batch 3 或 Phase 2；
- Batch 2 外部审阅已经完成。

只有外部网页版 ChatGPT 审阅 GitHub 中的真实 commit 后，才能决定是否更新验收状态或进入下一阶段。

## 能力现状

仓库当前包含最小浏览器扩展工程、页面 hostname 识别能力，以及由 synthetic selector profile 驱动的人工 fixture 岗位卡片纯解析器。该 parser 尚未映射或验证真实 BOSS DOM，也没有接入 popup。

项目没有真实页面采集、岗位详情完整 JD 解析、后端、本地服务、数据库、AI 分析或 Dashboard，仍不是可采集真实 BOSS 岗位的程序。
