# ADR-0001：外部总控、测试与实现角色严格分离

- 状态：项目治理基线
- 日期：2026-09-01
- 最近更新：2026-09-07

## 背景

项目需要让产品方向、架构决策、测试和最终验收保持稳定，同时允许 Codex 在明确范围内高效实现产品代码。用户不应承担工程测试执行器角色；GitHub 和 CI 应成为可追溯的共享事实源。

## 决策

- 外部网页版 ChatGPT 负责产品目标、架构决策、任务拆解、GitHub 代码审阅、全部测试代码、fixture、测试基线、CI、typecheck、lint、build、migration、安全与回归验证，以及最终 `PASS / CHANGES_REQUIRED / BLOCKED` 结论。
- Codex 只负责当前外部 Prompt 明确批准的产品代码实现、必要 migration、commit、push 和事实性实现报告。
- Codex 不新增或修改 `tests/**` / fixture，不运行测试、Vitest、typecheck、lint、build、manifest verification，不承担 QA、回归、广泛代码审阅或最终验收，也不自行宣布 PASS 或进入下一批。
- 用户不是 CMD 测试执行器。常规工程验证由外部网页版 ChatGPT 通过 CI 完成；仅当验收依赖用户本人已登录且外部环境无法访问的真实 BOSS 页面时，用户执行最少量点击或截图。
- GitHub 仓库、commit、CI 日志和外部验收记录是长期共享上下文；真实仓库事实优先于临时聊天记忆。
- 历史文档若与 `AGENTS.md` 或最新外部 Prompt 的严格分工冲突，以 `AGENTS.md` 与最新外部 Prompt 为准。

## 结果

Codex 的任何提交状态都只是“等待外部审阅”。只有外部网页版 ChatGPT 完成代码审阅、自动化验证及必要真实浏览器验收后，才可形成正式验收结论并批准下一批。
