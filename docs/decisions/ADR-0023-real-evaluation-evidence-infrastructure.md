# ADR-0023：Structured LLM 真实评估证据基础设施

- 日期：2026-09-09
- 状态：已实现，等待外部独立审阅；不代表 Capability 12 验收
- 范围：Structured LLM real-evaluation observability / evidence reliability infrastructure

## 当前授权边界

本轮 Prompt 明确授权产品实现、fake provider / fake transport 测试、完整工程回归及必要文档更新。本轮不得发起真实 Lave8/OpenAI 请求。本文件及本轮实现不授权下一次真实测试；此前 ADR-0021、ADR-0022 中的下一次真实调用计划暂停，须由外部 ChatGPT 在审阅后重新决定。

最近可证明的真实失败仍为旧 runtime 的 45 秒 provider timeout。源码中的 90 秒 provider / 100 秒 browser deadline 不能证明旧进程已运行新版。持久化的 Side Panel 错误也不能证明发生了新调用。

## 设计与实现计划

1. 构建阶段对输出的 local-service/domain/shared JavaScript 内容及相对文件名计算 SHA-256，写入该产物的 build-identity.js。摘要排除身份文件自身，不读取 Git HEAD。源码身份为 `unbuilt`；生产 main 拒绝直接使用未标记产物。相同内容可得相同 buildId，内容变化产生不同 buildId。
2. 每次 startLocalRuntime 生成 runtimeId、runtimeStartedAt，记录安全 provider/model、由 provider 实际 timeout 常量公开的只读 timeoutMs、现有 prompt/schema version。启动控制台输出 BJR_RUNTIME_IDENTITY；每份 attempt 日志首条和 summary 都保存该身份快照。运行中的进程持有已加载的身份，后续 rebuild 不会把旧进程伪装成新构建。
3. localhost 完成安全检查、请求校验和配置检查后，先生成随机 UUID 并创建 evidence。只有初始日志成功写入并 fsync 后，才发出 request_accepted 并调用 analysis writer。ordinal 仍是 process-local 辅助字段，不充当 attemptId。未通过前置检查的请求不算正式接受。
4. AsyncLocalStorage 关联 analysis_http、lave8、analysis；provider generate 入口绑定诊断上下文，使 timer/transport 回调保持归属。每次发出事件都使用本机 Date.toISOString()，不是 provider 时间或可信外部时钟。
5. 在本地数据库所在目录下的 safe-diagnostics 子目录，使用 `safe-diagnostics-attempt-<UUID>.log` 和 `safe-evidence-attempt-<UUID>.json`。日志以 wx 独占创建，逐条同步追加并 fsync。summary 使用临时文件写入/fsync/rename 替换；事件先写日志，再更新 summary，再调用控制台 observer。
6. Side Panel reload 将旧 analysis 错误转换为 historical_analysis；旧 pending analysis 转换为历史完成状态未知，明确本次打开未发起新请求。当前显式操作显示正在处理本次请求，不声称已经被 localhost 接受，也不自动触发分析。
7. 用 fake transport、fake provider、临时 SQLite 和本地 HTTP 测试验证完整链路，再运行既有 CI 检查。提交后等待外部审阅，停止本轮。

## 失败语义

- 无法创建或 fsync 初始日志：前置条件失败，localhost 返回通用错误，不正式接受、不进入 provider；不重试创建分析、不 fallback。
- 初始日志已落盘后的追加失败：保留此前完整记录，停止追加该日志，避免半条记录与下一条拼接；仍尝试安全 summary，标记 diagnosticPersistence=write_failed。分析继续遵循原有零重试行为。
- summary 更新失败：原日志独立保留。上一次完整 JSON 或安全临时文件可能存在；最终 summary 不一定完整。日志是首要证据，不能把缺少 finishedAt 当作失败或成功。
- provider、validator、source_changed、stored_analysis_invalid、SQLite failure 都不删除日志。浏览器连接结束不取消服务端证据写入。进程异常前已完成 fsync 的记录仍在磁盘；突然终止时可能没有 result，summary 保持 in_progress。这不承诺磁盘硬件损坏或操作系统断电后的恢复。
- 同状态缓存复用也会有新的 localhost attempt，但可能没有 provider start；responseAccepted=false 不意味着 provider 调用失败。

## 安全字段

summary 仅含 attemptId、startedAt、可用的 finishedAt、buildId、runtimeId、runtimeStartedAt、provider、model、providerTimeoutMs、promptVersion、outputSchemaVersion、localhostOrdinal、固定 outcome/stage/providerStage、responseAccepted、固定 validationReason、成功时的 analysisId、diagnosticLog 和固定 diagnosticPersistence 状态。

browserDeadlineMs/localDeadlineMs 为 null：服务端不知道实际客户端构建与 deadline，本地 HTTP 层未配置独立 analysis deadline，不从当前浏览器源码常量猜测实际请求期限。

provider/model 采用本地允许值，未知自定义 identity 输出 unknown。日志只接收内部固定安全事件类型，不传 request、Error、JD、prompt 或模型正文。现有 Lave8 分类器继续生成固定错误/结构类别。不得导出 secret、Authorization、Cookie、Session、岗位/公司身份、本机绝对路径或任意 provider 错误文本。

prompt、output schema、semantic validator、provider request body、model allowlist、timeout 数值、retry/fallback 和岗位分析语义均不改变。
