# Phase 2 / Batch 1 人工 DOM 验证 probe 工作日志

## 本轮范围

在 Phase 1 已经由外部网页版 ChatGPT 审阅通过的基础上，实现一个只能由用户本人从 popup 主动触发、只针对点击当刻当前活动 BOSS 页面执行一次的有限 DOM 结构诊断工具。本轮不是正式岗位采集，不建立或声称验证真实 BOSS selector，也不进行真实 BOSS 页面验证。

## 环境与基准

- 工作目录：`<repo-root>`
- 基准 commit：`aa38416e084e5da1dcbdb4dd71385fe700ce7d21`
- 分支：`master`
- Node.js：`v24.11.1`
- npm：`11.6.2`
- 启动工作区：干净，与 `origin/master` 同步

## 权限与执行边界

- Manifest permissions 从仅 `activeTab` 调整为严格的 `activeTab` + `scripting`。
- 增加 `scripting` 的唯一用途：用户在当前 BOSS 页面主动点击“人工验证当前页面”后，通过 MV3 scripting API 注入并执行一次只读 probe。
- 没有 `host_permissions`、`optional_host_permissions` 或 `<all_urls>`。
- 没有 content script，没有 background 或 service worker。
- 没有 `tabs`、`storage`、`cookies`、`webRequest`、downloads、clipboard、notifications、identity 或 management 权限。
- popup 打开本身只查询活动 tab 并分类页面，不执行 probe；点击时会重新查询活动 tab，只有点击当刻仍为 BOSS 页面且存在 tab ID 才执行。
- 不自动重试、不自动重新注入、不自动复制、不保存文件、不上传结果。

## ManualDomProbeResult

probe 返回完全可 JSON serialize 的 plain object：

- `pageUrl`：执行当刻页面的 protocol、hostname 和 pathname，不包含 query/hash；
- `pageTitle`：`document.title`；
- `timestamp`：ISO 时间字符串；
- `candidateSummary`：页面有限结构计数与候选数组；
- `warnings`：受控的 `body_missing` 或 `no_candidates`。

`candidateSummary` 包含：

- `bodyExists`；
- `visibleMainCount`、`visibleArticleCount`、`visibleSectionCount`；
- `linkCount`、`headingCount`、`visibleTextLength`；
- `documentLanguage`、`pathname`；
- `candidates`。

候选只使用通用语义元素、`role="main"`、包含 heading + link 的可见结构或重复 sibling 结构启发式，不使用任何未经验证的 BOSS 专属 class selector，也不把候选命名为岗位卡片。

## 数据上限与脱敏

- 候选数量上限：20。
- 每个 `textPreview` 上限：120 字符；空白 trim 并规范为单空格。
- 字符型属性值另设 200 字符上限。
- DOM 属性白名单只有 `className`、`role`、`aria-label`；另记录 `tagName` 与计算得到的子元素数量，不枚举全部 attributes。
- 不读取或返回 `id`、`data-*`、`onclick`、`style`、`value`、`src`、`srcset`。
- 不读取 `input.value` 或 `textarea.value`，文本摘要排除表单控件文本。
- candidate link 只保留解析后的 `hostname` 和 `pathname`，丢弃 query 与 hash。
- 不读取 `document.cookie`、`localStorage` 或 `sessionStorage`。
- 不读取 Authorization、请求 headers、密码或隐藏表单值。

## popup 交互与错误状态

- 保留页面状态、扩展版本和功能状态。
- 非 BOSS 页面不显示可执行操作；按钮保持 disabled。
- BOSS 页面显示“人工验证当前页面”按钮及“仅在你点击后读取当前页面的有限 DOM 结构摘要，不自动采集、不保存、不上传。”提示。
- 成功后只在 popup 的 `<pre>` 中显示格式化 JSON，用户可以手动选中复制。
- 结果区提示“请在发送给 ChatGPT 前自行确认内容中没有不希望分享的信息。”，不暗示自动上传。
- 对非 BOSS 页面、tab ID 缺失、scripting 失败、无注入结果、执行中导航、body 缺失和无候选提供可解释状态；不循环重试。

## TDD 与测试

- probe 红灯：先增加 probe 测试，因 production 模块尚不存在而按预期失败。
- popup 请求红灯：先增加请求协调器测试，因 production 模块尚不存在而按预期失败。
- popup 控制器红灯：先以真实 `entrypoints/popup/index.html` 增加交互测试，因控制器模块尚不存在而按预期失败。
- 点击前导航竞态红灯：先增加页面在 popup 打开后跳转到非 BOSS 时不得注入的回归测试；旧实现按预期失败，重新查询点击当刻活动 tab 后转绿。
- 隐私整改红灯：新增顶层页面 URL 脱敏和安全页面身份比较回归测试；旧实现因输出完整 query/hash、同 pathname 不同 query 被误判导航而按预期失败。
- 初始实现新增 29 项测试；隐私整改再新增 2 项回归测试，全仓最终为 7 个测试文件、87 项测试全部通过。
- 新测试覆盖 JSON-safe、顶层页面 URL query/hash 脱敏、安全页面身份比较、Cookie/storage 禁读、表单值禁读、preview 与候选上限、空白规范、DOM 顺序、hidden / `display:none` / `opacity:0`、隐藏 descendant 不作为候选依据、隐藏链接不进入链接摘要、普通可见候选、属性白名单、链接 query/hash 脱敏、无网络请求、不修改 DOM、空页面/body 缺失，以及 popup 非 BOSS 禁止执行、tab ID、scripting 错误、无结果、执行中导航、点击前导航和 warning 中文提示。
- Phase 1 的 URL 分类、共享 BOSS URL policy、card parser 和 detail parser 回归测试继续通过。

## 完整验证

| 命令 | 事实结果 |
| --- | --- |
| `npm install` | 成功；依赖已是最新，247 个包完成审计，0 vulnerabilities；安装过程中的 `prepare` 同样成功。 |
| `npm run prepare` | 成功；WXT 0.21.4 完成类型生成。 |
| `npm run typecheck` | 成功；退出码 0。 |
| `npm run lint` | 成功；退出码 0。 |
| `npm test` | 成功；7 个测试文件、87 项测试全部通过。 |
| `npm run build` | 成功；生成 Chrome MV3 产物，总计约 10.28 kB。 |
| `npm run build:edge` | 成功；生成 Edge MV3 产物，总计约 10.28 kB。 |
| `npm run verify:manifests` | 成功；Chrome 与 Edge 均为 MV3、存在 popup、版本 `0.1.0`，permissions 严格为 `activeTab` + `scripting`，且不存在禁止项。 |
| `git diff --check` | 成功；退出码 0；仅输出本机 Git 的 LF/CRLF 转换提示。 |

WXT/Vite 默认的 module preload 兼容 polyfill 包含通用 `fetch` 代码。为使最终扩展产物同样不携带网络调用代码，本轮将 Vite `build.modulePreload` 设为 `false`；重新构建后对 Chrome 与 Edge 产物扫描未发现 `fetch`、XHR 或 WebSocket。

## 安全扫描

- production source 与双浏览器构建产物未发现 `document.cookie`、storage 读取、Cookie header、Authorization、密码、验证码、API key、access token、refresh token、网络请求、XHR、WebSocket、自动点击、自动翻页、自动滚动、自动聊天、自动投递、自动打招呼、指纹伪装或反风控实现。
- probe 不读取或枚举 Cookie、localStorage、sessionStorage 或浏览器存储。
- probe 不发起网络请求，不修改输入 DOM，不改变页面状态。
- 没有调用 BOSS 私有 API，没有 fetch BOSS 页面，没有使用账号 Cookie。

## 未验证与当前状态

- Codex 未自动打开、登录或访问真实 BOSS 页面。
- 用户已报告 BOSS 首页、搜索结果页和详情页的人工 probe 均成功；Codex 未参与真实页面操作。
- 真实页面仅记录有限结构事实，未建立或验证生产列表/详情 selector profile，精确字段 selector 尚未完成。
- 未进行真实岗位采集或验证真实岗位字段。
- 未实现 JSON 导出、本地服务、SQLite、AI 或 Dashboard。
- 外部审阅当前结论为 `CHANGES_REQUIRED`：代码主体审阅通过，但顶层页面 URL query/hash 的 Medium 隐私问题需要整改。
- 隐私整改已完成实现，当前状态仍为 `implementation_complete_awaiting_external_review`，只表示整改等待外部网页版 ChatGPT 复审，不表示 Codex 作出验收结论。
- Codex 不进入 Phase 2 / Batch 2。
