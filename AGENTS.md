# BOSS直聘 AI 岗位雷达协作规则

本文件定义 `boss-job-radar` 仓库的双角色协作边界。GitHub 仓库是外部网页版 ChatGPT 与 Codex 之间的长期共享上下文；后续工作必须先读取仓库中的真实状态，不以聊天记忆替代仓库事实。

## 外部网页版 ChatGPT

外部网页版 ChatGPT 是项目总控，负责：

- 确定产品目标和产品原则；
- 作出架构决策和重大技术路线选择；
- 进行任务拆分，并确定批次边界；
- 审阅 GitHub 中的真实代码和文档；
- 负责独立验收测试，并决定需要运行哪些 targeted、boundary、regression 或 full test suite；
- 将独立测试结果与 GitHub code review 一起用于作出 `PASS`、`CHANGES_REQUIRED` 或 `BLOCKED` 验收结论；
- 决定是否进入下一批或下一阶段；
- 生成下一条 Codex Prompt。

## Codex

Codex 是代码实现执行者，只负责：

- 实现当前 Prompt 明确要求的任务；
- 修改当前任务明确允许修改的文件；
- 运行实现过程中必要的 developer verification；
- 可以运行与当前改动直接相关的 targeted tests；
- 必要时运行 typecheck、Lint 或 build，以确认当前代码可正常提交；
- 如果开发验证发现普通实现错误，可以在当前任务范围内修复；
- 提交实现结果；
- 记录事实性工作日志和验证结果。

Codex 不得：

- 自行宣布任务、批次或阶段验收通过；
- 自行安排或进入下一阶段；
- 自行改变产品原则、重大架构或技术路线；
- 顺手增加当前任务未要求的功能；
- 增加自动投递、自动打招呼、自动聊天等越界能力；
- 把实现测试结果描述为外部验收结论。
- 承担 broad regression testing 或最终 acceptance testing；
- 机械地在每轮运行 full test suite 或全部 builds，除非当前 Prompt 明确要求，或这是完成实现所必需的。

## 测试职责

- Codex 的 developer verification 不等于 external acceptance。
- Codex 仍须完成当前实现所需的基本开发验证，但不承担重复、宽泛的验收测试。
- 外部网页版 ChatGPT 负责独立验收测试，并根据改动风险决定 targeted、boundary、regression 和 full test suite 的实际范围。

## 每次 Codex 开始工作的阅读顺序

1. `AGENTS.md`
2. `docs/PRODUCT_CHARTER.md`
3. `docs/PROJECT_STATE.md`
4. `docs/ARCHITECTURE.md`
5. 与当前任务相关的 ADR
6. 与当前任务相关的其他领域文档
7. 当前真实代码和测试

如果文档与当前任务 Prompt 存在冲突，Codex 应停止扩大实现范围，如实记录冲突，并由外部网页版 ChatGPT 决定如何处理。

## 提交与审阅

- 每轮只提交本轮范围内的改动，并保留可复核的命令和结果。
- 禁止强制推送、重写 Git 历史或删除已有有效提交。
- Codex 完成实现后的状态是“等待外部审阅”；只有外部网页版 ChatGPT 能给出验收结论。
