# 项目状态

## 当前状态快照

- 当前阶段：`Phase 2`
- 当前批次：`Batch 3 - verified real selector profiles and parser integration`
- 当前状态：`implementation_complete_awaiting_external_review`
- 已通过的最后 commit：`29f2b77bbf6f7f299a312ef26786639d4a5aedf6`
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
- 真实 BOSS 详情页：用户报告多个 Targeted Probe 样本成功，字段级 selector 已经外部多样本比对
- 真实页面结构：用户已完成搜索页和多个详情页 Targeted Probe，外部网页版 ChatGPT 已完成多样本结构比对
- Phase 2 / Batch 2：`PASS`
- Phase 2 / Batch 3：verified selector profiles、纯 parser 接入和动态薪资映射核心实现完成，等待外部审阅
- 真实 search selector：已形成 verified profile；业务 tags、招聘者活跃状态和发布时间保持未知
- 真实 detail selector：已形成 verified profile；发布时间保持未知，当前岗位 URL 由调用方显式提供
- salary PUA：已建立纯内存、动态、证据驱动的 mapping core；未硬编码真人映射，未下载、解析或逆向字体
- 真实岗位采集：未进行
- 当前阻塞：等待外部网页版 ChatGPT 审阅 Phase 2 / Batch 3 实现
- 权限边界：Codex 无权自行宣布本批次通过或进入下一批
- 尚未开发或验证：
  - 真实 BOSS DOM 采集接入
  - JSON 导出
  - 本地服务
  - SQLite
  - AI
  - Dashboard

## 状态语义

这里的 `implementation_complete` 只表示：

> Codex 已完成 Phase 2 / Batch 3 本轮要求的实现内容，等待外部审阅。

它不表示：

- Phase 2 / Batch 3 已验收通过；
- verified selector 是 BOSS 官方或永久稳定的 contract；
- 项目可以自行进入下一批。

只有外部网页版 ChatGPT 审阅 GitHub 中的真实 commit 后，才能决定是否更新验收状态或进入下一阶段。

## 能力现状

仓库当前包含最小浏览器扩展工程、共享 BOSS URL policy，以及 synthetic fixture profiles 和经真人多样本人工验证的 BOSS selector profiles。岗位卡片与详情 parser 仍是由调用方传入 DOM root 的纯函数；详情 parser 只从 `.job-sec-text` 提取 JD，保留合理换行并排除 `SCRIPT`、`STYLE`、`NOSCRIPT`、`TEMPLATE`。selector 失效或字段未知时保留记录并显式报告 missing field。

popup 现已保留用户主动触发的通用有限 DOM 结构诊断，并增加只在已支持搜索结果页或独立岗位详情页显示的 Targeted DOM Structure Probe。两种 probe 都只在对应按钮被用户点击后执行一次，结果只显示在 popup，不保存、不上传、不发网络请求。

用户已报告 BOSS 首页、搜索结果页和详情页的人工 probe 均成功，并已完成搜索页和多个详情页的 Targeted Probe。外部网页版 ChatGPT 已从匿名样本确认字段级 selector；本轮将它们与 synthetic profiles 明确分离并通过脱敏 real-shape fixtures 接入纯 parser。

列表 parser 继续忠实保留原始薪资 DOM 文本，不自动解码 PUA。独立 salary mapping core 只根据调用方提供的列表原文和已验证详情薪资学习当前内存映射；结构不一致、非数字映射、映射不完整或冲突均返回明确状态，不猜测薪资，也不持久化映射。

项目没有真实页面自动采集、自动打开详情、JSON 导出、本地服务、数据库、AI 分析或 Dashboard，仍不是可采集真实 BOSS 岗位的程序。下一批不得自行开始。
