# 项目状态

## 当前状态快照

- 当前阶段：`Phase 2`
- 当前批次：`Batch 2 - targeted real DOM structure probe`
- 当前状态：`implementation_complete_awaiting_external_review`
- 已通过的最后 commit：`7bb980bd48a1af1dcd2b8105e1557d51662b29cd`
- Phase 0：`PASS`
- Phase 1：`PASS`
- Phase 1 / Batch 1：`PASS`
- Phase 1 / Batch 2：`PASS`
- Phase 1 / Batch 3：`PASS`
- Phase 1 / Batch 1 人工浏览器验证：用户报告 `PASS`
- Phase 2 / Batch 1：`PASS`
- Phase 2 / Batch 1 privacy repair：`PASS`
- 真实 BOSS 首页 probe：用户报告成功
- 真实 BOSS 搜索结果页：用户报告 probe 成功，已确认 `ul.rec-job-list` 列表容器和 `li.job-card-box` 岗位卡片容器
- 真实 BOSS 详情页：用户报告 probe 成功，已确认若干详情区域，但字段级 selector 尚未完成
- 真实页面结构：Targeted Probe 只绑定已经由用户人工确认的诊断区域，尚未建立生产 selector profile
- Phase 2 / Batch 2：Targeted Probe 实现完成，等待外部审阅
- Phase 2 / Batch 3：不得开始
- 真实岗位采集：未进行
- 当前阻塞：等待外部网页版 ChatGPT 审阅 Phase 2 / Batch 2 实现
- 权限边界：Codex 无权自行宣布本批次通过或进入 Phase 2 / Batch 3
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

> Codex 已完成 Phase 2 / Batch 2 本轮要求的实现内容，等待外部审阅。

它不表示：

- Phase 2 / Batch 2 已验收通过；
- 字段级真实 BOSS DOM 已经完成验证；
- 项目可以自行进入 Phase 2 / Batch 3。

只有外部网页版 ChatGPT 审阅 GitHub 中的真实 commit 后，才能决定是否更新验收状态或进入下一阶段。

## 能力现状

仓库当前包含最小浏览器扩展工程、共享 BOSS URL policy，以及由各自 synthetic selector profile 驱动的人工 fixture 岗位卡片和岗位详情纯解析器。详情解析器能从 fixture 指定的 JD container 提取并保留基础换行结构。上述 parser 均尚未映射或验证真实 BOSS DOM。

popup 现已保留用户主动触发的通用有限 DOM 结构诊断，并增加只在已支持搜索结果页或独立岗位详情页显示的 Targeted DOM Structure Probe。两种 probe 都只在对应按钮被用户点击后执行一次，结果只显示在 popup，不保存、不上传、不发网络请求。

用户已报告 BOSS 首页、搜索结果页和详情页的通用人工 probe 均成功。搜索页列表/卡片容器以及详情页主要区域已经形成人工观察事实；本轮只在 `manual-validation` 诊断上下文中对这些区域做有界结构摘要，未形成生产 selector profile，也未接入既有岗位 parser。

项目没有真实页面采集、JSON 导出、本地服务、数据库、AI 分析或 Dashboard，仍不是可采集真实 BOSS 岗位的程序。
