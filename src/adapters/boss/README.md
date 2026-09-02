# BOSS 页面适配器目录

本目录在 Phase 1 / Batch 2 提供由调用方传入只读 DOM root 和 selector profile 的岗位列表卡片纯解析器。

当前 `syntheticFixtureJobCardSelectorProfile` 仅描述仓库内人工构造 fixture 的测试契约，不代表已经映射或验证真实 BOSS DOM。解析器不获取页面、不发起网络请求、不修改 DOM，也没有接入 popup。

真实 BOSS selector、真实页面采集和岗位详情完整 JD 解析均未实现或验证。
