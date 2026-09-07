# 项目状态

## 当前状态快照

- 仓库：`MuHai12345/boss-job-radar`
- 分支：`master`
- 当前阶段：`Phase 5`
- 当前批次结论：`Phase 5 / Batch 3 — PASS`
- 下一步骤：`Phase 5 / Batch 4 — Capability 11（成长性 / 转行价值 / 风险 / 优先级 / 面试追问）`
- Phase 5：`IN PROGRESS`
- 最后产品实现 commit：`c40528526610d764d1c5987852124d2d2fcc7447`
- Batch 3 外部测试完成 head：`1d6ed4405c53eb55318541a5e6ed0d2f3693d78b`
- 核心能力矩阵：`11 / 15 VERIFIED`
- 当前实现阻塞：无

## 阶段结论

- Phase 0：`PASS`
- Phase 1：`PASS`
- Phase 2：`PASS`
- Phase 3：`PASS`
- Phase 4：`PASS`
- Phase 5 / Batch 1：`PASS`
- Phase 5 / Batch 2：`PASS`
- Phase 5 / Batch 3：`PASS`

Phase 5 尚未整体结束；Capability 11 尚未开始。Capability 12（structured LLM analysis）属于后续 Phase 6，不得提前混入下一批。

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
15. SearchRun 范围薪资 PUA 可信解码与正式产品链路

尚未开始：Capability 11–14。

## Phase 5 / Batch 3 验收状态

### 产品实现 lineage

- initial implementation：`3f04bb40ce14e0e1b106e7b311a03f1c31bc3b98`
- status handling repair：`34f108ae7b281597d2291d9deacabef8ec112369`
- lint-only repair：`c40528526610d764d1c5987852124d2d2fcc7447`

Batch 3 新增/完善：

- schema v6 `job_link_checks` / `job_status_assessments`
- recruiter activity deterministic buckets
- platform freshness deterministic buckets
- local observation rolling recency buckets
- manual job detail link status inspection
- `available` / `explicitly_unavailable` / `unknown` fail-closed semantics
- append-only link-check history
- current assessment materialization across recency bucket changes
- popup active-tab fail-closed handling
- safe localhost `/job-link-checks` write path

### 外部自动化验收

外部网页版 ChatGPT 已建立 `.github/workflows/ci.yml` 并维护测试代码。最终 Batch 3 CI head：

`1d6ed4405c53eb55318541a5e6ed0d2f3693d78b`

GitHub Actions run：`34124021524`

结果：

- `npm ci`：PASS
- `npm run typecheck`：PASS
- `npm run lint`：PASS
- `npm test`：PASS — **43 test files / 634 tests passed**
- `npm run build`：PASS
- `npm run build:edge`：PASS
- `npm run build:local`：PASS
- `npm run verify:manifests`：PASS

Batch 3 专项自动化覆盖包括：

- schema v6 migration / constraints / future-version fail-closed
- recruiter activity / platform freshness / local recency buckets
- status source selection and older-source warnings
- link check request validation and canonical URL policy
- automatic `available` evidence and idempotent import replay
- manual link history and newer `available` superseding older unavailable fact
- `/job-link-checks` Host / Origin / token / content type / validation / 404 / 201 / generic 500 behavior
- local-service link-check client fresh session and no POST retry
- request-level navigation / challenge / unstable document fail-closed handling
- popup active-tab disappears / throws fail-closed regression
- popup concurrency lock
- DOM probe exact unavailable markers, hidden-text rejection, challenge/login/iframe unknown behavior, long-JD false-positive protection
- full existing regression suite

### 真实浏览器验收

用户本人在真实登录 BOSS 岗位详情页完成：

- link status action 正常显示：PASS
- 正常岗位判断 `available`：PASS
- local service 保存链路：PASS

当前没有自然出现的样本：

- 真实 `explicitly_unavailable` 页面：`DEFERRED`
- 真实 CAPTCHA / 登录 / security challenge → `unknown` 页面：`DEFERRED`

这两个真实页面场景不伪造 PASS，也不要求用户刻意触发风控；对应 fail-closed 行为已有自动化测试。后续自然遇到时可补充真实浏览器验证，不阻塞 Batch 3 当前验收。

正式记录：`docs/verification/2026-09-07-phase-5-batch-3-external-verification.md`

## 协作与测试规则

当前长期分工以 `AGENTS.md` 为准：

- Codex：只负责外部 Prompt 指定的产品代码实现、commit、push。
- Codex 不负责测试代码，不运行测试/typecheck/lint/build/manifest verification，不做 QA 或最终验收。
- 外部网页版 ChatGPT：负责全部测试代码、CI、代码审阅、验证、验收和状态文档。
- 用户不是 CMD 测试执行器；仅在无法远程复现的真实登录 BOSS 浏览器场景下执行最少量人工验证。

## 下一批约束

下一批是 Phase 5 / Batch 4，即 Capability 11：

> 成长性 / 转行价值 / 风险 / 优先级 / 面试追问

下一批必须继续遵守：

- 基于已保存的真实事实、完整 JD、Capability 8/9/10 的确定性结果；
- 高召回，不静默删除任何岗位；
- 不以单一总分覆盖各维度；
- unknown 必须保留 unknown，不能猜测缺失信息；
- 结果必须可解释、可追溯、可版本化；
- 仍不引入 LLM；
- 不做 Dashboard；
- 不自动投递、聊天、打招呼；
- 不增加后台抓取、私有 API、Cookie/Session、验证码/风控绕过。

## 长期产品边界

当前搜索范围仍以用户本人正常使用 BOSS直聘 时可见的数据为基础。系统不保存密码、验证码、Cookie 或 Session，不调用/逆向 BOSS 私有 API，不后台无人值守采集，不自动翻页，不自动投递，不自动聊天。

所有岗位必须保留可供用户人工查看；低优先级、疑似伪运营、经验不匹配、招聘状态差或信息不足，只能被标记/排序，不能被静默删除。
