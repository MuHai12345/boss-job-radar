# Phase 5 / Batch 4 外部验收记录

- 日期：2026-09-07
- 能力：Capability 11 — 成长性 / 转行价值 / 风险 / 当前机会优先级 / 面试追问
- 产品实现 commit：`3cfa14478ae9cc2e354c6b423ad4bc43abe4d70f`
- 最终外部测试 head：`1ac43bc503df57943344b9774de0b4ef9007ae45`
- GitHub Actions run：`34129608266`
- 结论：`PASS`

## 代码审阅结论

外部网页版 ChatGPT 审阅了 Batch 4 的真实产品 diff。实现范围保持在批准的产品文件内：

- `src/domain/opportunity/**`
- schema v7 migration
- opportunity repository
- LocalDatabase 暴露
- import / manual link / runtime refresh integration
- fixed generic failure isolation

没有新增 LLM、HTTP read API、popup / Dashboard、自动投递、私有 BOSS API、Cookie / Session 导出、验证码或风控绕过能力。

实现满足 ADR-0014 的核心 contract：

- `job-opportunity-assessment-v1` 显式规则版本；
- growth / career-switch / risk / priority / interview-question 分轴输出；
- growth 只复用上游已经确认的 `ecommerce_core.<family>` 正向职责证据，不重新解析 JD；
- 1–2 年硬门槛保留为 `worth_trying`，3 年及以上为 `hard_mismatch`；
- `unknown` / `unchecked` 不等价为 unavailable；
- S/A/B/C/REVIEW 只作为可解释优先级，不删除或隐藏 Job；
- schema v7 `job_opportunity_assessments` append-only；
- source-state key 包含会改变结论的确定性/status 版本与 source IDs，以及 local recency bucket；
- 同 source state 幂等，local recency 仅因时间跨 bucket 时可 materialize 新历史；
- stored JSON、索引列、source ownership 与重新计算结果不一致时 fail closed；
- import、manual link check、runtime backfill 后均安全刷新 opportunity；
- opportunity 派生失败不回滚已提交事实，并只输出固定非敏感诊断。

## 外部测试

外部网页版 ChatGPT 独立新增 / 维护了 Batch 4 测试与 schema v7 测试基线。最终 CI 结果：

- `npm ci`：PASS
- `npm run typecheck`：PASS
- `npm run lint`：PASS
- `npm test`：PASS — **46 test files / 655 tests passed**
- `npm run build`：PASS
- `npm run build:edge`：PASS
- `npm run build:local`：PASS
- `npm run verify:manifests`：PASS

Batch 4 专项覆盖至少包括：

- strong / moderate / limited / unknown growth 边界；
- suitable / worth_trying / hard_mismatch / unclear 转行价值；
- 1–2 年与 3+ 年经验分界；
- genuine / mixed / likely-non / insufficient 岗位性质组合；
- unavailable / unknown / unchecked link 的 fail-closed 优先级语义；
- recruiter / platform stale 降级；
- 风险顺序与 upstream warning 传播；
- 面试问题固定顺序、去重与最多 6 条；
- schema v7 表结构与约束；
- import 后 materialization；
- same-state idempotency；
- local recency time-only 跨 bucket 追加历史；
- manual link fact 后 status → opportunity 刷新；
- malformed stored JSON fail closed；
- 结构合法但语义被篡改的 current assessment fail closed；
- source ownership / indexed-field consistency；
- opportunity failure 不回滚 import；
- runtime startup backfill；
- 单 Job startup opportunity failure 不阻塞其他 Job 或 HTTP service；
- generic diagnostic 不泄露触发器 sentinel / 原始数据；
- schema v7 对既有数据库、deterministic analysis、salary、observation 与完整回归的兼容。

## 浏览器验收

Batch 4 没有新增浏览器 UI、BOSS DOM 解析或 HTTP read 行为，因此不需要新的真实 BOSS 浏览器人工验收。Batch 3 已验证的真实浏览器链路继续作为上游事实输入，不在本批重复要求用户操作。

## 最终结论

`Phase 5 / Batch 4 — PASS`

`Capability 11 — VERIFIED`

Phase 5 的确定性分析范围至此完成，下一阶段进入 Phase 6 / Capability 12 structured LLM analysis。