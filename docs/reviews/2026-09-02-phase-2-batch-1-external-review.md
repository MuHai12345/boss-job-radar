# Phase 2 / Batch 1 外部审阅记录

- 审阅者：外部网页版 ChatGPT
- 审阅 commit：`65cf1a30485892235369a7909afe7ac6d0ee9c47`
- 初次结论：`CHANGES_REQUIRED`
- 初次问题统计：Medium 1

## 初次审阅状态

Phase 2 / Batch 1 的代码主体审阅通过，用户本人进行的三类真实页面人工 probe 也均成功运行。真实验证同时发现，顶层 `pageUrl` 包含 DOM 结构诊断不需要的 query/hash；真实详情页证明 query 可能承载安全或跟踪参数，因此必须在进入下一批前整改。

整改要求为：

- `ManualDomProbeResult.pageUrl` 只保留 protocol、hostname 和 pathname；
- 页面执行期间的导航判断使用相同的安全页面身份；
- query/hash 变化不视为导航，pathname 变化仍视为导航；
- 不改变人工触发、权限、网络和自动交互边界。

初次审阅要求整改实现完成后重新交由外部网页版 ChatGPT 审阅；在该次初审时，本记录不将 Phase 2 / Batch 1 写为 `PASS`，也不授权进入 Phase 2 / Batch 2。

## Privacy repair re-review

- 修复 commit：`7bb980bd48a1af1dcd2b8105e1557d51662b29cd`
- 外部网页版 ChatGPT 最终结论：`PASS`
- 问题统计：Critical 0、High 0、Medium 0、Low 1

原 Medium 为顶层 `pageUrl` 暴露 DOM 结构诊断不需要的 query/hash。外部网页版 ChatGPT 复审确认：

- `pageUrl` 现在只输出 protocol、hostname 和 pathname；
- query/hash 不再输出；
- 页面身份导航比较同样只使用 protocol、hostname 和 pathname；
- 同 pathname 不同 query/hash 不误报导航；
- 不同 pathname 仍能识别导航；
- 未保存用户真实 probe JSON；
- 未保存任何真实 security/tracking 参数；
- Manifest 权限没有扩大；
- 允许进入 Phase 2 / Batch 2。

剩余 Low：通用候选 `textPreview` 仍可能包含页面顶部的账户显示名称。该问题不阻塞当前阶段；Phase 2 / Batch 2 通过只针对已人工确认岗位区域的 scoped probe 降低该暴露面。

以上是外部网页版 ChatGPT 已经作出的真实复审结论。Codex 只负责将该结论记录到仓库，不是由 Codex 自行作出验收结论。
