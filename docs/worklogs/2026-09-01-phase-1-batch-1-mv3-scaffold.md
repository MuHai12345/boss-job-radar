# Phase 1 / Batch 1 最小 MV3 扩展工程工作日志

## 本轮范围

基于已经外部审阅通过的 Phase 0 commit，建立可构建、可测试、可供后续人工加载的 Chrome / Edge Manifest V3 扩展工程。本轮功能仅为识别当前激活标签 URL 是否属于 BOSS直聘并显示扩展版本，不读取页面 DOM 或岗位信息。

## 环境与基准

- 工作目录：`<repo-root>`
- 基准 commit：`befad064fa4a4e7363b1ba3575b45c2d1f609361`
- 分支：`master`
- Node.js：`v24.11.1`
- npm：`11.6.2`
- 启动工作区：干净，与 `origin/master` 同步

## 主要依赖

- WXT `0.21.4`
- Vite `8.2.2`
- TypeScript `5.9.3`
- Vitest `4.1.11`
- ESLint `10.9.1`
- typescript-eslint `8.69.0`

未直接或间接安装 `web-ext`，未加入任何 UI 框架或自动浏览器测试工具。

## 实现事实

- 创建 npm/WXT/TypeScript/Vitest/ESLint flat config 工程与 `package-lock.json`。
- 创建 Vanilla HTML、CSS、TypeScript popup。
- popup 查询用户当前激活标签 URL，通过独立纯函数判断 hostname。
- popup 版本来自 `browser.runtime.getManifest().version`，功能状态固定显示“当前尚未开始采集”。
- 创建 URL 判断单元测试，覆盖根域、子域、非 BOSS 域、仿冒域、恶意后缀、空值、非法 URL 和不支持协议。
- 为未来 BOSS adapter 与脱敏 fixture 目录添加范围说明，没有实现解析函数或加入 HTML fixture。
- 创建本地产物 Manifest 断言脚本。
- 写入 Phase 0 外部审阅记录，并更新本轮允许修改的架构、README 和项目状态文档。

## 命令与结果

- `npm install`：首次在 WXT `prepare` 阶段失败，因为当时没有 `entrypoints/`；添加最小 popup HTML 入口后重跑成功。最终审计 238 个包，0 vulnerabilities。
- `npm run prepare`：成功，WXT 生成类型。
- `npm run typecheck`：成功，退出码 0。
- `npm run lint`：成功，退出码 0。
- `npm test`：TDD 红灯先因生产模块尚不存在而失败；实现后成功，1 个测试文件、14 项测试全部通过。
- `npm run build`：成功生成 `.output/chrome-mv3`，产物总计约 4.05 kB。
- `npm run build:edge`：成功生成 `.output/edge-mv3`，产物总计约 4.05 kB。
- `npm run verify:manifests`：Chrome 与 Edge 均通过 MV3、popup、版本和仅 `activeTab` 权限断言。

## Manifest 结果

Chrome 与 Edge 生成的 Manifest 均满足：

- `manifest_version` 为 3；
- 版本为 `0.1.0`；
- 存在 popup；
- 权限只有 `activeTab`；
- 不存在 content script、background service worker、host permission、optional permission 或 `<all_urls>`。

## 未验证与边界

- 未自动启动 Chrome 或 Edge。
- 未由用户人工加载扩展，未进行真实浏览器最终验收。
- 未登录或访问 BOSS 页面。
- 未验证真实 BOSS DOM，也未读取 document、岗位卡片、JD 或招聘者信息。
- 未创建 fixture 解析、JSON 导出、后端、SQLite、LLM、Dashboard 或任何自动交互能力。

## Git 身份

启动检查发现全局 Git 身份为 `RealMH-01`，且当前 email 无法确认属于 `MuHai12345` 的 GitHub 已验证邮箱或 noreply 邮箱。本轮已将 repository-local `user.name` 设置为 `MuHai12345`，没有修改全局配置；repository-local `user.email` 仍缺失，在用户提供或配置可靠 email 前不得创建本轮 commit。

## 当前状态

代码实现与本地验证完成后，项目状态为 `implementation_complete_awaiting_external_review`。该状态不表示 Batch 1 已经外部验收通过，Codex 无权进入 Batch 2。
