# 项目状态

## 当前状态快照

- 仓库：`MuHai12345/boss-job-radar`
- 分支：`master`
- Phase 0–5：`PASS`
- Phase 6：`IN PROGRESS`
- 最近完成批次：`Phase 6 / Batch 4 — PASS`
- 当前能力：Capability 12 — structured LLM analysis：`IN_PROGRESS`
- 下一步：`Phase 6 / Batch 5 — representative real OpenAI evaluation v1`（验证批，等待用户明确同意）
- Batch 4 Codex 产品实现 commit：`9959cbf9a372509207ce3c78e29a800be6d39f03`
- Batch 4 最终外部测试 head：`e276ed7c1265719117210482106ea24dd45352d4`
- Batch 4 最终 CI run：`34185674592`
- 核心能力矩阵：`12 / 15 VERIFIED`，Capability 12 `IN_PROGRESS`
- 当前产品实现阻塞：无
- 当前验证门槛：用户明确同意真实 OpenAI 远程调用/API 费用 + 代表性真实 provider 评测

## 已验证核心能力

1. 真实 BOSS 当前页面 structured extraction
2. 原始事实 / 完整 JD / canonical link / unknown 保真
3. 本地 SQLite persistence / migration / recovery
4. 安全 localhost observation ingestion
5. 手动 extension → localhost save
6. Job identity / canonical URL dedupe / first_seen / last_seen
7. SearchRun / provenance / idempotent import
8. 确定性岗位真实性质识别
9. 经验硬门槛 / 偏好 / 矛盾识别
10. 招聘者活跃 / 平台新鲜度 / local observation recency / link 状态判断
11. 成长性 / 转行价值 / 风险 / 当前机会优先级 / 面试追问
15. SearchRun 范围薪资 PUA 可信解码与正式产品链路

尚未整体验证：Capability 12–14。

Capability 12 的产品实现链路已经连续完成并外部验收：provider-neutral foundation、OpenAI Responses transport、本地 opt-in config、protected localhost explicit trigger、popup explicit user trigger。整体仍为 `IN_PROGRESS`，因为代表性真实 OpenAI provider end-to-end 评测与用户人工抽查尚未完成。

## Phase 6 / Batch 1 验收

Batch 1 建立并验证：

- `StructuredLlmProvider` 抽象；
- 最小化 LLM input snapshot；
- 完整 JD 与 authoritative upstream structured facts 输入边界；
- prompt injection / delimiter 防线；
- 固定 prompt/output schema version；
- exact-shape structured output validator；
- full-JD substring / upstream evidence grounding；
- schema v8 `structured_llm_analyses`；
- provider/model/source-state append-only history；
- same-state idempotency；
- provider call outside SQLite transaction；
- source-change race rejection；
- provider failure / invalid output / stored corruption fail closed；
- missing complete JD 时不调用 provider。

正式记录：`docs/verification/2026-09-07-phase-6-batch-1-external-verification.md`

## Phase 6 / Batch 2 验收

Codex 产品实现：`34aaa1b1d23fb5f7b729f006436ed4816f381dd3`

最终外部测试 head：`9e37abd303d34823f87e41ef1044df113ce2f0d6`

最终 CI run：`34134533838`

Batch 2 验证：

- OpenAI Responses concrete provider；
- explicit approved model allowlist；
- API key constructor-only secret boundary；
- fixed `https://api.openai.com/v1/responses`；
- Node native fetch；
- system / user prompt separation；
- `store:false` / `background:false` / `stream:false`；
- reasoning low / `max_output_tokens=4000`；
- Structured Outputs `json_schema` + strict；
- completed-only single assistant `output_text` parsing；
- refusal/incomplete/failed/queued/malformed/non-2xx fail closed；
- 45 秒 timeout + AbortController；
- zero retry / zero fallback。

最终：**49 test files / 697 tests passed**，typecheck/lint/build/manifests 全部 PASS。

正式记录：`docs/verification/2026-09-07-phase-6-batch-2-external-verification.md`

## Phase 6 / Batch 3 验收

Codex 产品实现：

`95ecbed47598378cb402a89757bf17d9e8327c64`

外部 ChatGPT 审阅真实 diff 后没有发现需要 Codex repair 的产品缺陷。

Batch 3 新增并验证：

- 产品专用 `BOSS_JOB_RADAR_OPENAI_API_KEY` / `BOSS_JOB_RADAR_OPENAI_MODEL`；
- 两者都缺失时 disabled-by-default；
- partial / blank / control-character / invalid-model config fail closed；
- OpenAI key startup-error sanitization；
- runtime optional `StructuredLlmProvider`；
- provider construction/startup/database open 不产生远程调用；
- exact canonical `{jobUrl}` structured LLM request contract；
- protected `POST /structured-llm-analyses`；
- loopback Host / extension Origin / bridge token / JSON content type / supported content encoding / 1 MiB body limit；
- server narrow writer，不持有 database/OpenAI secret；
- job URL → local Job → existing structured LLM repository；
- provider not configured / job not found / missing JD / success / generic failure fixed HTTP contract；
- success 只返回 persisted analysis id；
- provider/invalid output/source race/persistence error 不向客户端泄露内部细节；
- startup/import/link/status/opportunity/health/session 均保持 0 provider calls；
- same provider/model/source-state 的重复显式触发继续复用已有结果。

最终外部测试 head：

`ee82ee52c24763470cfdf6f2de9504e139989405`

最终 CI run：

`34137913888`

最终工程验证：

- `npm run typecheck`：PASS
- `npm run lint`：PASS
- `npm test`：PASS — **50 test files / 714 tests passed**
- Batch 3 专项：**17 / 17 passed**
- Chrome / Edge / local build：PASS
- manifest verification：PASS

本批没有真实 OpenAI 请求，不读取用户真实 API key，不产生真实模型费用，也没有 popup/browser analyze action。

正式记录：`docs/verification/2026-09-07-phase-6-batch-3-external-verification.md`

## Phase 6 / Batch 4 验收

批准设计：

`docs/decisions/ADR-0018-popup-explicit-structured-llm-trigger-v1.md`

Codex 产品实现：

`9959cbf9a372509207ce3c78e29a800be6d39f03`

产品 diff 只涉及：

- `src/bridge/local-service-client.ts`
- `entrypoints/popup/structured-llm-analysis-controller.ts`
- `entrypoints/popup/index.html`
- `entrypoints/popup/main.ts`
- `entrypoints/popup/style.css`

外部代码审阅没有发现需要 Codex repair 的产品缺陷。

Batch 4 新增并验证：

- 独立 structured LLM browser localhost client；
- network 前 exact canonical request validation；
- 每次独立分析动作 fresh protocol-2 bridge session；
- 固定 `/structured-llm-analyses` endpoint；
- browser POST body 只有 `jobUrl`；
- browser 不读取/持有 API key、model、完整 JD；
- analysis POST 独立 50 秒 bounded timeout，覆盖 response body consumption；
- analysis POST **0 automatic retries**；
- strict HTTP 200 exact positive safe-integer `{id}`；
- 400/403/404/413/422/502/503 固定本地 failure mapping；
- non-200 body 不反射到 UI；
- popup `AI 岗位分析` 显式用户动作；
- 完整 JD + 最小化上下文远程发送与 OpenAI API 费用透明披露；
- popup initialization 0 analysis calls；
- canonical detail URL visibility；
- click-time active-tab revalidation；
- in-flight duplicate click guard；
- finally fresh-tab restore / lookup failure fail closed；
- success 只显示结果已保存，不显示 analysis JSON/id；
- 没有新增 browser permission、API key UI、model selector、Dashboard 或 Capability 13。

Codex 产品 commit 自己的原始 CI run `34183316291` 已经 `success`。

外部网页版 ChatGPT 随后新增：

- `tests/structured-llm-browser-client.test.ts` — 29 tests
- `tests/structured-llm-analysis-controller.test.ts` — 19 tests

Batch 4 专项：**48 / 48 passed**。

最终外部测试 head：

`e276ed7c1265719117210482106ea24dd45352d4`

最终 CI run：

`34185674592`

最终工程验证：

- `npm ci`：PASS
- `npm run typecheck`：PASS
- `npm run lint`：PASS
- `npm test`：PASS — **52 test files / 762 tests passed**
- `npm run build`：PASS
- `npm run build:edge`：PASS
- `npm run build:local`：PASS
- `npm run verify:manifests`：PASS

Batch 4 没有读取用户真实 API key、没有访问 OpenAI、没有产生真实 API 费用。真实浏览器中的实际 provider 点击路径与代表性真实模型评测合并到 Batch 5 一次完成，避免重复要求用户做本机人工操作。

正式记录：`docs/verification/2026-09-08-phase-6-batch-4-external-verification.md`

## Phase 6 / Batch 5 验证门槛

批准计划：

`docs/decisions/ADR-0019-representative-real-openai-evaluation-v1.md`

Batch 5 是**验证批，不是预设 Codex 产品编码批**。

进入前必须由用户明确同意：

- 将选定岗位完整 JD + 已批准最小上下文通过本地服务发送给 OpenAI；
- 可能产生 OpenAI API 费用；
- API key 只配置在用户本机 local-service process，不粘贴给 ChatGPT/Codex/GitHub；
- 每次 provider request 仍由用户主动点击，zero automatic retry。

代表性评测至少覆盖真实 end-to-end 成功路径，并逐步覆盖适合转行、经验硬门槛、职责模糊/疑似伪运营等自然样本。外部 ChatGPT负责把实际问题区分为产品缺陷、模型能力限制、样本信息不足或可接受表现。

如果真实评测发现产品缺陷，再生成一个窄 repair Prompt 给 Codex；如果没有产品缺陷且评测通过，才考虑 `Capability 12 → VERIFIED`、`Phase 6 → PASS`，然后进入 Phase 7 / Capability 13。

## 协作与测试规则

长期分工以 `AGENTS.md` 为准：

- Codex：只负责外部 Prompt 指定的产品源码、必要 migration、commit、push。
- Codex 不新增或修改测试，不运行测试/typecheck/lint/build/manifest verification，不做 QA 或验收。
- 外部网页版 ChatGPT：负责全部测试代码、CI、代码审阅、验证、验收和状态文档。
- 用户不是 CMD 测试执行器；仅在无法远程复现的真实登录 BOSS 浏览器或真实 provider 场景下执行最少量人工验证。

## 长期产品边界

当前数据来源仍以用户本人正常使用 BOSS直聘 时可见的页面数据为基础。系统不保存密码、验证码、Cookie 或 Session，不调用/逆向 BOSS 私有 API，不后台无人值守采集，不自动翻页，不自动投递，不自动聊天。

所有岗位继续保留供用户人工查看；低优先级、疑似伪运营、经验不匹配、招聘状态差、模型低置信度或信息不足，只能被标记、解释或排序，不能被静默删除。
