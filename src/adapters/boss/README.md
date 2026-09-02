# BOSS 页面适配器目录

本目录在 Phase 1 提供由调用方传入只读 DOM root 和 selector profile 的岗位列表卡片与岗位详情纯解析器。

`syntheticFixtureJobCardSelectorProfile` 与 `syntheticFixtureJobDetailSelectorProfile` 继续描述原有人工 fixture 契约。`verifiedBossJobCardSelectorProfile` 与 `verifiedBossJobDetailSelectorProfile` 则来自 2026-09-02 用户本人 Targeted Probe、经外部网页版 ChatGPT 多样本比对的结构事实；它们不是 BOSS 官方 contract，未来可能发生 drift。

未知或未验证 selector 明确使用 `null`，parser 返回 `null`/`[]` 并写入 `missingFields`，不会猜 selector 或静默丢弃岗位。详情当前 job URL 由调用方显式传入 `currentPageUrl`，不会误用 `.job-box` 中的推荐岗位链接。详情 parser 只从 profile 指定的 JD container 提取 `fullJdText`，保留段落、列表项和 `<br>` 的基础换行，并排除 `SCRIPT`、`STYLE`、`NOSCRIPT`、`TEMPLATE`。

解析器不获取页面、不发起网络请求、不修改 DOM，也没有接入 popup。verified profiles 只通过脱敏 synthetic real-shape fixtures 验证；真实页面自动采集仍未实现。
