# Phase 1 / Batch 2 fixture 岗位卡片解析器工作日志

## 本轮范围

在不访问或验证真实 BOSS 页面、不改变 Batch 1 popup 行为的前提下，建立人工构造脱敏 fixture、由 selector profile 驱动的岗位列表卡片纯解析器及其单元测试。

## 环境与基准

- 工作目录：`<repo-root>`
- 基准 commit：`9b5e1e3bb4788ec578ebc3e242f22b0ce57d475b`
- 分支：`master`
- Node.js：`v24.11.1`
- npm：`11.6.2`
- 启动工作区：干净，与 `origin/master` 同步

## 依赖

- 新增 devDependency：`happy-dom` `^20.12.2`
- 用途：仅在 Node / Vitest 中构造测试 DOM；未接入扩展运行时代码

## fixture 事实

- 新增完整单卡、字段缺失、异常链接和多岗位页面共 4 个 HTML fixture。
- fixture 全部由 Codex 根据本轮测试契约人工构造并完全脱敏，不是从真实 BOSS 页面复制或保存的 HTML。
- fixture 不代表 BOSS 当前真实 DOM，不含账号凭证、Cookie、Session 或私人数据。

## parser 数据契约

`ParsedJobCard` 保存：

- `title`、`companyName`、`salaryText`、`locationText`、`experienceText`、`educationText`；
- `tags`；
- `jobHrefRaw` 与仅在协议和 BOSS hostname 合法时生成的 `jobUrl`；
- `recruiterActivityText`、`publishedText`、`rawCardText`；
- `missingFields` 与卡片级 `warnings`。

缺失字符串为 `null`，缺失 tags 为 `[]`。解析器不根据其他字段推测未知值，不筛除字段不完整或 URL 异常的卡片，不去重，并保持 DOM 顺序。

返回值为 `JobCardParseResult`，包含 `cards` 与页面级 `warnings`。卡片 warning 使用受控代码记录 URL 解析失败、协议、hostname 或相对链接缺少合法 base URL；页面 warning 记录调用方提供的 base URL 非法。

## selector profile

`JobCardSelectorProfile` 分别描述 card、title、company、salary、location、experience、education、tags、link、recruiter activity 和 published selector。production parser 完全由调用方传入的 profile 驱动。

本轮提供的 `syntheticFixtureJobCardSelectorProfile` 只服务人工 fixture 单元测试。它不是经过验证的真实 BOSS selector profile。

## TDD 与测试

- 红灯：先加入 fixture 和测试；`npm test -- tests/job-card-parser.test.ts` 因 production parser 模块尚不存在而按预期失败。
- 绿灯：实现 parser 后，同一命令 1 个测试文件、16 项测试全部通过。
- 完整测试：`npm test` 成功，2 个测试文件、30 项测试全部通过。
- 新测试直接调用 production parser，覆盖字段提取、文本 trim、tags、相对/绝对 URL、仿冒域、恶意后缀、缺失字段、高召回保留、DOM 顺序、不去重、空页面、Element root 和 selector profile 驱动等要求。

## 命令与结果

| 命令 | 事实结果 |
| --- | --- |
| `npm install` | 成功；247 个包完成审计，0 vulnerabilities；安装过程中的 `prepare` 同样成功。 |
| `npm run prepare` | 成功；WXT 0.21.4 完成类型生成。 |
| `npm run typecheck` | 成功；退出码 0。 |
| `npm run lint` | 成功；退出码 0。 |
| `npm test` | 成功；2 个测试文件、30 项测试全部通过。 |
| `npm run build` | 成功；生成 Chrome MV3 产物，总计约 4.05 kB。 |
| `npm run build:edge` | 成功；生成 Edge MV3 产物，总计约 4.05 kB。 |
| `npm run verify:manifests` | 成功；Chrome 与 Edge 均为 MV3、存在 popup、版本 `0.1.0`，权限仅 `activeTab`。 |
| `git diff --check` | 成功；退出码 0；仅输出本机 Git 的 LF/CRLF 转换提示。 |

## 未验证与当前状态

- 未访问、登录或自动启动真实 BOSS 页面。
- 未进行真实 BOSS DOM 验证。
- 未进行真实 BOSS selector 验证。
- 未进行真实岗位采集或真实岗位列表解析验证。
- 未实现岗位详情完整 JD、JSON 导出、后端、SQLite、AI 或 Dashboard。
- 当前状态为 `implementation_complete_awaiting_external_review`，只表示本轮实现等待外部网页版 ChatGPT 审阅，不表示 Codex 作出验收结论。
