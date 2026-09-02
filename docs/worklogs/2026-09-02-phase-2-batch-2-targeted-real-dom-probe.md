# Phase 2 / Batch 2 Targeted Real DOM Structure Probe 工作日志

## 范围与接手状态

- 工作目录：`<repo-root>`
- 分支：`master`
- 基准 commit：`7bb980bd48a1af1dcd2b8105e1557d51662b29cd`
- Phase 2 / Batch 1：外部网页版 ChatGPT 已审阅为 `PASS`
- 接手时 HEAD：`7bb980bd48a1af1dcd2b8105e1557d51662b29cd`
- 接手时工作区：干净，与 `origin/master` 同步
- 交接判断：未发现上一 Codex 窗口留下的 Batch 2 文件修改或本地 commit；本窗口从干净基准完成本批次实现
- 当前状态：`implementation_complete_awaiting_external_review`

本轮只建立第二级、受限的岗位字段深层结构诊断 Probe。它不是正式岗位采集器，不建立 production selector profile，不保存解析结果，不自动操作 BOSS 页面。

## 人工确认事实来源与诊断作用域

诊断 selector 来自用户本人正常浏览 BOSS 并运行受控通用 Probe 后报告的真实观察，不是 Codex 猜测：

- 搜索 pathname：`/web/geek/jobs`
- 人工确认列表容器：`ul.rec-job-list`
- Targeted search root：`li.job-card-box`
- 详情 pathname pattern：`/job_detail/*.html`
- Targeted detail roots：`.info-primary`、`.job-tags`、`.job-box`、`.job-sider`
- 用户仍需本人手动点击“查看更多信息”进入独立岗位详情页；扩展没有实现该点击

这些 selector 只存在于 `src/manual-validation/targeted-dom-probe.ts`，没有写入 `JobCardSelectorProfile` 或 `JobDetailSelectorProfile`，也没有连接 `job-card-parser` 或 `job-detail-parser`。

## 输出与限制

搜索结果页：

- 返回当前 DOM 的 `matchedCardCount`；
- `matchedCardCount` / `matchedCount` 保留 selector 的原始 DOM 匹配数量；
- 排除隐藏 root 后，只采样 DOM 顺序中的前 3 张可诊断 `li.job-card-box`，不去重；
- 每张卡片最多 60 个 flat preorder nodes，最大深度 5；
- 每个节点的 `directTextPreview` 最多 80 字符。

详情页：

| Target | 最大 nodes | 最大深度 |
| --- | ---: | ---: |
| `.info-primary` | 80 | 6 |
| `.job-tags` | 50 | 5 |
| `.job-box` | 160 | 8 |
| `.job-sider` | 80 | 6 |

- 每个详情 target 最多采样 1 个 root；
- 每个节点的 `directTextPreview` 最多 100 字符；
- 每个 root 的 `rootTextPreview` 最多 300 字符；
- 达到节点或深度限制时设置 `truncated: true`；
- 不输出完整 JD。

节点摘要属性白名单只有 `className`、`role`、`aria-label`、`title`，另包含计算得到的 `depth`、`tagName`、`directTextPreview`、`childElementCount`、脱敏 `link` 和 PUA 存在标记。没有输出 `id`、`data-*`、`style`、`onclick`、`value`、`src`、`srcset`、`outerHTML` 或 `innerHTML`。

链接只保留 `hostname` 和 `pathname`。顶层 `pageUrl` 只保留 protocol、hostname 和 pathname；页面导航身份使用同一规则，因此 query/hash 不输出，也不影响同页面判断。

Unicode Private Use Area 字符在受限的原始 `directTextPreview` 中保持原样，并通过 `containsPrivateUseCharacters` 标记节点直接文本中是否存在。未下载字体、未逆向字体映射、未猜测薪资数字、未实现解码或反混淆。

## popup 与执行边界

- 保留原有“人工验证当前页面”通用 Probe；
- 新增独立“深度验证岗位结构”按钮和结果区；
- popup 打开不执行任一 Probe；
- Targeted 按钮只在受支持搜索页或详情页显示；
- 用户点击时重新查询 active tab，重新验证 BOSS hostname、受支持 pathname 和 tab ID；
- 每次点击最多执行一次，不自动重试；
- 不自动复制、不保存文件、不上传。

## TDD 与测试

- 先新增 Targeted DOM、请求协调器和 popup 行为测试；首次运行因目标模块和控件不存在而按预期失败。
- PUA 截断边界测试先观察到旧实现只检查预览文本而失败，随后改为对节点完整直接文本做存在性检测，同时继续限制输出预览长度。
- 独立代码审阅后，增加隐藏 root 不占用采样槽位和 Probe 执行中防并发点击的回归测试。
- Batch 2 新增 42 项测试；全仓最终为 9 个测试文件、129 项测试。
- 覆盖支持页面分类、query/hash 无关性、只扫描批准 roots、前三张采样、DOM 顺序、node/depth/text limits、`truncated`、属性白名单、链接脱敏、PUA 只检测、隐藏节点排除、viewport 下方现有 DOM、详情 target 缺失 warning、页面导航身份、JSON-safe、Cookie/storage/form value 禁读、无网络、无 DOM 修改、无 click/scroll/focus/event，以及 Generic Probe 和 Phase 1 parser 回归。

## 完整验证

环境：Node.js `v24.11.1`，npm `11.6.2`。

| 命令 | 结果 |
| --- | --- |
| `npm install` | 成功；依赖已是最新，审计 247 packages，0 vulnerabilities；同时执行 prepare 成功 |
| `npm run prepare` | 成功；WXT 0.21.4 types 生成完成 |
| `npm run typecheck` | 成功；exit 0 |
| `npm run lint` | 成功；exit 0 |
| `npm test` | 成功；9 files、129 tests 全部通过 |
| `npm run build` | 成功；Chrome MV3 构建完成 |
| `npm run build:edge` | 成功；Edge MV3 构建完成 |
| `npm run verify:manifests` | 成功；Chrome / Edge 均为 MV3、popup、version 0.1.0、仅 activeTab + scripting |
| `git diff --check` | 成功；exit 0，仅有 Windows 工作区 LF/CRLF 转换提示 |

## 权限与安全扫描

- Manifest permissions 未变化，严格为 `activeTab`、`scripting`。
- 没有 `tabs`、`storage`、`cookies`、`webRequest`、downloads、clipboard、notifications、identity 或 management 权限。
- 没有 `host_permissions`、`optional_host_permissions`、`optional_permissions` 或 `<all_urls>`。
- 没有 content script、background 或 service worker。
- 对 `entrypoints`、`src`、Chrome 构建产物和 Edge 构建产物执行禁止项扫描；没有发现新增 `document.cookie`、storage 读取、`fetch`、`XMLHttpRequest`、`WebSocket`、自动 click/scroll、自动翻页、自动“查看更多信息”、自动聊天/投递/打招呼、Authorization/token 读取、字体下载/映射逆向、薪资 PUA 解码、反风控或指纹伪装实现。
- 自动化测试以抛错 getter 验证不读取 Cookie、localStorage、sessionStorage、indexedDB、Cache Storage 和表单 value，并验证不发网络请求、不修改 DOM、不调用 click、scroll、focus 或 dispatchEvent。

## 明确未做

- 未建立 production selector profile；
- 未把人工诊断 selector 接入 production parser；
- 未保存或提交用户真实 probe JSON、真实岗位 ID、完整岗位 URL、query/security 参数或用户账户姓名；
- Codex 未打开、登录或访问真实 BOSS 页面，未运行真实 Targeted Probe，未点击“查看更多信息”；
- 未开始 Phase 2 / Batch 3。

本轮实现与验证结果等待外部网页版 ChatGPT 独立审阅。只有外部审阅者可以作出验收结论，并决定是否安排用户下一步人工验证。
