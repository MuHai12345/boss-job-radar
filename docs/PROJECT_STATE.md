# 项目状态

## 当前状态快照

- 仓库：`MuHai12345/boss-job-radar`
- 分支：`master`
- Phase 0–5：`PASS`
- Phase 6：`IN PROGRESS`
- 最近完成批次：`Phase 6 / Batch 3 — PASS`
- 当前能力：Capability 12 — structured LLM analysis：`IN_PROGRESS`
- 下一批：`Phase 6 / Batch 4 — popup explicit structured LLM analysis trigger v1`
- Batch 3 Codex 产品实现 commit：`95ecbed47598378cb402a89757bf17d9e8327c64`
- Batch 3 最终外部测试 head：`ee82ee52c24763470cfdf6f2de9504e139989405`
- Batch 3 最终 CI run：`34137913888`
- 核心能力矩阵：`12 / 15 VERIFIED`，Capability 12 `IN_PROGRESS`
- 当前实现阻塞：无

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

Capability 12 已连续完成并外部验收 provider-neutral foundation、OpenAI Responses transport、本地 opt-in config 与 protected localhost explicit trigger；整体仍为 `IN_PROGRESS`，因为浏览器显式用户动作和代表性真实 OpenAI 模型评测尚未完成。

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
- Structured Outputs `json_schema` + `strict:true`；
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

Codex 产品提交后的原始 CI 只暴露一个旧测试类型基线没有跟上新增 optional server writer；外部 ChatGPT 修正了测试基线。

外部 ChatGPT 随后新增 17 个 Batch 3 专项测试。专项测试第一轮唯一失败是外部测试自己使用了不符合既有 UUIDv4 contract 的 `clientImportId`；修正测试输入后未修改任何产品源码。

最终外部测试 head：

`ee82ee52c24763470cfdf6f2de9504e139989405`

最终 CI run：

`34137913888`

最终工程验证：

- `npm ci`：PASS
- `npm run typecheck`：PASS
- `npm run lint`：PASS
- `npm test`：PASS — **50 test files / 714 tests passed**
- Batch 3 专项：**17 / 17 passed**
- `npm run build`：PASS
- `npm run build:edge`：PASS
- `npm run build:local`：PASS
- `npm run verify:manifests`：PASS

本批没有真实 OpenAI 请求，不读取用户真实 API key，不产生真实模型费用，也没有 popup/browser analyze action。

正式记录：`docs/verification/2026-09-07-phase-6-batch-3-external-verification.md`

## Phase 6 / Batch 4 方向

批准设计：

`docs/decisions/ADR-0018-popup-explicit-structured-llm-trigger-v1.md`

下一批只把已经验证的 localhost analysis endpoint 接到**popup 中一个透明、明确、用户主动点击的动作**：

- 新 browser local-service client；
- 每次点击 fresh protocol-2 bridge session；
- 分析 POST 使用独立的约 50 秒有界 timeout；
- **0 automatic retries**，避免未知网络结果导致潜在重复付费调用；
- browser request body 仍只有 canonical `jobUrl`；
- extension 不读取/持有 API key、model、完整 JD；
- popup 初始化只根据 active-tab URL 分类，不发网络请求、不执行 DOM injection；
- 点击时重新读取并验证当前 active tab；
- 同一 popup in-flight 时禁止重复 click；
- finally 再读取当前 tab，避免 stale URL fail-open；
- UI 必须明确披露：点击后会把已保存岗位的完整 JD + 批准最小上下文发送到用户配置的 OpenAI 模型，可能产生 API 费用；
- success 仅提示结果已保存，本批不显示完整 LLM output、不新增 Dashboard。

Batch 4 仍不使用真实 key，不执行真实 OpenAI 请求。Batch 4 PASS 后 Capability 12 仍保持 `IN_PROGRESS`；之后需要用户明确同意后的代表性真实模型评测，才能考虑整体验收。

## 协作与测试规则

长期分工以 `AGENTS.md` 为准：

- Codex：只负责外部 Prompt 指定的产品源码、必要 migration、commit、push。
- Codex 不新增或修改测试，不运行测试/typecheck/lint/build/manifest verification，不做 QA 或验收。
- 外部网页版 ChatGPT：负责全部测试代码、CI、代码审阅、验证、验收和状态文档。
- 用户不是 CMD 测试执行器；仅在无法远程复现的真实登录 BOSS 浏览器或真实 provider 场景下执行最少量人工验证。

## 长期产品边界

当前数据来源仍以用户本人正常使用 BOSS直聘 时可见的页面数据为基础。系统不保存密码、验证码、Cookie 或 Session，不调用/逆向 BOSS 私有 API，不后台无人值守采集，不自动翻页，不自动投递，不自动聊天。

所有岗位继续保留供用户人工查看；低优先级、疑似伪运营、经验不匹配、招聘状态差、模型低置信度或信息不足，只能被标记、解释或排序，不能被静默删除。
