# Phase 2 / Batch 1 真实 BOSS 页面人工验证记录

## 操作边界

- 用户本人已主动完成 BOSS 首页、岗位搜索结果页和岗位详情页的人工 probe。
- 三类页面的 probe 均由用户本人操作并报告成功。
- Codex 未打开或登录 BOSS，未运行真实页面自动化，也未自动点击“查看更多信息”。
- 用户报告必须本人手动点击“查看更多信息”才能进入当前独立岗位详情页；该事实不构成允许扩展自动点击的依据。

## 人工观察到的结构事实

岗位搜索结果页：

- pathname：`/web/geek/jobs`
- 观察到：`ul.rec-job-list`
- 观察到：`li.job-card-box`

岗位详情页：

- pathname pattern：`/job_detail/*.html`
- 观察到：`.job-banner`
- 观察到：`.job-primary.detail-box`
- 观察到：`.info-primary`
- 观察到：`.job-tags`
- 观察到：`.job-box`
- 观察到：`.job-sider`
- 观察到：`.sider-company`
- 观察到：`.company-info`

`.job-box` 的有限 text preview 中已观察到“职位描述”和岗位职责内容，因此真实 JD 位于该主区域内部，但精确 JD 子 selector 尚未验证。

## 隐私与结论边界

- 本记录不包含真实岗位 ID、完整详情 URL、任何 query/hash、用户姓名或公司真实敏感数据。
- 仓库未保存用户的真实 probe JSON。
- 上述 selector 仅为用户人工观察事实；本批次未建立生产 selector profile，也未验证真实字段 selector。
- 真实运行成功不代表 Phase 2 / Batch 1 已验收通过；隐私整改仍等待外部网页版 ChatGPT 审阅。
