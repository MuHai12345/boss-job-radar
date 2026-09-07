# 项目状态

## 当前状态快照

- 仓库：`MuHai12345/boss-job-radar`
- 分支：`master`
- Phase 0–5：`PASS`
- Phase 6：`IN PROGRESS`
- 最近完成批次：`Phase 6 / Batch 2 — PASS`
- 当前能力：Capability 12 — structured LLM analysis：`IN_PROGRESS`
- 下一批：`Phase 6 / Batch 3 — explicit localhost LLM trigger + local OpenAI config v1`
- Batch 2 Codex 产品实现 commit：`34aaa1b1d23fb5f7b729f006436ed4816f381dd3`
- Batch 2 最终外部测试 head：`9e37abd303d34823f87e41ef1044df113ce2f0d6`
- Batch 2 最终 CI run：`34134533838`
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

Capability 12 已完成 provider-neutral foundation 与 OpenAI Responses provider transport，但整体仍为 `IN_PROGRESS`。

## Phase 6 / Batch 1 验收

Batch 1 建立并验证了：

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

Codex 产品实现：

`34aaa1b1d23fb5f7b729f006436ed4816f381dd3`

外部测试 head：

`9e37abd303d34823f87e41ef1044df113ce2f0d6`

GitHub Actions run：

`34134533838`

Batch 2 新增并验证：

- OpenAI Responses API concrete provider；
- `providerId = openai`；
- `gpt-5.6-luna` / `gpt-5.6-terra` / `gpt-5.6-sol` explicit allowlist；
- API key 只作为 constructor secret 并只进入 Authorization header；
- 固定 `https://api.openai.com/v1/responses`；
- Node native fetch；
- system / user prompt 分离；
- `store:false` / `background:false` / `stream:false`；
- reasoning low / `max_output_tokens = 4000`；
- no tools / no conversation / no previous response / no user metadata；
- Structured Outputs `json_schema` + `strict:true`；
- completed-only single assistant `output_text` parsing；
- reasoning item 隔离；
- refusal / incomplete / failed / queued / malformed / non-2xx fail closed；
- fixed generic provider errors；
- 45 秒 timeout + AbortController；
- zero retry / zero fallback。

最终工程验证：

- `npm ci`：PASS
- `npm run typecheck`：PASS
- `npm run lint`：PASS
- `npm test`：PASS — **49 test files / 697 tests passed**
- `npm run build`：PASS
- `npm run build:edge`：PASS
- `npm run build:local`：PASS
- `npm run verify:manifests`：PASS

第一次专项测试 CI 的唯一失败来自外部 timeout 测试 harness 晚挂接 rejection assertion；产品测试断言本身 697/697 通过。外部 ChatGPT 修复测试 harness 后未修改产品源码，最终 CI 全绿。

本批没有真实 API key 环境加载、localhost LLM trigger、popup/UI 或真实远程请求，因此没有产生真实模型费用，也无需新的 BOSS 浏览器人工验收。

正式记录：`docs/verification/2026-09-07-phase-6-batch-2-external-verification.md`

## Phase 6 / Batch 3 方向

下一批批准设计：

`docs/decisions/ADR-0017-explicit-llm-trigger-and-local-config-v1.md`

目标是把已经验证的 OpenAI transport 接到**默认关闭、显式 opt-in、受保护的本地触发边界**：

- 只读取产品专用 `BOSS_JOB_RADAR_OPENAI_API_KEY` + `BOSS_JOB_RADAR_OPENAI_MODEL`；
- 两者都缺失时 feature disabled，本地服务照常启动；
- partial/invalid config fail closed 且不泄露 secret；
- runtime 接受可选 provider，不自行读取 env；
- 新增受现有 bridge security 保护的 `POST /structured-llm-analyses`；
- 请求只接受 exact canonical BOSS job URL；
- local runtime 用 URL 查内部 Job，再调用现有 structured LLM repository；
- HTTP 只返回最小 id / 固定错误，不返回 prompt、JD、key 或 OpenAI body；
- startup/import/link/status/opportunity 等路径继续保持 0 provider calls。

Batch 3 仍不做 popup analyze button、真实 OpenAI 请求、真实模型评测或 Capability 13 UI。因此 Batch 3 即使 PASS，Capability 12 仍保持 `IN_PROGRESS`。

## 协作与测试规则

长期分工以 `AGENTS.md` 为准：

- Codex：只负责外部 Prompt 指定的产品源码、必要 migration、commit、push。
- Codex 不新增或修改测试，不运行测试/typecheck/lint/build/manifest verification，不做 QA 或验收。
- 外部网页版 ChatGPT：负责全部测试代码、CI、代码审阅、验证、验收和状态文档。
- 用户不是 CMD 测试执行器；仅在无法远程复现的真实登录 BOSS 浏览器或真实 provider 场景下执行最少量人工验证。

## 长期产品边界

当前数据来源仍以用户本人正常使用 BOSS直聘 时可见的页面数据为基础。系统不保存密码、验证码、Cookie 或 Session，不调用/逆向 BOSS 私有 API，不后台无人值守采集，不自动翻页，不自动投递，不自动聊天。

所有岗位继续保留供用户人工查看；低优先级、疑似伪运营、经验不匹配、招聘状态差、模型低置信度或信息不足，只能被标记、解释或排序，不能被静默删除。
