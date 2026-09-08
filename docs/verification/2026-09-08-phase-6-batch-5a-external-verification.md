# Phase 6 / Batch 5A 外部验收记录 — Lave8 relay adaptation v1

- 日期：2026-09-08
- 对应能力：Capability 12 — structured LLM analysis
- 正式结论：**PASS**
- Lave8 真实兼容性：**PENDING Batch 5B**

## 产品实现

Codex 原始实现 commit：

`cf384babda624719952b5d49a47dbfc63f6e9371`

批准 relay：

- provider identity：`lave8`
- fixed endpoint：`https://lave8.com/v1/responses`
- approved model：`gpt-6-astra`
- auth：`Authorization: Bearer <key>`
- extra headers：none

原始实现只修改/新增：

- `src/domain/llm/lave8-structured-llm-provider.ts`
- `src/local-service/structured-llm-runtime-config.ts`
- `src/local-service/main.ts`
- `entrypoints/popup/index.html`

没有修改 database、local HTTP API、browser analysis client、popup controller、dependency 或 migration。

## 外部代码审阅

外部网页版 ChatGPT 对真实 diff 的审阅结论：

- Lave8 使用独立 `providerId = 'lave8'`，不与官方 OpenAI persistence identity 混用；
- endpoint 固定为 `https://lave8.com/v1/responses`，没有开放 arbitrary base URL；
- model allowlist 只有 `gpt-6-astra`；
- API key 只用于 Bearer Authorization，不进入 request body、provider identity、SQLite 或错误信息；
- request 首版严格复用已经验证的 OpenAI Responses contract：system/user separation、`store:false`、`background:false`、`stream:false`、reasoning low、`max_output_tokens=4000`、strict JSON Schema；
- response 首版继续使用 completed-only、single assistant message / single `output_text` fail-closed parser；
- 45 秒 bounded timeout、AbortController、zero retry、zero endpoint/model/request-shape fallback；
- popup disclosure 已改为 provider-neutral，明确远程 AI 服务/中转站与可能的 API 费用。

没有发现需要修改 Lave8 transport 本身的产品缺陷。

## 首轮 CI 与发现的问题

原始产品 commit CI：`34200714901`

Typecheck、lint PASS；test 阶段发现两类问题：

1. 旧 popup test 仍断言 OpenAI 专用文案。这是外部测试基线问题，由外部 ChatGPT 直接更新测试；
2. Batch 5A 为 OpenAI runtime config 返回对象新增 `provider: 'openai'`，改变了既有 observable contract。这是产品回归。

外部测试 commits：

- `1d55ff0626551bbbb1a5bf38763a27a6792a0a7d` — 更新 provider-neutral popup disclosure 测试；
- `7f00a12ca0279e8dc7ca51c77bd847508e983c5b` — 新增 Lave8 transport fake-fetch 测试；
- `ad8fcf4d27b63fbe5abe5c9e6bd340219d931db7` — 新增 Lave8 runtime-config / backward-compatibility 测试。

随后外部 ChatGPT 正式给出 `CHANGES_REQUIRED`，只要求修复 OpenAI runtime-config 返回结构，不修改 Lave8 transport。

## Codex 窄修复

修复 commit：

`6e858316ecfefb6e9c3552646cb3db7a437c93bd`

只修改：

- `src/local-service/structured-llm-runtime-config.ts`
- `src/local-service/main.ts`

修复后：

- 既有 OpenAI enabled config 恢复原 shape：`{ enabled: true, apiKey, modelId }`；
- Lave8 继续使用显式 `provider: 'lave8'` discriminant；
- disabled、partial config fail-closed、simultaneous provider fail-closed 均保留；
- Lave8 provider transport 与 popup 均未再次修改。

## 最终外部自动化验证

最终 CI run：

`34201735884`

结果：

- `npm ci`：PASS
- `npm run typecheck`：PASS
- `npm run lint`：PASS
- `npm test`：PASS — **54 test files / 781 tests passed**
- Lave8 transport focused tests：**14 / 14 passed**
- Lave8 runtime-config focused tests：**5 / 5 passed**
- `npm run build`：PASS
- `npm run build:edge`：PASS
- `npm run build:local`：PASS
- `npm run verify:manifests`：PASS

最终 manifests 继续保持 MV3、popup、`activeTab + scripting` 与固定 loopback host permission。

## Batch 5A 结论

**PASS**。

已验证的是“Lave8 adapter 产品实现与本地配置边界”，不是 Lave8 真实远程兼容性。

当前仍未执行任何真实 `https://lave8.com/v1/responses` 请求，因此以下内容必须留到 Batch 5B：

- `gpt-6-astra` 是否实际接受当前 Responses request contract；
- relay 是否实际支持当前 strict `json_schema`；
- `background:false` / `reasoning` / `store:false` 等参数是否兼容；
- relay 的真实非流式 response shape 是否满足现有 strict parser；
- browser → localhost → Lave8 → validator → SQLite 的真实 end-to-end 路径；
- 至少一个真实 structured result 的 grounding 与业务可用性人工评测。

因此：

- Capability 12：仍为 `IN_PROGRESS`
- Phase 6：仍为 `IN_PROGRESS`
- 下一步：`Phase 6 / Batch 5B — representative real Lave8 evaluation v1`
