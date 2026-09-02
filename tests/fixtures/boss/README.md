# BOSS 脱敏 fixture 目录

本目录中的 HTML fixture 全部为人工构造、完全脱敏的单元测试数据，不是从真实 BOSS 页面复制或保存的 HTML，也不代表 BOSS 当前真实 DOM。

fixture 不包含账号凭证、Cookie、Session、联系方式或其他私人数据。当前 `syntheticFixtureJobCardSelectorProfile` 与 `syntheticFixtureJobDetailSelectorProfile` 分别只服务人工列表和详情 fixture 的单元测试，是测试契约，不是经过验证的真实 BOSS selector profile。

真实 BOSS selector 必须等到 Phase 2，由用户本人正常浏览页面时进行人工验证。fixture 测试通过不等于真实 BOSS 页面验证通过，也不表示程序已经能够采集真实岗位。
