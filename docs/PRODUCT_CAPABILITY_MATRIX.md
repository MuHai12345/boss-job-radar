# 产品能力矩阵

## 状态定义

| 状态 | 含义 |
| --- | --- |
| `NOT_STARTED` | 尚未开始实现 |
| `IN_PROGRESS` | 正在实现，尚未形成可审阅结果 |
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
| 12 | structured LLM analysis | `NOT_STARTED` |
| 13 | 本地岗位审核 UI + 用户审核/投递状态 | `NOT_STARTED` |
| 14 | 搜索覆盖统计 / 稳定性 / backup recovery | `NOT_STARTED` |
| 15 | 列表薪资 PUA 可信解码与正式产品链路接入 | `VERIFIED` |

核心能力共 15 项：**12 项 `VERIFIED`，3 项 `NOT_STARTED`**。

## 当前验收快照

- Phase 0–4：`PASS`
- Phase 5 / Batch 1：`PASS`（岗位真实性质 + 经验门槛确定性分析）
- Phase 5 / Batch 2：`PASS`（SearchRun 薪资 PUA 可信解码与产品链路）
- Phase 5 / Batch 3：`PASS`（招聘者活跃、平台新鲜度、local observation recency、岗位 link 状态）
- Phase 5 / Batch 4：`PASS`（成长性、转行价值、风险、当前机会优先级、面试追问）
- Phase 5：`PASS`
- 下一阶段：Phase 6 / Capability 12 structured LLM analysis。

Phase 5 / Batch 3 的正式外部验收依据记录在 `docs/verification/2026-09-07-phase-5-batch-3-external-verification.md`。

Phase 5 / Batch 4 的正式外部验收依据记录在 `docs/verification/2026-09-07-phase-5-batch-4-external-verification.md`。Batch 4 没有新增浏览器 UI / DOM 行为，因此无需额外真实 BOSS 浏览器点击验收。