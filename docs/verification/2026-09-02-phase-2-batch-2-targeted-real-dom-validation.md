# Phase 2 / Batch 2 Targeted Probe 真实 DOM 人工验证记录

## 验证来源与隐私边界

- 用户本人已在一个真实岗位搜索结果页和多个不同岗位详情页运行 Targeted Probe。
- 外部网页版 ChatGPT 已对用户提供的结果进行多样本结构比对。
- Codex 未访问或操作真实 BOSS 页面，也未参与真实页面验证。
- 仓库不保存用户的原始真实 JSON、真实岗位 ID、公司或招聘者信息、完整 URL、query/security 参数、账户信息或真实 PUA 映射。

## 已确认搜索页 selector

- card：`li.job-card-box`
- title / job link：`.job-name`
- salary：`.job-salary`
- experience：`.tag-list > li:nth-child(1)`
- education：`.tag-list > li:nth-child(2)`
- company：`.boss-name`
- location：`.company-location`

搜索卡片未验证到可靠的业务 tags、招聘者活跃状态或发布时间 selector，因此这些 selector 保持 `null`。经验与学历不会被重复解释为业务 tags。

## 已确认详情页 selector

- title：`.info-primary .name h1`
- salary：`.info-primary .salary`
- location：`.info-primary .text-desc.text-city`
- experience：`.info-primary .text-desc.text-experiece`
- education：`.info-primary .text-desc.text-degree`
- company display text：`.job-sider .company-info`
- JD keywords：`.job-keyword-list > li`
- full JD：`.job-sec-text`
- recruiter activity：`.boss-active-time`

`text-experiece` 是人工样本中观察到的真实 class 拼写。详情页未验证到岗位发布时间，`published` 保持 `null`；“最新”或“招聘中”不解释为发布时间。

详情页没有可靠的当前岗位 self-link selector。当前 job URL 不从 `.job-box` 中的推荐岗位链接猜测，必须由调用方显式提供当前 page URL，并在校验后清除 query/hash。

## 匿名薪资配对结论

用户完成了 3 个匿名“列表薪资 ↔ 同一岗位详情薪资”配对样本。样本证明当前测试批次中存在一致的 PUA 字符到数字映射，并包含重复交叉验证；它不证明映射可跨刷新、搜索、session、账号或日期长期复用。

仓库不保存真实映射常量。Batch 3 只实现由调用方显式传入两段文本的纯动态证据学习，不下载、解析或逆向字体。
