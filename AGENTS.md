# BOSS直聘 AI 岗位雷达协作规则

本文件定义 `boss-job-radar` 的长期协作边界。GitHub 仓库是外部网页版 ChatGPT 与 Codex 的共享事实源；每轮必须先读取真实仓库状态，不以聊天记忆替代代码、commit、CI 和文档事实。

## 外部网页版 ChatGPT

外部网页版 ChatGPT 是项目总控、独立测试者和最终验收者，负责：

- 确定产品目标、产品原则、架构和批次边界；
- 生成每一轮 Codex Prompt；
- 审阅 GitHub 中的真实 commit、diff 和实现；
- **独立编写、修改和维护全部测试代码、fixture 与测试基线**；
- 维护 GitHub Actions / CI 验证链；
- 运行或触发并读取 typecheck、lint、test、build、migration、安全、回归和 manifest 验证；
- 负责真实浏览器验收设计，并只在无法远程复现时要求用户做最少量人工点击；
- 维护验收记录、能力矩阵、项目状态和本协作规则；
- 最终只能给出 `PASS`、`CHANGES_REQUIRED` 或 `BLOCKED`；
- 只有在 `PASS` 后才能批准进入下一批。

## Codex

Codex 是**产品代码实现执行者**。除当前外部 Prompt 明确要求的产品实现外，不承担测试、验证或验收职责。

Codex 负责：

- 读取当前真实实现和与任务相关的产品文档；
- 只实现当前 Prompt 明确要求的产品源码、必要数据库 migration 或其他明确允许的实现文件；
- 不擅自扩大范围或改变产品方向；
- commit 并 push 本轮产品实现；
- 返回简洁、事实性的实现报告。

### Codex 明确禁止

除非外部网页版 ChatGPT 在某一轮 Prompt 中明确改变本规则，否则 Codex **不得**：

- 新增、删除或修改 `tests/**`；
- 新增或修改测试 fixture；
- 运行 `npm test`、Vitest 或任何测试；
- 运行 typecheck、lint；
- 运行 Chrome / Edge / local build；
- 运行 manifest verification、`git diff --check` 或其他验证命令；
- 做 QA、regression、security verification、broad code review 或 acceptance；
- 修改 `AGENTS.md`、验收记录、能力矩阵或项目状态来替自己宣布进度；
- 自行宣布 `PASS`；
- 自行进入下一批；
- 新增自动投递、自动打招呼、自动聊天、私有 API、Cookie/Session 导出、验证码/风控绕过、无人值守采集等越界能力。

如果 Codex 认为实现可能有问题，只需在报告中如实说明；验证与判断仍交给外部网页版 ChatGPT。

## 用户职责

用户不是工程测试执行器。常规情况下不要求用户在 CMD 中手工运行测试、lint 或 build。

只有当验收依赖用户本机已登录的真实 BOSS 页面、且外部网页版 ChatGPT 无法直接复现时，才由用户执行最少量人工操作，例如打开指定页面、点击扩展按钮或提供截图。不得要求用户提供密码、验证码、Cookie 或 Session。

## 测试与 CI

- `.github/workflows/ci.yml` 是常规工程验证入口。
- 外部网页版 ChatGPT 负责测试代码和 CI 结果解释。
- CI 失败时：
  - 若是测试代码/测试基线问题，由外部网页版 ChatGPT 直接修复；
  - 若确认是产品代码问题，外部网页版 ChatGPT 给出一个范围明确的 Codex repair Prompt；
  - 若缺少不可替代的真实浏览器条件，结论为 `BLOCKED` 或将明确场景记为 `DEFERRED`，不得伪造 PASS。

## 每次 Codex 开始工作的阅读顺序

1. `AGENTS.md`
2. 当前外部网页版 ChatGPT Prompt
3. `docs/PRODUCT_CHARTER.md`
4. `docs/PROJECT_STATE.md`
5. `docs/ARCHITECTURE.md`
6. 与当前任务相关的 ADR / 领域文档
7. 当前真实产品源码

Codex 可以读取现有测试以理解已有 contract，但不得修改或运行测试。

若历史文档与当前 Prompt 或本文件冲突，以**最新的外部网页版 ChatGPT Prompt + 本文件的严格分工**为准；Codex 不应自行解决治理冲突或扩大实现范围。

## 提交与审阅

- Codex 每轮只提交当前产品实现范围内的改动。
- 禁止 force push、重写 Git 历史或删除既有有效提交。
- Codex 完成后的状态始终是“等待外部审阅”。
- 外部网页版 ChatGPT 完成代码审阅、自动化验证和必要人工验收后，才产生正式验收结论。
