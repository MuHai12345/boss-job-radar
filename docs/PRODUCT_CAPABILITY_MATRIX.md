# 产品能力矩阵

## 状态定义

| 状态 | 含义 |
| --- | --- |
| `NOT_STARTED` | 尚未开始实现 |
| `IN_PROGRESS` | 正在实现，尚未形成可审阅结果 |
| `IMPLEMENTED_AWAITING_REVIEW` | 实现已完成，等待外部独立审阅与验收 |
| `VERIFIED` | 已通过外部独立审阅与验收 |
| `DEFERRED` | 已明确延期，后续批次再处理 |
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
| 7 | SearchRun / provenance / idempotent import | `IMPLEMENTED_AWAITING_REVIEW` |
| 8 | 确定性岗位真实性质识别 | `NOT_STARTED` |
| 9 | 经验硬门槛 / 偏好 / 矛盾识别 | `NOT_STARTED` |
| 10 | 招聘者活跃 / 新鲜度 / link 状态判断 | `NOT_STARTED` |
| 11 | 成长性 / 转行价值 / 风险 / 优先级 / 面试追问 | `NOT_STARTED` |
| 12 | structured LLM analysis | `NOT_STARTED` |
| 13 | 本地岗位审核 UI + 用户审核/投递状态 | `NOT_STARTED` |
| 14 | 搜索覆盖统计 / 稳定性 / backup recovery | `NOT_STARTED` |
| 15 | 列表薪资 PUA 可信解码与正式产品链路接入 | `NOT_STARTED` |

核心能力共 15 项：6 项 `VERIFIED`，1 项 `IMPLEMENTED_AWAITING_REVIEW`，8 项 `NOT_STARTED`。

本矩阵只记录已获外部结论或当前批次真实实现状态。Phase 4 / Batch 1–4 已通过外部验收；Phase 4 / Batch 5 已完成实现并等待外部独立审阅，后续能力未提前标记完成。Phase 4 仍为 `IN PROGRESS / NOT YET PASSED`。
