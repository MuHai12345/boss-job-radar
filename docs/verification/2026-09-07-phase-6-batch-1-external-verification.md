# Phase 6 / Batch 1 外部验收记录

- 日期：2026-09-07
- 能力：Capability 12 — structured LLM analysis（provider-neutral foundation）
- Codex 产品实现 commit：`c8edc28f7a521098db132460a9d64ee34fecae27`
- 合并到 `master` 的产品 lineage merge：`beb7bcb9ab87893b8626761d97b77cd19596acf5`
- 最终外部测试 head：`20b208721f119155ceed4d8421f10f7238ea9557`
- GitHub Actions run：`34132535995`
- 结论：`PASS`
- Capability 12 整体状态：`IN_PROGRESS`（本批只验证 provider-neutral foundation，不代表真实 provider 已完成）

## 代码审阅结论

外部网页版 ChatGPT 审阅了 Codex 的真实产品 diff。Codex commit 只修改了批准范围内的 8 个产品文件：

- `src/domain/llm/structured-llm-analysis-types.ts`
- `src/domain/llm/structured-llm-provider.ts`
- `src/domain/llm/structured-llm-input.ts`
- `src/domain/llm/structured-llm-prompt.ts`
- `src/domain/llm/structured-llm-analysis-validation.ts`
- `src/local-service/database/structured-llm-analysis-repository.ts`
- `src/local-service/database/migrations.ts`
- `src/local-service/database/database.ts`

没有新增或修改真实 provider transport、API key、HTTP endpoint、popup / Dashboard、import 自动分析、runtime startup 自动分析、后台队列、自动投递、BOSS 私有 API、Cookie / Session、验证码或风控绕过能力。

实现满足 ADR-0015 的核心 contract：

- 固定 prompt version `structured-llm-job-analysis-prompt-v1`；
- 固定 output schema version `structured-llm-job-analysis-v1`；
- provider-neutral `StructuredLlmProvider` 返回 `unknown`，产品层自行严格验证；
- provider identity 做非空、长度和控制字符校验；
- LLM 输入快照只投影批准的最小原始事实和已验证的 deterministic / status / opportunity 结构化上下文，不传 company、URL、raw page text、Cookie、Session、数据库路径或账号信息；
- 完整 JD 绑定现有 deterministic `jdObservationId`，没有完整 JD 时不调用 provider；
- prompt 把 JD 明确标记为不可信招聘数据，并使用稳定 `<job_data>` 数据边界；JSON 序列化额外转义 `<` / `>`，JD 无法通过伪造 closing tag 逃逸数据边界；
- authoritative upstream structured facts 只能被解释，不能由模型覆盖；
- structured output exact-shape 校验、枚举/长度/数组上限、重复引用、prototype/accessor 防护均 fail closed；
- `full_jd` evidence 必须是当前 `fullJdText` 的真实连续 substring；
- deterministic / status / opportunity evidence code 必须存在于当前 source snapshot 的允许集合；
- source-state key 显式绑定 prompt/output/upstream rule versions、latest/JD observation 与 opportunity source state；
- schema v8 新增 append-only `structured_llm_analyses`，以 provider / model / source state 区分历史；
- 同 provider/model/source state 幂等，不重复调用 provider；
- provider Promise 在 SQLite transaction 外等待；
- provider 返回后重新读取 source state，变化时拒绝 stale result；
- provider failure、invalid output、stored corruption 都使用固定非敏感错误；
- stored row 会重新验证 wrapper、索引字段、source ownership 与 evidence grounding；
- `LocalDatabase` 只暴露 repository，不会在 open/import/link/runtime 路径自动产生远程调用或费用。

## 外部测试

外部网页版 ChatGPT 独立新增：

- `tests/structured-llm-analysis.test.ts`
- `tests/structured-llm-repository.test.ts`

并把既有 schema baseline 从 v7 同步到 v8。第一次全量 CI 暴露的 8 个失败全部属于旧测试仍断言 schema v7 的测试基线漂移；新 Batch 1 专项测试本身全部通过。外部测试基线更新后，最终 CI 全绿，没有发现需要 Codex 修复的产品代码缺陷。

最终 CI：

- `npm ci`：PASS
- `npm run typecheck`：PASS
- `npm run lint`：PASS
- `npm test`：PASS — **48 test files / 679 tests passed**
- `npm run build`：PASS
- `npm run build:edge`：PASS
- `npm run build:local`：PASS
- `npm run verify:manifests`：PASS

Batch 1 专项覆盖至少包括：

- input minimization / privacy projection；
- prompt version / output schema version / stable source-state key；
- prompt-injection delimiter 逃逸保护；
- authoritative upstream evidence-code allowlist；
- exact structured output shape；
- full-JD exact-substring grounding；
- invented upstream code rejection；
- unknown key / overlong text / duplicate reference rejection；
- accessor-bearing / special-prototype provider object fail closed；
- provider identity validation；
- schema v8 table / index / migration baseline；
- fake-provider success；
- provider call outside SQLite transaction；
- same-state idempotency；
- different provider/model independent history；
- missing JD no-call；
- provider failure no retry / no partial persistence；
- invalid provider output no persistence；
- source change during `await` rejects stale result；
- upstream source change appends new history；
- time-only local recency bucket change creates new source state；
- caller active transaction refusal；
- malformed stored wrapper fail closed；
- indexed provider/model mismatch fail closed；
- cross-Job observation ownership corruption fail closed；
- persisted full-JD evidence losing grounding fails closed；
- complete existing regression suite。

## 浏览器 / 真实模型验收

本批没有新增浏览器 UI、localhost LLM endpoint 或任何真实 provider transport，因此不需要新的真实 BOSS 浏览器人工验收，也不伪造“真实模型调用已通过”。

真实 provider、API key / cost boundary、timeout、远程失败语义、显式用户触发方式和代表性脱敏真实模型评测属于 Phase 6 后续批次。

## 最终结论

`Phase 6 / Batch 1 — PASS`

provider-neutral structured LLM analysis foundation 已通过外部独立审阅和工程验收。

`Capability 12 — IN_PROGRESS`

Capability 12 只有在后续真实 provider transport、受控配置、显式调用边界和代表性脱敏评测通过后，才可升级为 `VERIFIED`。