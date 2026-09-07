# 项目状态

## 当前状态快照

- 仓库：`MuHai12345/boss-job-radar`
- 分支：`master`
- Phase 0–5：`PASS`
- 最近完成批次：`Phase 5 / Batch 4 — PASS`
- 最近验证能力：Capability 11 — 成长性 / 转行价值 / 风险 / 当前机会优先级 / 面试追问
- 下一阶段：`Phase 6`
- 下一批：`Phase 6 / Batch 1 — Capability 12 structured LLM analysis foundation`
- Batch 4 产品实现 commit：`3cfa14478ae9cc2e354c6b423ad4bc43abe4d70f`
- Batch 4 最终外部测试 head：`1ac43bc503df57943344b9774de0b4ef9007ae45`
- Batch 4 最终 CI run：`34129608266`
- 核心能力矩阵：`12 / 15 VERIFIED`
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

尚未完成：Capability 12–14。

## Phase 5 / Batch 4 验收

产品实现：

`3cfa14478ae9cc2e354c6b423ad4bc43abe4d70f`

外部测试 head：

`1ac43bc503df57943344b9774de0b4ef9007ae45`

GitHub Actions run：

`34129608266`

最终工程验证：

- `npm ci`：PASS
- `npm run typecheck`：PASS
- `npm run lint`：PASS
- `npm test`：PASS — **46 test files / 655 tests passed**
- `npm run build`：PASS
- `npm run build:edge`：PASS
- `npm run build:local`：PASS
- `npm run verify:manifests`：PASS

Batch 4 外部测试覆盖了：growth / career-switch / risks / priority / interview questions、schema v7、append-only persistence、source-state idempotency、time-only recency transition、manual link refresh、runtime backfill、stored corruption fail-closed、failure isolation 与完整回归。

Batch 4 没有新增浏览器 UI、BOSS DOM 解析或新的 HTTP read 行为，因此无需新增真实 BOSS 浏览器人工验收。

正式记录：`docs/verification/2026-09-07-phase-5-batch-4-external-verification.md`

## Phase 6 方向

Phase 6 对应 Capability 12：structured LLM analysis。

必须建立在已经验证的原始事实和确定性结论之上。LLM 输出是附加的结构化语义解释，不得覆盖或改写：

- JobObservation 原始事实；
- deterministic job nature / experience；
- JobStatusAssessment；
- JobOpportunityAssessment；
- salary decoding facts。

Phase 6 必须继续满足：

- 完整 JD 可以进入经过批准的模型输入，但必须视为不可信数据，防止 JD 文本中的 prompt injection 改变系统指令；
- structured output 必须严格校验，invalid output fail closed；
- 不猜测缺失平台字段；
- 不用模型结果静默删除岗位；
- 不以简历相似度作为主要判断；
- 不自动投递、自动聊天、自动打招呼；
- 不触碰 BOSS Cookie / Session / 私有 API；
- 模型调用必须显式、可控，不因 import / runtime startup 自动产生远程调用或费用；
- provider / model / prompt / output schema / source state 必须可追溯；
- provider 失败或模型输出错误不得损坏已保存事实和确定性分析。

下一批的批准设计记录在 `docs/decisions/ADR-0015-structured-llm-analysis-foundation.md`。

## 协作与测试规则

长期分工以 `AGENTS.md` 为准：

- Codex：只负责外部 Prompt 指定的产品源码、必要 migration、commit、push。
- Codex 不新增或修改测试，不运行测试/typecheck/lint/build/manifest verification，不做 QA 或验收。
- 外部网页版 ChatGPT：负责全部测试代码、CI、代码审阅、验证、验收和状态文档。
- 用户不是 CMD 测试执行器；仅在无法远程复现的真实登录 BOSS 浏览器场景下执行最少量人工验证。

## 长期产品边界

当前数据来源仍以用户本人正常使用 BOSS直聘 时可见的页面数据为基础。系统不保存密码、验证码、Cookie 或 Session，不调用/逆向 BOSS 私有 API，不后台无人值守采集，不自动翻页，不自动投递，不自动聊天。

所有岗位继续保留供用户人工查看；低优先级、疑似伪运营、经验不匹配、招聘状态差、模型低置信度或信息不足，只能被标记、解释或排序，不能被静默删除。