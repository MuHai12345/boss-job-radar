# 项目状态

## 当前状态快照

- 仓库：`MuHai12345/boss-job-radar`
- 分支：`master`
- Phase 0–5：`PASS`
- Phase 6：`IN PROGRESS`
- 最近完成批次：`Phase 6 / Batch 5A — PASS`（Lave8 relay adapter）
- 当前能力：Capability 12 — structured LLM analysis：`IN_PROGRESS`
- 下一步：`Phase 6 / Batch 5B — representative real Lave8 evaluation v1`（验证批）
- Lave8 provider：`lave8`
- Lave8 endpoint：`https://lave8.com/v1/responses`
- Lave8 approved model：`gpt-6-astra`
- Batch 5A Codex 产品实现：`cf384babda624719952b5d49a47dbfc63f6e9371`
- Batch 5A 窄修复：`6e858316ecfefb6e9c3552646cb3db7a437c93bd`
- Batch 5A 最终 CI run：`34201735884`
- Batch 5A 最终自动化：**54 test files / 781 tests passed**
- 核心能力矩阵：`12 / 15 VERIFIED`，Capability 12 `IN_PROGRESS`
- 当前产品实现阻塞：无
- 当前验证门槛：至少 1 个真实 Lave8 browser → localhost → relay → strict validation → SQLite sample + 外部人工 grounding/业务可用性验收

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

Capability 12 的产品实现链路已经连续完成并外部验收：provider-neutral foundation、OpenAI Responses transport、本地 opt-in config、protected localhost explicit trigger、popup explicit user trigger，以及独立 Lave8 relay adapter。整体仍为 `IN_PROGRESS`，因为真实 Lave8 Responses/Structured Outputs 兼容性与 representative model output 尚未完成 end-to-end 验证。

## Phase 6 / Batch 1 — PASS

建立并验证：

- `StructuredLlmProvider` 抽象；
- 最小化 input snapshot；
- 完整 JD + authoritative upstream structured facts 输入边界；
- prompt injection / delimiter 防线；
- strict structured output validator；
- full-JD substring / upstream evidence grounding；
- schema v8 `structured_llm_analyses`；
- provider/model/source-state append-only history；
- same-state idempotency；
- provider call outside SQLite transaction；
- source-change race rejection；
- missing complete JD 时 0 provider calls。

正式记录：`docs/verification/2026-09-07-phase-6-batch-1-external-verification.md`

## Phase 6 / Batch 2 — PASS

Codex 产品实现：`34aaa1b1d23fb5f7b729f006436ed4816f381dd3`

验证：

- OpenAI Responses concrete provider；
- explicit approved model allowlist；
- API key constructor-only secret boundary；
- fixed official Responses endpoint；
- system/user prompt separation；
- strict Structured Outputs JSON Schema；
- completed-only output parser；
- refusal/incomplete/failed/malformed/non-2xx fail closed；
- 45 秒 timeout；
- zero retry / zero fallback。

最终：**49 test files / 697 tests passed**，typecheck/lint/build/manifests 全部 PASS。

正式记录：`docs/verification/2026-09-07-phase-6-batch-2-external-verification.md`

## Phase 6 / Batch 3 — PASS

Codex 产品实现：`95ecbed47598378cb402a89757bf17d9e8327c64`

验证：

- product-specific local key/model config；
- disabled-by-default / partial-invalid fail closed；
- startup secret sanitization；
- runtime optional provider；
- protected `POST /structured-llm-analyses`；
- exact canonical `jobUrl` request；
- loopback Host / extension Origin / bridge token / media type / encoding / body limit；
- id-only success；
- generic error hygiene；
- startup/import/link/status/opportunity/health/session 0 provider calls；
- same-state explicit-trigger idempotency。

最终：**50 test files / 714 tests passed**。

正式记录：`docs/verification/2026-09-07-phase-6-batch-3-external-verification.md`

## Phase 6 / Batch 4 — PASS

Codex 产品实现：`9959cbf9a372509207ce3c78e29a800be6d39f03`

验证：

- structured LLM browser localhost client；
- fresh bridge session per action；
- browser body 只有 `jobUrl`；
- browser 不接触 API key/model/full JD；
- 50 秒 browser deadline；
- zero automatic retry；
- strict HTTP success/failure mapping；
- popup explicit user trigger；
- remote-data/API-cost disclosure；
- initialization 0 analysis calls；
- click-time active-tab revalidation；
- in-flight duplicate guard；
- fresh-final-tab fail closed restore。

最终：**52 test files / 762 tests passed**；Batch 4 专项 **48 / 48 passed**。

正式记录：`docs/verification/2026-09-08-phase-6-batch-4-external-verification.md`

## Phase 6 / Batch 5A — PASS

用户明确选择第三方 Lave8 relay，而不是官方 OpenAI endpoint。

Codex 原始实现：`cf384babda624719952b5d49a47dbfc63f6e9371`

外部审阅与测试确认：

- 独立 `providerId = 'lave8'`；
- fixed `https://lave8.com/v1/responses`；
- only approved model `gpt-6-astra`；
- Bearer key 只进入 Authorization；
- 首版严格复用 Responses request/schema/parser contract；
- 45 秒 bounded timeout；
- zero retry / zero request-shape/model/endpoint fallback；
- `BOSS_JOB_RADAR_LAVE8_API_KEY` / `BOSS_JOB_RADAR_LAVE8_MODEL`；
- OpenAI 与 Lave8 不能同时配置；
- popup disclosure 改为 provider-neutral。

首轮 CI 暴露一个真实产品回归：新增 Lave8 config 时改变了既有 OpenAI runtime-config result shape。外部 ChatGPT 给出窄 repair Prompt；Codex 修复：`6e858316ecfefb6e9c3552646cb3db7a437c93bd`。

修复后：

- OpenAI 既有 observable config shape 恢复；
- Lave8 继续使用显式 `provider: 'lave8'`；
- Lave8 transport 未修改。

最终 CI run：`34201735884`

最终工程验证：

- typecheck：PASS
- lint：PASS
- tests：PASS — **54 test files / 781 tests passed**
- Lave8 transport focused：**14 / 14 passed**
- Lave8 runtime config focused：**5 / 5 passed**
- Chrome build：PASS
- Edge build：PASS
- local-service build：PASS
- manifests：PASS

正式记录：`docs/verification/2026-09-08-phase-6-batch-5a-external-verification.md`

## Phase 6 / Batch 5B — 当前验证门槛

批准计划：`docs/decisions/ADR-0020-representative-real-lave8-evaluation-v1.md`

Batch 5B 是**验证批，不是产品编码批**。

真实验证目标：

1. 用户本机安全输入 Lave8 API key；
2. local service 使用 `gpt-6-astra`，startup 仍为 0 relay calls；
3. 用户在已保存且具有完整 JD 的真实 BOSS job detail page 主动点击一次 AI 分析；
4. 一个 click 最多一个 localhost analysis POST、最多一个 relay provider request、0 automatic retries；
5. 至少一个真实 result 通过现有 strict validator 并持久化为 `provider=lave8` / `model=gpt-6-astra`；
6. 生成只包含所选 analysis 的 sanitized evaluation JSON；
7. 外部 ChatGPT 完成 grounding、业务可用性、secret/error/cost safety 人工验收。

用户不是 CMD 测试执行器。本批允许 Codex 在不修改产品源码的前提下临时接管本机 Git/build/local-service/SQLite/导出工作。用户只保留 secure local key entry、必要的 extension Reload，以及最终一次显式分析点击。

如果真实 relay 暴露具体 request/response 兼容问题：`CHANGES_REQUIRED`，外部 ChatGPT 再生成窄 repair Prompt。

只有 Batch 5B 真实 provider 评测通过后，才能考虑：

- Capability 12 → `VERIFIED`
- Phase 6 → `PASS`
- 进入 Phase 7 / Capability 13

## 协作与测试规则

长期分工以 `AGENTS.md` 为准：

- Codex：只负责外部 Prompt 指定的产品源码、必要 migration、commit、push。
- Codex 默认不新增或修改测试，不运行测试/typecheck/lint/build/manifest verification，不做 QA 或验收。
- 外部网页版 ChatGPT：负责全部测试代码、CI、代码审阅、验证、验收和状态文档。
- 用户不是 CMD 测试执行器；仅在真实登录 BOSS 浏览器或真实 provider 场景执行不可替代的最少量人工动作。
- Batch 5B 的本机验证环境操作是一次明确例外，不改变长期角色分工。

## 长期产品边界

当前数据来源仍以用户本人正常使用 BOSS直聘 时可见的页面数据为基础。系统不保存密码、验证码、Cookie 或 Session，不调用/逆向 BOSS 私有 API，不后台无人值守采集，不自动翻页，不自动投递，不自动聊天。

所有岗位继续保留供用户人工查看；低优先级、疑似伪运营、经验不匹配、招聘状态差、模型低置信度或信息不足，只能被标记、解释或排序，不能被静默删除。
