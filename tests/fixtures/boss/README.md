# BOSS 脱敏 fixture 目录

本目录中的 HTML fixture 全部为人工构造、完全脱敏的单元测试数据，不是从真实 BOSS 页面复制或保存的 HTML，也不代表 BOSS 当前真实 DOM。

fixture 不包含账号凭证、Cookie、Session、联系方式或其他私人数据。当前 `syntheticFixtureJobCardSelectorProfile` 与 `syntheticFixtureJobDetailSelectorProfile` 分别只服务人工列表和详情 fixture 的单元测试，是测试契约，不是经过验证的真实 BOSS selector profile。

`tests/fixtures/boss-verified-shape/` 中的 HTML 同样全部为人工手写和脱敏数据，只模拟 2026-09-02 用户本人 Targeted Probe、经外部网页版 ChatGPT 多样本比对后确认的 DOM 层级。它不包含用户原始 HTML/JSON、真实公司、招聘者、岗位 ID、完整 URL 或真人 PUA mapping。

fixture 测试通过不等于 verified selector 是 BOSS 官方或永久稳定的 contract，也不表示程序已经能够自动采集真实岗位。
