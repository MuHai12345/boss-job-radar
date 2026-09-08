# 产品能力矩阵

## 状态定义

| 状态 | 含义 |
| --- | --- |
| `NOT_STARTED` | 尚未开始实现 |
| `IN_PROGRESS` | 正在实现，尚未形成完整能力验收 |
| `IMPLEMENTED_AWAITING_REVIEW` | 实现已完成，等待外部独立审阅与验收 |
| `VERIFIED` | 已通过外部独立审阅与验收 |
| `DEFERRED` | 已明确延期，后续补充验证 |
| `DROPPED` | 已明确取消，不再纳入产品范围 |

## 核心能力

| # | 能力 | 状态 |
| ---: | --- | --- |
| 1 | 真实 BOSS 当前页面 structured extraction | `VERIFIED` |
| 2 | 原始事实 / 完整 JD / canonical link / unknown 保真 | `VERIFIED` |
| 3 | 本地 SQLite persistence / migration / recovery | `VERIFIED` |
| 4 | 安全 localhost observation ingestion | `VERIFIED` |
| 5 | 手动 extension → localhost save | `VERIFIED` |
| 6 | Job identity / dedupe / first_seen / last_seen | `VERIFIED` |
| 7 | SearchRun / provenance / idempotent import | `VERIFIED` |
| 8 | 确定性岗位真实性质识别 | `VERIFIED` |
| 9 | 经验硬门槛 / 偏好 / 矛盾识别 | `VERIFIED` |
| 10 | 招聘者活跃 / 新鲜度 / link 状态判断 | `VERIFIED` |
| 11 | 成长性 / 转行价值 / 风险 / 优先级 / 面试追问 | `VERIFIED` |
| 12 | structured LLM analysis | `IN_PROGRESS` |
| 13 | 本地岗位审核 UI + 用户审核/投递状态 | `NOT_STARTED` |
| 14 | 搜索覆盖统计 / 稳定性 / backup recovery | `NOT_STARTED` |
| 15 | 列表薪资 PUA 可信解码与正式产品链路接入 | `VERIFIED` |

核心能力共 15 项：**12 项 `VERIFIED`，1 项 `IN_PROGRESS`，2 项 `NOT_STARTED`**。

## 当前验收快照

- Phase 0–4：`PASS`
- Phase 5 / Batch 1：`PASS`
- Phase 5 / Batch 2：`PASS`
- Phase 5 / Batch 3：`PASS`
- Phase 5 / Batch 4：`PASS`
- Phase 5：`PASS`
- Phase 6 / Batch 1：`PASS` — provider-neutral structured LLM foundation
- Phase 6 / Batch 2：`PASS` — OpenAI Responses transport v1
- Phase 6 / Batch 3：`PASS` — local provider config + protected explicit localhost trigger
- Phase 6 / Batch 4：`PASS` — popup explicit user trigger + browser privacy/cost boundary
- Phase 6 / Batch 5A：`PASS` — Lave8 relay adapter v1 + OpenAI backward-compatibility repair
- Phase 6 / Batch 5B：`PENDING` — representative real Lave8 evaluation
- Phase 6：`IN_PROGRESS`

## Capability 12 当前覆盖

已外部验证：

- minimized structured LLM snapshot；
- prompt-injection boundary；
- strict structured output validation；
- full-JD evidence / upstream-code grounding；
- schema v8 persistence；
- provider/model/source-state identity；
- same-state idempotency；
- source-change race rejection；
- provider call outside SQLite transaction；
- official OpenAI Responses transport；
- local opt-in config 与 secret sanitization；
- protected localhost explicit analysis trigger；
- popup explicit user click；
- browser 0 secret / 0 model / 0 full-JD payload；
- 50 秒 browser deadline / zero automatic retry；
- Lave8 独立 provider identity；
- fixed `https://lave8.com/v1/responses`；
- `gpt-6-astra` explicit allowlist；
- Lave8 Bearer secret boundary；
- strict Responses request/schema/parser；
- 45 秒 provider timeout；
- zero retry / zero fallback；
- OpenAI existing runtime-config observable contract 保持兼容；
- provider-neutral popup remote-data / API-cost disclosure。

Batch 5A 最终：**54 test files / 781 tests passed**；typecheck、lint、Chrome build、Edge build、local build、manifest verification 全部 PASS。

## Capability 12 剩余门槛

Capability 12 仍不提前标记 `VERIFIED`。

下一步必须完成 `Phase 6 / Batch 5B — representative real Lave8 evaluation v1`：

- 至少 1 个真实已保存 BOSS 岗位；
- 用户主动点击；
- browser → localhost → `https://lave8.com/v1/responses` → strict validator → SQLite；
- persisted identity 为 `lave8` / `gpt-6-astra`；
- 无 automatic paid retry；
- 无 secret/error leakage；
- 外部 ChatGPT 对真实 structured result 完成 grounding 与业务可用性人工验收。

如果真实 relay 暴露具体兼容问题，按 `CHANGES_REQUIRED` 生成窄 repair；如果真实评测通过，才考虑 Capability 12 → `VERIFIED` 与 Phase 6 → `PASS`。

正式记录：

- `docs/verification/2026-09-07-phase-6-batch-1-external-verification.md`
- `docs/verification/2026-09-07-phase-6-batch-2-external-verification.md`
- `docs/verification/2026-09-07-phase-6-batch-3-external-verification.md`
- `docs/verification/2026-09-08-phase-6-batch-4-external-verification.md`
- `docs/verification/2026-09-08-phase-6-batch-5a-external-verification.md`

下一批设计：

- `docs/decisions/ADR-0020-representative-real-lave8-evaluation-v1.md`
