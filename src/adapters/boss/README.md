# BOSS 页面适配器目录

本目录在 Phase 1 提供由调用方传入只读 DOM root 和 selector profile 的岗位列表卡片与岗位详情纯解析器。

当前 `syntheticFixtureJobCardSelectorProfile` 与 `syntheticFixtureJobDetailSelectorProfile` 分别描述仓库内人工构造列表和详情 fixture 的测试契约，不代表已经映射或验证真实 BOSS DOM。详情 parser 只从 profile 指定的 JD container 提取 `fullJdText`，并保留段落、列表项和 `<br>` 形成的基础换行。

解析器不获取页面、不发起网络请求、不修改 DOM，也没有接入 popup。真实 BOSS selector、真实页面采集和真实详情完整 JD 解析均未实现或验证。
