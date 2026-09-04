# Phase 4 / Batch 3 工作日志：手动 extension → localhost save bridge

- 日期：2026-09-03
- 原始 base commit：`da6d9d2916a7014eca77e1c91eb7af5aed584061`
- 开始分支：`master`
- 中断恢复：工作区位于原始 base commit，未发现上一轮未提交改动或 Batch 3 commit，因此从仓库真实状态继续实现
- 状态：`implementation_complete_awaiting_external_review`

## 本批新增能力

- popup 新增独立“保存当前岗位数据到本地”按钮；原有解析按钮继续只解析和显示 JSON。
- 保存点击时重新取得活动标签页并重新执行 structured extraction，随后由纯 mapping 转为共享 `JobObservationInput[]`。
- 空结果不访问 localhost；搜索页只保存 extraction 已返回的至多 100 条。
- extension context 对固定 `http://127.0.0.1:32123` 执行 session handshake 和 observation POST；页面 injected script 不访问 localhost。
- 每个请求使用 5 秒 timeout，不重试；session token 不持久化、不输出；响应和错误均经运行时验证与稳定 UI 文案收敛。
- Chrome / Edge MV3 host permission 只增加 `http://127.0.0.1:32123/*`。

## 数据与范围边界

- mapping 保留 parser 输出的顺序、重复、`null`、空字符串、原始文本、missing fields 和 warning 合并顺序。
- SQLite schema version 仍为 `1`，ingestion 仍为 append-only，不增加 identity 或 dedupe。
- 不发送 whole document、HTML、DOM diagnostics、Cookie、BOSS Session、storage、history、request headers 或其他 extension credential。
- 未实现自动采集、Job identity、dedupe、SearchRun、structured analysis 或 review UI。

## Developer verification

以下仅为 Codex developer verification，不代表外部验收结论：

- `npx vitest run tests/structured-extraction-to-observations.test.ts tests/local-service-client.test.ts tests/popup-controller.test.ts tests/observation-repository.test.ts tests/observation-ingestion.test.ts`：`PASS`，5 files / 103 tests。
- `npx vitest run tests/local-service-client.test.ts`：`PASS`，1 file / 21 tests（修正 lint 后复核）。
- `npm run typecheck`：`PASS`。
- `npm run lint`：`PASS`。
- `npm run build:local`：`PASS`。
- `npm run build`：`PASS`，Chrome MV3 build。
- `npm run build:edge`：`PASS`，Edge MV3 build。
- `npm run verify:manifests`：`PASS`，Chrome 与 Edge 均精确包含 `http://127.0.0.1:32123/*`，且没有其他 localhost 或 `<all_urls>` 权限。
- `git diff --check`：`PASS`。

## 外部状态

Phase 4 / Batch 1 与 Batch 2：`PASS`。Phase 4 / Batch 3：实现完成，等待外部网页版 ChatGPT 独立 code review 与 acceptance testing。Phase 4：`IN PROGRESS / NOT YET PASSED`。
