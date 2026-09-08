# Phase 6 / Batch 4 外部验收记录

- 日期：2026-09-08
- 能力：Capability 12 — structured LLM analysis（popup explicit user trigger v1）
- Codex 产品实现 commit：`9959cbf9a372509207ce3c78e29a800be6d39f03`
- 外部 browser client 专项测试 commit：`5449e4d940f77a86328e09579bff87805ae28c2b`
- 外部 popup controller 专项测试 / 最终测试 head：`e276ed7c1265719117210482106ea24dd45352d4`
- Codex 产品提交原始 CI run：`34183316291`
- 最终 GitHub Actions run：`34185674592`
- 结论：`PASS`
- Capability 12 整体状态：`IN_PROGRESS`

## 代码审阅结论

外部网页版 ChatGPT 审阅了 Codex 的真实产品 commit `9959cbf9a372509207ce3c78e29a800be6d39f03`，base 为 `4aa53a8c95e4fc9da5f971bbad402966f79dad99`。

真实 diff 只有 1 个 commit、5 个批准范围内的产品文件：

- `src/bridge/local-service-client.ts`
- `entrypoints/popup/structured-llm-analysis-controller.ts`
- `entrypoints/popup/index.html`
- `entrypoints/popup/main.ts`
- `entrypoints/popup/style.css`

没有修改 local-service server/runtime/main、OpenAI provider、SQLite、migration、tests、docs、CI、依赖或 Capability 13。

静态审阅确认：

- browser client 在任何网络请求前使用既有 exact `StructuredLlmAnalysisRequest` validator；
- 每一次独立用户动作重新获取 protocol-2 bridge session，不缓存 token；
- analysis POST 固定发往 `http://127.0.0.1:32123/structured-llm-analyses`；
- browser POST body 只有 canonical `jobUrl`；
- extension 不读取、不持有也不发送 OpenAI API key、model 或完整 JD；
- analysis POST 使用独立 `50_000 ms` deadline，覆盖 response body consumption；
- analysis POST 没有 automatic retry；
- HTTP 200 只有 exact positive safe-integer `{id}` 才成功；
- 400/403/404/413/422/502/503 使用固定本地 failure mapping；
- non-200 server body 不用于用户消息；
- popup 初始化只读取 active-tab metadata，不发 analysis request；
- action 只对 exact canonical BOSS HTTPS detail URL 显示；
- click 时重新读取 active tab，不复用初始化 URL；
- in-flight 时 button disabled 且重复 click 不产生第二个 request；
- finally 再读取 fresh active tab，查询失败时 fail closed；
- UI 明确披露：点击后本地服务会从已保存岗位读取完整 JD + 批准最小上下文并发送到用户配置的 OpenAI 模型，可能产生 API 费用；
- disclosure 同时澄清 browser→localhost 会用 `jobUrl` 指定岗位，但 `companyName`、`jobUrl`、整页 `rawText`、Cookie、Session 不主动进入 OpenAI provider input；
- success 只显示“AI 分析已完成并保存到本地”，没有扩散 analysis JSON 或数据库 id。

没有发现需要 Codex repair 的 Batch 4 产品源码缺陷。

## Codex 产品提交原始 CI

产品 commit `9959cbf9a372509207ce3c78e29a800be6d39f03` 自己触发的 GitHub Actions run：

`34183316291`

结论：`success`。

因此在外部新增 Batch 4 专项测试前，既有 typecheck/lint/tests/build/manifests 已经没有回归。

## 外部 browser client 专项测试

外部网页版 ChatGPT 新增：

`tests/structured-llm-browser-client.test.ts`

共 29 个测试，覆盖：

- invalid/noncanonical/expanded request 在任何 network 前 fail closed；
- fresh session per action；
- protocol 2 + 64 lowercase hex token strict validation；
- session application/json requirement；
- fixed localhost analysis endpoint；
- POST `redirect:error` / `credentials:omit`；
- exact jobUrl-only request body；
- browser source 不读取产品 OpenAI key/model env；
- 200 exact positive safe-integer id validation；
- invalid id / extra key / wrong content type / malformed JSON fail closed；
- 400/403/404/413/422/502/503 mapping；
- unexpected 429/500 → `invalid_response`；
- non-200 body 不反射到结果；
- 50 秒 analysis deadline；
- rejected POST 0 retry；
- HTTP 200 response body stream failure 0 retry；
- hanging success body 被 50 秒 deadline 覆盖，仍只有一个 POST。

该测试 commit `5449e4d940f77a86328e09579bff87805ae28c2b` 的 CI run `34185626753` 全绿。

## 外部 popup controller 专项测试

外部网页版 ChatGPT 新增：

`tests/structured-llm-analysis-controller.test.ts`

共 19 个测试，覆盖：

- 明确 remote-data / API-cost disclosure；
- popup main wiring 只把 active-tab metadata 与窄 analysis client 交给新 controller；
- initialization 对 canonical detail page 只分类、不分析；
- query/hash/http/mobile-host/non-detail/relative/undefined URL fail closed；
- initial active-tab lookup throw fail closed；
- click 重新读取 active tab；
- success 只调用 analyze 一次并传 exact `{jobUrl}`；
- click 时 tab 变成 noncanonical/undefined 时 0 analysis calls；
- in-flight duplicate click prevention；
- client fixed failure message passthrough；
- thrown dependency 使用固定非敏感 fallback；
- request 完成后使用 fresh final tab 决定 action 状态；
- final tab query throw 时 action hidden + button disabled。

Batch 4 外部专项合计：**48 / 48 passed**。

## 最终工程验证

最终测试 head：

`e276ed7c1265719117210482106ea24dd45352d4`

GitHub Actions run：

`34185674592`

结果：

- `npm ci`：PASS
- `npm run typecheck`：PASS
- `npm run lint`：PASS
- `npm test`：PASS — **52 test files / 762 tests passed**
- Batch 4 browser client 专项：**29 / 29 passed**
- Batch 4 popup controller 专项：**19 / 19 passed**
- `npm run build`：PASS — Chrome MV3
- `npm run build:edge`：PASS — Edge MV3
- `npm run build:local`：PASS
- `npm run verify:manifests`：PASS

Chrome/Edge manifest verification 继续确认 MV3、popup、`activeTab + scripting` 与固定 loopback host permission，没有增加浏览器权限。

## 真实 OpenAI / 浏览器人工路径

Batch 4 验收没有读取用户真实 API key，没有访问 `api.openai.com`，没有产生真实模型费用。

本批自动化已经验证 popup DOM/controller、browser localhost client、构建产物和既有回归。真实浏览器中的实际 OpenAI end-to-end 点击路径留到下一阶段与代表性真实 provider 评测一起执行，避免为同一显式分析动作重复要求用户进行本机人工操作。

下一阶段必须先获得用户对以下事项的明确同意：

- 选定代表性岗位；
- 将该岗位完整 JD + 已批准最小上下文通过本地服务发送给 OpenAI；
- 可能产生 OpenAI API 费用；
- API key 只配置在用户本机 local-service process，不发送给 ChatGPT、Codex 或 GitHub。

## 最终结论

`Phase 6 / Batch 4 — PASS`

显式 popup 用户动作、fresh session、jobUrl-only browser payload、50 秒 bounded analysis POST、zero retry、cost/privacy disclosure、click-time tab revalidation、in-flight guard 与 fresh-final-tab fail-closed restore 已通过真实代码审阅、48 个专项测试及完整 CI 回归。

`Capability 12 — IN_PROGRESS`

剩余门槛不再是 Batch 4 产品实现缺陷，而是**代表性真实 OpenAI provider end-to-end 评测 + 用户人工抽查**。在该门槛完成前，不把 Capability 12 或 Phase 6 提前标记为 `VERIFIED/PASS`。
