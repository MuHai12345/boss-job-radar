# 项目状态

## 当前状态快照

- 仓库：`MuHai12345/boss-job-radar`
- 分支：`master`
- Phase 0–5：`PASS`
- Phase 6：`IN PROGRESS`
- 最近完成批次：`Phase 6 / Batch 1 — PASS`
- 当前能力：Capability 12 — structured LLM analysis：`IN_PROGRESS`
- 下一批：`Phase 6 / Batch 2 — OpenAI Responses provider transport v1`
- Batch 1 Codex 产品实现 commit：`c8edc28f7a521098db132460a9d64ee34fecae27`
- Batch 1 产品 lineage merge：`beb7bcb9ab87893b8626761d97b77cd19596acf5`
- Batch 1 最终外部测试 head：`20b208721f119155ceed4d8421f10f7238ea9557`
- Batch 1 最终 CI run：`34132535995`
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

其中 Capability 12 已完成 provider-neutral foundation，但整体仍为 `IN_PROGRESS`。

## Phase 6 / Batch 1 验收

Batch 1 建立了 provider-neutral structured LLM analysis foundation：

- `StructuredLlmProvider` 抽象；
- 最小化 LLM input snapshot；
- 完整 JD 与 authoritative upstream structured facts 输入边界；
- prompt injection / delimiter 防线；
- 固定 prompt version 与 output schema version；
- exact-shape structured output validator；
- full-JD substring evidence grounding；
- deterministic / status / opportunity evidence-code grounding；
- schema v8 `structured_llm_analyses`；
- provider/model/source-state append-only history；
- same-state idempotency；
- provider call outside SQLite transaction；
- source-change race rejection；
- provider failure / invalid output / stored corruption fail closed；
- missing complete JD 时不调用 provider；
- `LocalDatabase` 只暴露 repository，不产生自动远程调用。

本批没有真实 provider、API key、HTTP LLM endpoint、popup/UI 或自动调用。

最终工程验证：

- `npm ci`：PASS
- `npm run typecheck`：PASS
- `npm run lint`：PASS
- `npm test`：PASS — **48 test files / 679 tests passed**
- `npm run build`：PASS
- `npm run build:edge`：PASS
- `npm run build:local`：PASS
- `npm run verify:manifests`：PASS

第一次全量 CI 暴露的失败全部是既有测试仍断言 schema v7 的测试基线漂移；外部网页版 ChatGPT 更新测试基线到 v8 后全量回归通过，没有发现需要 Codex 修复的 Batch 1 产品代码缺陷。

正式记录：`docs/verification/2026-09-07-phase-6-batch-1-external-verification.md`

## Phase 6 / Batch 2 方向

下一批只接入第一个具体 provider transport：OpenAI Responses API。

批准设计：

`docs/decisions/ADR-0016-openai-structured-llm-provider-v1.md`

Batch 2 范围：

- OpenAI Responses API transport；
- `providerId = openai`；
- 显式模型 ID；
- API key 只作为 provider constructor secret，不持久化、不记录；
- Responses Structured Outputs `json_schema` + strict；
- `store:false`、无 tools、无 background、无 conversation；
- 固定 timeout；
- 零 retry；
- HTTP / refusal / incomplete / malformed output 统一 fail closed；
- fake transport 外部测试。

Batch 2 仍不做：

- 从本地环境实际加载 API key；
- localhost LLM endpoint；
- browser trigger；
- 真实远程模型验收；
- Capability 13 UI。

因此 Batch 2 即使 PASS，Capability 12 仍保持 `IN_PROGRESS`。后续还需要受控本地配置、显式用户触发链路和代表性脱敏真实模型评测，才能考虑 Capability 12 整体 `VERIFIED`。

## 协作与测试规则

长期分工以 `AGENTS.md` 为准：

- Codex：只负责外部 Prompt 指定的产品源码、必要 migration、commit、push。
- Codex 不新增或修改测试，不运行测试/typecheck/lint/build/manifest verification，不做 QA 或验收。
- 外部网页版 ChatGPT：负责全部测试代码、CI、代码审阅、验证、验收和状态文档。
- 用户不是 CMD 测试执行器；仅在无法远程复现的真实登录 BOSS 浏览器或真实 provider 场景下执行最少量人工验证。

## 长期产品边界

当前数据来源仍以用户本人正常使用 BOSS直聘 时可见的页面数据为基础。系统不保存密码、验证码、Cookie 或 Session，不调用/逆向 BOSS 私有 API，不后台无人值守采集，不自动翻页，不自动投递，不自动聊天。

所有岗位继续保留供用户人工查看；低优先级、疑似伪运营、经验不匹配、招聘状态差、模型低置信度或信息不足，只能被标记、解释或排序，不能被静默删除。