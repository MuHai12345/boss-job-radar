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
| 7 | SearchRun / provenance / idempotent import | `VERIFIED` |
| 8 | 确定性岗位真实性质识别 | `VERIFIED` |
| 9 | 经验硬门槛 / 偏好 / 矛盾识别 | `VERIFIED` |
| 10 | 招聘者活跃 / 新鲜度 / link 状态判断 | `NOT_STARTED` |
| 11 | 成长性 / 转行价值 / 风险 / 优先级 / 面试追问 | `NOT_STARTED` |
| 12 | structured LLM analysis | `NOT_STARTED` |
| 13 | 本地岗位审核 UI + 用户审核/投递状态 | `NOT_STARTED` |
| 14 | 搜索覆盖统计 / 稳定性 / backup recovery | `NOT_STARTED` |
| 15 | 列表薪资 PUA 可信解码与正式产品链路接入 | `IMPLEMENTED_AWAITING_REVIEW` |

核心能力共 15 项：9 项 `VERIFIED`，1 项 `IMPLEMENTED_AWAITING_REVIEW`，5 项 `NOT_STARTED`。

本矩阵只记录已获外部结论或当前批次真实实现状态。依据本轮外部 Prompt，Phase 4 / Batch 1–5 及 Phase 4 均为 `PASS`。Phase 5 为 `IN PROGRESS / NOT YET PASSED`；Phase 5 / Batch 1 已由外部正式 PASS；Batch 2 的 SearchRun 范围薪资解码已实现，等待外部独立审阅。其余能力保持原状态。
