# Phase 4 / Batch 5：Import provenance 与幂等导入

- 批次日期：2026-09-04；额度中断后的恢复与开发验证：2026-09-05。
- 分支：`master`；原始 base 与恢复时 HEAD：`06180775870ce0a36b0535e4a234addf381a4d88`。
- 恢复情况：B。HEAD 仍是 Batch 4 commit，working tree 有 19 个已跟踪文件的未提交修改，以及 ADR-0011、实现计划、import DTO/repository/fingerprint 和测试等未跟踪文件；暂存区为空，无新 Batch 5 commit。
- 已执行恢复检查：`git status --short`、`git diff --stat`、`git diff`、`git diff --cached`、`git log -8 --oneline`、`git rev-parse HEAD`，随后分文件核对 diff 与新增文件。
- 保留已有正确实现，没有 reset、clean、覆盖重做或删除既有工作。
- 状态：`implementation_complete_awaiting_external_review`。Phase 4 / Batch 1–4 的 `PASS` 来自外部结论；Phase 4 仍为 `IN PROGRESS / NOT YET PASSED`。

## 实现事实

- schema 3 增加 `import_runs`、`search_runs` 与 nullable observation `import_run_id` 外键/索引。使用 `ALTER TABLE ADD COLUMN` 保留旧表与 Job links，历史 provenance 维持 NULL，不推测旧 runs。
- bridge protocol 2 使用 `clientImportId + source + observations`。source 直接来自 StructuredPageExtractionResult；builder 复用现有 mapper，不解析 DOM 或 URL query，不 trim/sort/dedupe。unsupported 不保存，空结果不访问 localhost。
- ImportRepository 在 SQLite immediate transaction 中校验 DTO/source 一致性、计算固定字段 SHA-256、检查 replay/conflict、创建 provenance、append observations 并完成 Job resolve/link/lifecycle。有限 repository 注入 HTTP，handler 不接触 raw SQLite。
- 相同 ID/相同 payload 返回按 id 排序的原 observation IDs，数据库重开后仍有效。相同 ID/不同 payload 返回通用 `409 import_conflict`，无写入或敏感内容泄露。新点击新 UUID、新 ImportRun 和新 observations；canonical Job 仍复用，不做 observation dedupe。
- 搜索 import 恰有一个 SearchRun，保留 matched count、saved count 和 warning 顺序。143 matched / 100 saved 保留各自真实数值及 `card_limit_reached`。detail 的 matched count 为 NULL，不创建 SearchRun。
- SearchRun → ImportRun → observations → job_id 可追溯本次 Jobs，无冗余 `job_search_runs`，不增加搜索词或 filters 字段。
- popup 使用 `crypto.randomUUID()`，ID 仅存在当前保存动作内存，不写 browser storage。POST body 仅序列化一次；POST 网络失败、成功响应 body 传输中断或 timeout 最多重试一次，同一 payload/UUID/token。
- session 与成功 POST 必须声明 application/json，可带 charset。错误 Content-Type、完整无效 JSON、400/403/409/413/500 均不重试。timeout 覆盖成功响应 body 接收。
- 既有 127.0.0.1、Host、Origin、ephemeral token、application/json、identity encoding、1 MiB actual body limit 和无 permissive CORS 边界保持不变。GET /health 不变；成功响应仅为 `{ "ids": [...] }`。
- 新增依赖：无。未修改 package manifest/lock、selectors、DOM parser、权限或分析/UI 能力。

## 恢复时发现并修复

1. typecheck 暴露 source 在数组回调中的类型收窄丢失。抽取共用 runtime validator，以局部 const source 保持收窄；import 事务内也执行验证和 fingerprint。
2. 既有 retry 仅覆盖 fetch headers 前失败，成功 body 断流会错误归为 invalid_response，且 body 不受 timeout 保护。新增断流、body timeout 和完整 malformed JSON 测试；前两项先失败，局部修复后通过。
3. 新增 repository source 不一致复现先失败，事务内 validation 补齐后通过。
4. lint 暴露两个测试替身的无用参数，删除无用参数/type imports 后通过。
5. build:local 暴露 shared DTO type import 缺少 Node ESM `.js` 后缀，补齐后构建通过。
6. 补充 file-backed close/reopen replay、对象 key 顺序不影响 fingerprint、payload 改动改变 fingerprint、真实 HTTP persisted conflict，以及 ImportRun 之后/search insert/observation insert/Job update 的 rollback 验证。已有 Job 事实、lifecycle、新 Jobs、observations 和 runs 全部按事务恢复。

## Developer verification

以下是本批配套开发验证，不是 external acceptance；未运行 full npm test、Phase 2 DOM fixtures 或整套旧 ingestion adversarial tests。

本次执行环境：Node.js `v24.11.1`，npm `11.6.2`。

```powershell
npx vitest run tests/import-repository.test.ts tests/database-migrations.test.ts tests/local-database.test.ts tests/observation-repository.test.ts tests/local-runtime.test.ts tests/local-service-client.test.ts tests/structured-extraction-to-observations.test.ts tests/popup-controller.test.ts
```

结果：8 files / 107 tests 通过。

```powershell
npx vitest run tests/observation-ingestion.test.ts -t 'original IDs|persisted ID|invalid DTO shape|stable 409|stable health|high-entropy|valid observation|valid Chrome extension|missing or wrong bridge token|wrong Host without'
```

结果：21 tests 通过，27 tests 未选中。覆盖 protocol 2、UUID/DTO/source、真实 replay/conflict、health 与代表性原安全中间件接线。

```powershell
npx vitest run tests/local-runtime.test.ts tests/local-service-server.test.ts
```

结果：2 files / 12 tests 通过，其中 6 个 runtime tests 与首组重叠；上述共 134 个不同测试。

| 命令 | 最终结果 |
| --- | --- |
| `npm run typecheck` | exit 0 |
| `npm run lint` | exit 0 |
| `npm run build:local` | exit 0 |
| `npm run build` | exit 0，Chrome MV3 |
| `npm run build:edge` | exit 0，Edge MV3 |
| `npm run verify:manifests` | exit 0，activeTab + scripting + 固定 loopback permission |
| `git diff --check` | 无 whitespace error；Git 提示 Windows LF/CRLF 转换 |

额外范围内静态 developer code review 未发现阻塞提交的实现问题；复核没有运行测试、没有给出外部验收结论。

## 文档、提交与边界

README、PROJECT_STATE、DATA_DICTIONARY、PRODUCT_CAPABILITY_MATRIX 和 ADR-0011 已同步实现事实。保留并补充中断前计划的恢复说明；原 checklist 不作为无法追溯的旧测试执行证据。

能力矩阵仍共 15 项：6 VERIFIED、1 IMPLEMENTED_AWAITING_REVIEW、8 NOT_STARTED。Job identity 的 VERIFIED 来自外部 Batch 4 结论；Batch 5 的 SearchRun/provenance/idempotency 等待外部审阅。deterministic job analysis、LLM、review UI、自动化浏览/保存/投递均未实现。

预定本批提交信息：`feat: add import provenance and idempotency`，目标 `origin/master`。远端检查时 master 仍为原始 base。默认 Git proxy 的本机端点不可用，单次使用 `git -c http.proxy= -c https.proxy= ...` 可直接访问远端；未修改持久 Git 或系统代理配置。实际提交 SHA、push 与最终工作区状态以本轮最终报告为准。

已知实现问题：当前针对本批的开发验证未发现未修复问题。未执行真实浏览器人工验收；外部审阅：PENDING。不开始下一批。
