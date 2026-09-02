# Phase 2 / Batch 3 Verified Real Selectors 工作日志

## 范围与接手状态

- 工作目录：`<repo-root>`
- 分支：`master`
- 基准 commit：`29f2b77bbf6f7f299a312ef26786639d4a5aedf6`
- Phase 2 / Batch 2：外部网页版 ChatGPT 已审阅为 `PASS`
- 接手时 HEAD：与基准 commit 一致
- 接手时工作区：干净，与 `origin/master` 同步
- 当前状态：`implementation_complete_awaiting_external_review`

本轮只实现 verified selector profiles、基于调用方 DOM root 的纯 parser 接入、脱敏 synthetic real-shape fixtures、纯动态 salary character mapping core、测试和文档。未实现真实页面自动采集或任何自动页面交互。

## 真人 Targeted Probe 验证事实

用户本人已完成一个真实搜索结果页和多个不同岗位详情页的 Targeted Probe。外部网页版 ChatGPT 已完成多样本结构比对；Codex 未访问真实 BOSS 页面，仓库未保存用户原始 JSON、真实岗位 ID、公司、招聘者、完整 URL、query/security 参数、账户信息或真实 PUA mapping。

verified search profile：

| 字段 | selector |
| --- | --- |
| card | `li.job-card-box` |
| title / link | `.job-name` |
| salary | `.job-salary` |
| experience | `.tag-list > li:nth-child(1)` |
| education | `.tag-list > li:nth-child(2)` |
| company | `.boss-name` |
| location | `.company-location` |
| tags | `null` |
| recruiter activity | `null` |
| published | `null` |

verified detail profile：

| 字段 | selector |
| --- | --- |
| title | `.info-primary .name h1` |
| salary | `.info-primary .salary` |
| location | `.info-primary .text-desc.text-city` |
| experience | `.info-primary .text-desc.text-experiece` |
| education | `.info-primary .text-desc.text-degree` |
| company | `.job-sider .company-info` |
| tags | `.job-keyword-list > li` |
| recruiter activity | `.boss-active-time` |
| full JD | `.job-sec-text` |
| link | `null` |
| published | `null` |

这些 selector 来自 2026-09-02 人工验证并经外部多样本比对，但不是 BOSS 官方 contract，未来可能失效。parser 对未知或失效字段返回 `null`/`[]` 并写入 `missingFields`，不猜 selector，不 silent drop 岗位。

## Parser 与 currentPageUrl

- synthetic fixture profiles 保持不变并继续通过原有测试。
- selector profile 接口只将实际未验证字段扩展为 `string | null`：card 的 `tags`、`recruiterActivity`、`published`，detail 的 `link`、`published`。
- 新增薄 wrapper `parseVerifiedBossJobCards` 与 `parseVerifiedBossJobDetail`，复用原有 parser，不复制实现，不读取 `document.location`。
- detail 的当前 job URL 由调用方显式传入 `currentPageUrl`；只接受 HTTP/HTTPS、无 URL userinfo、`zhipin.com` 或合法子域，以及单层 `/job_detail/*.html` pathname。
- 合法 `currentPageUrl` 清除 query/hash 后同时作为 `jobHrefRaw` 和 `jobUrl`；非法值返回 `invalid_current_page_url`，且不 fallback 到 `.job-box` 中的推荐岗位链接。
- full JD 只从 `.job-sec-text` 提取，不混入公司、招聘者、安全提示或推荐岗位区域。
- `domElementToStructuredText` 保留 `<br>` 和块级节点形成的合理换行，并忽略 `SCRIPT`、`STYLE`、`NOSCRIPT`、`TEMPLATE`。

## Synthetic real-shape fixtures

- 新增 1 个搜索列表 fixture，包含 2 张卡片和 synthetic PUA 薪资。
- 新增 3 个不同详情 fixture；`.job-box` 同时包含公司信息、`.job-sec-text`、招聘者、安全提示和推荐岗位。
- fixtures 全部人工手写并脱敏，只使用虚构公司、招聘者与 `example-*` URL；未复制用户真实 HTML/JSON。

## Salary character mapping core

- 独立模块位于 `src/domain/salary/salary-character-mapping.ts`，只接收调用方提供的 raw list salary 和 verified detail salary。
- mapping state 为纯内存 `active` / `conflicted` 数据结构，不访问 DOM、browser API、storage、文件或网络，不持久化。
- evidence 按 Unicode code point 对齐；非 PUA 字符必须逐字符一致，PUA 只能对应 ASCII `0-9`，长度或结构无法对齐时拒绝。
- evidence 与已有映射冲突时进入 `conflicted`，不覆盖旧值；冲突状态下 decode 始终返回 `mapping_conflict` 和 `decodedText: null`。
- decode 状态为 `plain_text`、`verified_mapping`、`incomplete_mapping`、`mapping_conflict`、`invalid_input`。
- 未知 PUA 返回 `incomplete_mapping` 和 `decodedText: null`，不会输出半真半假的部分解码工资。
- parser 的 `salaryText` 始终保留原始 DOM 文本；mapping 没有接入 parser 主流程。
- production source 没有硬编码任何真人 PUA 到数字映射，没有下载、解析或逆向字体，也没有读取 `@font-face` 或字体 glyph。

## TDD 与测试

- 先新增 verified profile/parser 与 salary mapping 测试；首次运行因 profile、wrapper 和 salary 模块尚不存在而按预期失败。
- 完成最小实现后，新增的 3 个测试文件、22 项测试全部通过。
- 全仓最终为 12 个测试文件、151 项测试，全部通过；原有 synthetic fixture 与 manual probe 测试保持通过。
- 覆盖多 card、字段缺失不丢卡片、raw PUA salary、明确未知 selector、3 个 detail fixtures、`currentPageUrl` 清洗/拒绝、推荐岗位隔离、JD `<br>` 换行、四类节点排除、严格 evidence 学习、冲突、incomplete decode、supplementary PUA、输入不变和无 DOM/storage/network 访问。

## 完整验证

环境：Node.js `v24.11.1`，npm `11.6.2`。

| 命令 | 结果 |
| --- | --- |
| `npm install` | 成功；依赖已是最新，审计 247 packages，0 vulnerabilities；同时执行 prepare 成功 |
| `npm run prepare` | 成功；WXT 0.21.4 types 生成完成 |
| `npm run typecheck` | 成功；exit 0 |
| `npm run lint` | 成功；exit 0 |
| `npm test` | 成功；12 files、151 tests 全部通过 |
| `npm run build` | 成功；Chrome MV3 构建完成 |
| `npm run build:edge` | 成功；Edge MV3 构建完成 |
| `npm run verify:manifests` | 成功；Chrome / Edge 均为 MV3、popup、version 0.1.0、仅 `activeTab` + `scripting` |
| `git diff --check` | 成功；exit 0，仅有 Windows 工作区 LF/CRLF 转换提示 |

## Manifest 与安全扫描

- Manifest permissions 未变化，严格为 `activeTab`、`scripting`。
- 没有 `tabs`、`storage`、`cookies`、`webRequest`、`host_permissions`、`optional_permissions`、`optional_host_permissions` 或 `<all_urls>`。
- 没有 background、service worker 或 content script。
- 对 `src`、`entrypoints`、Chrome 构建产物和 Edge 构建产物执行禁止项扫描；未发现新增 Cookie/storage 读取、`fetch`、`XMLHttpRequest`、`WebSocket`、自动 click/scroll/翻页/“查看更多信息”、Authorization/token 读取、字体下载/映射逆向、反风控、指纹伪装或验证码处理。
- salary mapping 测试使用会抛错的 browser/storage globals 与 network spy，验证核心逻辑不访问这些能力。

## 明确未做

- 未让 popup 自动或手动 parse 当前真实页面；
- 未实现真实 BOSS 页面自动采集、自动打开详情、自动采样 evidence、自动点击、自动滚动、自动翻页或自动“查看更多信息”；
- 未读取 Cookie/storage，未发网络请求，未访问 BOSS 私有 API；
- 未增加 JSON 导出、本地服务、SQLite、AI 或 Dashboard；
- Codex 未打开、登录或访问真实 BOSS 页面；
- 未自行宣布 Batch 3 `PASS`，未进入下一批。

本轮实现完成，状态为 `implementation_complete_awaiting_external_review`，等待外部网页版 ChatGPT 独立审阅。

## 外部审阅 privacy/scope repair

外部网页版 ChatGPT 对 commit `a91d1a331ca7f267fd10757e2de37f002b50f5ec` 的初次结论为 `CHANGES_REQUIRED`：Critical 0、High 0、Medium 2、Low 0。本节只记录整改实现，不将 Batch 3 写为 `PASS`。

### Medium 1：verified rawDetailText scope

- 原问题：verified wrapper 沿用 generic `readRootText(document)`，可能把整个页面文本写入 `rawDetailText`。
- 根因：generic parser 没有可选的 raw detail DOM scope，verified wrapper 也没有提供 scope。
- 整改：`ParseJobDetailOptions` 增加显式 `rawDetailSelector`；verified wrapper 强制使用 `.job-sec-text`，调用方不能覆盖该安全 scope。
- verified `rawDetailText` 与 `fullJdText` 均通过 `domElementToStructuredText` 从当前 `.job-sec-text` 提取，排除导航、竞争力分析、安全提示、推荐岗位以及 `SCRIPT`、`STYLE`、`NOSCRIPT`、`TEMPLATE`。
- generic/synthetic parser 未提供 `rawDetailSelector` 时仍执行原有 root text 行为，现有兼容测试保持通过。

### Medium 2：verified card canonical URL

- 原问题：verified wrapper 沿用 generic raw-link contract，`jobHrefRaw` 和 `jobUrl` 可能保存 security/tracking query 与 hash。
- 整改：只在 `parseVerifiedBossJobCards` 内部路径启用严格 URL policy；generic `parseJobCards` 保持原行为。
- policy：只接受 HTTP/HTTPS、合法 BOSS hostname、无 URL userinfo、单层 `/job_detail/*.html` pathname；删除 query/hash。
- 合法 verified link 的 `jobHrefRaw` 和 `jobUrl` 都返回 absolute canonical URL；非法协议、外部 hostname、userinfo 或非法 pathname 返回 `null`，不保留原始 href。
- synthetic fixture 使用虚构 `securityId=TEST_SECRET`、tracking 和 hash 验证序列化结果不包含这些值；没有使用任何真人 URL 或参数。

### Repair 测试与边界

- 两个 Medium 均先增加 regression test 并观察到预期失败，再实施最小修复。
- 新增 5 项测试；全仓最终测试数量和完整验证结果见下方 repair validation。
- salary character mapping 未修改，原有 pure、in-memory、无 DOM/storage/network/font、冲突阻止解码和 incomplete 不输出部分工资的行为保持不变。
- Manifest 未修改；没有新增权限、自动采集、自动页面解析、自动点击、自动滚动、自动翻页或自动“查看更多信息”。
- Codex 未访问或操作真实 BOSS 页面。

### Repair validation

整改完成后执行完整验证并记录最终事实：

| 命令 | 结果 |
| --- | --- |
| `npm install` | 成功；依赖已是最新，审计 247 packages，0 vulnerabilities；同时执行 prepare 成功 |
| `npm run prepare` | 成功；WXT 0.21.4 types 生成完成 |
| `npm run typecheck` | 成功；exit 0 |
| `npm run lint` | 成功；exit 0 |
| `npm test` | 成功；12 files、156 tests 全部通过 |
| `npm run build` | 成功；Chrome MV3 构建完成 |
| `npm run build:edge` | 成功；Edge MV3 构建完成 |
| `npm run verify:manifests` | 成功；Chrome / Edge 均为 MV3、popup、version 0.1.0、仅 `activeTab` + `scripting` |
| `git diff --check` | 成功；exit 0，仅有 Windows 工作区 LF/CRLF 转换提示 |

整改状态：`repair implemented, awaiting external re-review`。项目状态仍为 `implementation_complete_awaiting_external_review`，不得进入下一批。
