# Phase 1 / Batch 3 fixture 岗位详情解析器工作日志

## 本轮范围

在不访问或验证真实 BOSS 页面、不改变既有 popup 外部行为的前提下，先抽取共享 BOSS URL policy，再建立人工构造脱敏岗位详情 fixture、独立详情 selector profile、`ParsedJobDetail` DTO、完整 JD 文本转换 helper 与纯详情解析器。

## 环境与基准

- 工作目录：`<repo-root>`
- 基准 commit：`dc5fc5e8713746532e4fca616867121110997535`
- 分支：`master`
- Node.js：`v24.11.1`
- npm：`11.6.2`
- 启动工作区：干净，与 `origin/master` 同步

## 共享 BOSS URL policy

- 新增 `src/shared/boss-url-policy.ts`，集中提供合法 BOSS hostname、支持的 `http:` / `https:` 协议以及完整 BOSS URL 基础判断。
- 合法 hostname 仅为 `zhipin.com` 或其子域；`fake-zhipin.com` 与 `zhipin.com.evil.example` 均被拒绝。
- `src/page-context.ts` 与 `src/adapters/boss/job-card-parser.ts` 已复用共享 policy，原有页面分类、卡片 URL 和 warning 外部行为保持不变。
- 详情 parser 同样复用该 policy，没有复制第三套 hostname 规则。

## ParsedJobDetail 数据契约

`ParsedJobDetail` 是单次详情 DOM 解析 DTO，不是数据库 `Job`，也不是 AI 分析结果。字段包括：

- `title`、`companyName`、`salaryText`、`locationText`、`experienceText`、`educationText`；
- `tags`；
- `jobHrefRaw`、`jobUrl`；
- `recruiterActivityText`、`publishedText`；
- `fullJdText`、`rawDetailText`；
- `missingFields`、`warnings`。

缺失字符串使用 `null`，缺失 tags 使用 `[]`。`missingFields` 是受控字段名数组，覆盖 title、company、salary、location、experience、education、tags、raw href、招聘者活跃度、发布时间和完整 JD。`warnings` 是受控代码数组，覆盖 base URL 无效、岗位 URL 无法解析、协议不支持、hostname 非法以及相对链接缺少合法 base URL。

## 完整 JD 文本策略

- `fullJdText` 只读取 selector profile 指定的 JD container，不使用摘要或其他字段替代，也不生成、推测或改写业务内容。
- 小型确定性 DOM-to-text helper 将段落、列表项、常见块级元素和 `<br>` 转换为换行。
- 每行周围无意义空白被清理，重复水平空白规范为单个空格，连续换行压缩为单个换行，DOM 顺序保持不变。
- JD container 缺失或没有有效文本时，`fullJdText` 为 `null` 并记录到 `missingFields`，详情 DTO 仍然返回。
- `rawDetailText` 独立表示整个调用方 root 的可观察文本，并只做基础空白规范化，不冒充完整 JD。

## selector profile 与 fixtures

- 新增独立 `JobDetailSelectorProfile`，字段为 `title`、`company`、`salary`、`location`、`experience`、`education`、`tags`、`link`、`recruiterActivity`、`published` 和 `fullJd`。
- `syntheticFixtureJobDetailSelectorProfile` 只描述本轮人工 fixture 测试契约，与 `JobCardSelectorProfile` 保持独立，不代表真实 BOSS selector。
- 新增 `job-detail-complete.html`、`job-detail-multiline-jd.html`、`job-detail-missing-fields.html` 和 `job-detail-invalid-link.html`。
- 4 个详情 fixture 全部为人工构造、完全脱敏的数据，不来自真实 BOSS HTML，不包含 Cookie、Session、账号数据、招聘者私人联系方式或求职者数据。

## TDD 与测试

- 共享 policy 红灯：先添加测试，`npm test -- tests/boss-url-policy.test.ts` 因 production 模块尚不存在而按预期失败；实现与既有模块重构后，相关 3 个测试文件、42 项测试通过。
- 详情 parser 红灯：先添加 4 个 fixture 和 production parser 测试，`npm test -- tests/job-detail-parser.test.ts` 因 production 模块尚不存在而按预期失败；实现后该文件 14 项测试全部通过。
- 本轮新增 26 项测试，其中共享 policy 12 项、详情 parser 14 项。
- 全仓测试最终为 4 个测试文件、56 项测试全部通过。
- 覆盖完整字段、相对与绝对 BOSS URL、外部与仿冒 hostname、raw href 保留、字段缺失高召回、不可推测字段、完整 JD container 边界、段落/列表/`<br>` 顺序、空白规范、Element root 和 selector profile 驱动等行为。

## 完整验证

| 命令 | 事实结果 |
| --- | --- |
| `npm install` | 成功；依赖已是最新，247 个包完成审计，0 vulnerabilities；安装过程中的 `prepare` 同样成功。 |
| `npm run prepare` | 成功；WXT 0.21.4 完成类型生成。 |
| `npm run typecheck` | 成功；退出码 0。 |
| `npm run lint` | 成功；退出码 0。 |
| `npm test` | 成功；4 个测试文件、56 项测试全部通过。 |
| `npm run build` | 成功；生成 Chrome MV3 产物，总计约 4.14 kB。 |
| `npm run build:edge` | 成功；生成 Edge MV3 产物，总计约 4.14 kB。 |
| `npm run verify:manifests` | 成功；Chrome 与 Edge 均为 MV3、存在 popup、版本 `0.1.0`，权限仅 `activeTab`。 |
| `git diff --check` | 成功；退出码 0；仅输出本机 Git 的 LF/CRLF 转换提示。 |

## 安全扫描

- 对新增 production parser、共享 policy、详情测试和详情 fixtures 扫描后，未发现 Cookie、Session、Authorization、密码、验证码、API key、access token、refresh token、真实账号数据、真实聊天内容、真实招聘者私人联系方式、真实求职者数据或真实 BOSS 登录态 HTML。
- 未新增 content script、background、host permission、optional permission、BOSS 网络请求、私有 API、自动点击、自动翻页、自动滚动、自动投递、自动聊天、自动打招呼、浏览器指纹伪装或反风控能力。
- Chrome 与 Edge 构建产物 Manifest 的 `permissions` 均精确为 `activeTab`。

## 未验证与当前状态

- 未访问、登录或自动启动真实 BOSS 页面。
- 未进行真实 BOSS DOM 验证。
- 未进行真实详情 selector 验证。
- 未进行真实岗位采集。
- 未实现真实 BOSS selector profile、真实采集接入、JSON 导出、本地服务、SQLite、AI 或 Dashboard。
- 当前状态为 `implementation_complete_awaiting_external_review`，只表示本轮实现等待外部网页版 ChatGPT 审阅，不表示 Codex 作出 Batch 3 验收结论。
