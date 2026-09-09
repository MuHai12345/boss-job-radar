# Structured LLM 证据基础设施：本轮实现与本地回归记录

- 日期：2026-09-09
- 状态：等待外部独立审阅；不是正式验收结论
- 范围：Structured LLM real-evaluation observability / evidence reliability infrastructure
- 本轮真实 Lave8/OpenAI provider request：0
- representative real sample：未执行、未产生
- Capability 12 / Phase 6：保持 IN_PROGRESS

本轮最新 Prompt 明确授权 fake/local automated tests 和完整既有 CI 回归，是 AGENTS.md 默认测试分工的本轮例外。本记录不批准下一次真实调用，不生成下一轮修复方案。

## 本地结果

Windows，Node v24.11.1，npm 11.6.2：

| 检查 | 结果 |
| --- | --- |
| npm run typecheck | 通过 |
| npm run lint | 通过 |
| npm test | 61 files；795 passed；2 skipped（共 797） |
| npm run build | Chrome 构建通过 |
| npm run build:edge | Edge 构建通过 |
| npm run build:local | 编译和实际产物摘要写入通过 |
| npm run verify:manifests | Chrome / Edge 检查通过 |

2 个 skipped 为既有 production-data-path.test.ts 中仅非 Windows 运行的目录权限用例。本地结果不冒充 Linux GitHub CI；提交后的 CI 结果以同一 commit 的 Actions run 和最终实现报告为准。

新增测试首先观察到模块尚未实现、历史错误未归属的预期失败，随后实现并运行通过。完整回归中两个旧 provider key-list 断言因新增只读 timeoutMs 元数据而失败，已增加该安全字段及有效值断言；没有放宽业务输出验证。

## 证据覆盖

- 正式接受的 localhost request 只有一对 accepted/result 和一个 UUID；不同请求 UUID 不同；同一请求跨 HTTP/Lave8/analysis 的 UUID 相同。
- 事件 ISO 时间格式固定；provider timeout 使用 fake timer，诊断上下文在 generate 入口绑定。
- fake transport 执行前，attempt 日志已存在且含 accepted；日志独占创建，多个 attempt 不覆盖；并发逆序结束不串线。
- Lave8 fake success 经真实 strict validator 和临时 SQLite 后，summary 的 analysisId、responseAccepted 和 outcome 正确。
- validator failure、source_changed、stored_analysis_invalid、provider failure、SQLite trigger failure 后，已有日志和 fixed reason/stage 保留。
- 初始日志写入失败在正式接受前阻止远程工作；后续 append/summary 故障不会增加 provider call，已写日志不丢弃。中途未产生 result 时 summary 不伪造 finishedAt。
- 客户端断开连接后，服务端仍可写入同一 attempt 的 result。
- API key、JD、prompt、raw output、arbitrary provider/SQLite error、岗位/公司身份和绝对路径 sentinel 不出现在安全日志/summary。
- 既有 Lave8/OpenAI request shape、allowlist、strict validation、timeout、zero retry/fallback 回归继续通过。
- Side Panel 从存储恢复 analysis/pending analysis 时标注历史状态和本次未发起新请求，reload 不调用 fetch。
- 构建摘要由编译后 JS 内容确定，重复标记相同内容稳定，修改产物改变摘要，与工作目录或当前 HEAD 无关；runtimeId 每次启动不同。

## 故障解释边界

无法完成初始证据落盘的请求不算正式接受，不进入 provider；已接受的请求不因诊断写盘失败追加任何 provider 调用。日志末尾可能因 I/O 故障只剩半条记录；此前完成的 JSON 行保留，后续不再向受损日志拼接。summary 可能保持旧版本或 in_progress，须结合原始日志解释。服务端不知道实际 browser deadline，相关字段保留 null。

## 修改文件列表

构建与产品源码：

- package.json
- scripts/stamp-local-build.mjs
- src/local-service/build-identity.ts
- src/local-service/runtime-identity.ts
- src/local-service/analysis-attempt-context.ts
- src/local-service/attempt-evidence.ts
- src/local-service/main.ts
- src/local-service/runtime.ts
- src/local-service/server.ts
- src/domain/llm/structured-llm-provider.ts
- src/domain/llm/openai-structured-llm-provider.ts
- src/domain/llm/lave8-structured-llm-provider.ts
- src/domain/llm/lave8-structured-llm-diagnostics.ts
- entrypoints/sidepanel/main.ts
- entrypoints/sidepanel/snapshot.ts

测试：

- tests/local-build-identity.test.ts
- tests/safe-attempt-evidence.test.ts
- tests/sidepanel-stale-analysis.test.ts
- tests/analysis-http-diagnostics.test.ts
- tests/structured-llm-runtime-diagnostics.test.ts
- tests/lave8-diagnostics.test.ts
- tests/lave8-structured-llm-provider.test.ts
- tests/openai-structured-llm-provider.test.ts
- tests/local-service-server.test.ts

文档：

- docs/ARCHITECTURE.md
- docs/PROJECT_STATE.md
- docs/decisions/ADR-0023-real-evaluation-evidence-infrastructure.md
- docs/verification/2026-09-09-evidence-infrastructure-local-verification.md
