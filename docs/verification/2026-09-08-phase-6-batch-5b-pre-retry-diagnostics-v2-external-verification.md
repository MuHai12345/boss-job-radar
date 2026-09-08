# Phase 6 / Batch 5B Pre-Retry Diagnostics V2 — External Verification

- 日期：2026-09-08
- Formal outcome：`PASS`
- 对应能力：Capability 12 — structured LLM analysis（仍为 `IN_PROGRESS`）
- Codex 产品实现 commit：`0a0c357569947fe8c03aa1570344a4656df7f15a`
- 产品实现 base：`b7da9bd9f29f575cbfda682e5303e182c229c7bf`
- 外部最终测试 head：`3738ef14df85a66f4dfbbffee3ca6206d207b884`
- 最终 CI run：`34219631874`
- 本轮真实 Lave8 请求：`ZERO`

## 背景

第二次真实 Batch 5B 尝试暴露两个仍会阻碍安全复测的问题：

1. 单次真实评测授权窗口中观察到 3 个 `lave8/request_started`，但当时无法判断对应多少个已经通过 localhost 安全边界的 `/structured-llm-analyses` 请求；现有 browser client/provider 代码本身均保持 zero retry，因此不能把 3 次 provider request 直接归因于自动重试，也不能归责用户。
2. 首次 HTTP 400 的 `requestParameter` 仍为 `unknown`，原 diagnostic allowlist 没覆盖实际发送的 `model`、`reasoning.effort`、`text.format.*` 等路径，无法安全判断 relay 是否明确拒绝某个已发送字段。

因此本轮不是兼容性修改，也没有再次进行真实付费请求；目标仅是让下一次真实评测能安全回答“有多少个 accepted localhost analysis request”和“400 是否携带可映射的固定错误类别/参数”。

## 产品审阅

外部审阅 `0a0c357569947fe8c03aa1570344a4656df7f15a`，相对批准 base 仅包含 1 个产品 commit，修改：

- `entrypoints/sidepanel/snapshot.ts`
- `src/domain/llm/lave8-structured-llm-diagnostics.ts`
- `src/domain/llm/lave8-structured-llm-provider.ts`
- `src/local-service/main.ts`
- `src/local-service/runtime.ts`
- `src/local-service/server.ts`

未修改数据库 schema/migration、provider endpoint/model/request shape、timeout、retry/fallback、Side Panel 主交互或薪资/权限问题。

### analysis_http diagnostics

`/structured-llm-analyses` 在 Host、Origin、bridge token、media type、body、exact analysis request 验证全部通过，且 provider 已配置后，才分配 process-local positive ordinal 并 emit：

- `analysis_http/request_accepted`
- 完成后同 ordinal 的 `analysis_http/result`

`result.outcome` 只允许：

- `ok`
- `job_not_found`
- `analysis_unavailable`
- `analysis_failed`

事件不包含 job URL、request body、token、headers、prompt、JD、provider body、error message、stack 或数据库信息。observer 抛错被吞掉，不改变 writer 或 HTTP contract。

### Lave8 non-2xx diagnostics

`requestParameter` allowlist 扩展到实际已发送的固定路径，包括：

- `model`
- `background`
- `store`
- `stream`
- `reasoning`
- `reasoning.effort`
- `max_output_tokens`
- `input`
- `text`
- `text.format`
- `text.format.type`
- `text.format.name`
- `text.format.strict`
- `text.format.schema`

其他任意字符串仍映射为 `unknown`，不会原样输出。

non-2xx error body 仍只做一次安全 JSON 读取，并只输出本地固定类别：

- body structure：`json_object_absent` / `error_object_absent` / `error_object_present`
- error type：`invalid_request` / `authentication` / `rate_limit` / `server` / `other` / `absent`
- error code：`invalid_api_key` / `model_not_found` / `unsupported_parameter` / `rate_limit` / `insufficient_quota` / `context_length` / `other` / `absent`

不输出第三方原始 `message`、`type`、`code`、`param` 或 response body。

### 成本提示

Side Panel 的通用 AI failure 文案保持“不自动重试”，并明确说明用户手动再次点击会开始新的分析尝试，可能再次发起远程请求并产生 API 费用；没有声称失败请求一定收费。

## 外部测试

原产品 commit 首次 CI `34219279131` 在 typecheck 阶段失败，原因是旧 `tests/local-service-server.test.ts` type baseline 尚未包含新增可选 diagnostic callback；这是测试基线过期，不是产品缺陷。

外部 ChatGPT 更新/新增测试：

- 更新 `tests/lave8-diagnostics.test.ts`
- 更新 `tests/local-service-server.test.ts`
- 新增 `tests/analysis-http-diagnostics.test.ts`
- 新增 `tests/sidepanel-analysis-cost-warning.test.ts`

重点覆盖：

- 新 request-parameter allowlist；
- arbitrary upstream param/type/code 不泄漏；
- fixed error structure/type/code 分类；
- message accessor 不被读取；
- non-JSON non-2xx 安全分类；
- accepted/result ordinal 配对；
- ok/not-found/unavailable/invalid-result/throw outcomes；
- invalid/unauthenticated/unconfigured request 不 emit accepted；
- diagnostic callback throw isolation；
- job URL/token/internal error 不进入 analysis_http events；
- Side Panel 手动重试成本提示。

## 最终工程验证

CI `34219631874`：

- `npm ci`：PASS
- typecheck：PASS
- lint：PASS
- tests：PASS — **56 test files / 769 tests**
- `tests/lave8-diagnostics.test.ts`：**11 / 11 PASS**
- `tests/analysis-http-diagnostics.test.ts`：**3 / 3 PASS**
- `tests/structured-llm-runtime-diagnostics.test.ts`：**8 / 8 PASS**
- `tests/lave8-structured-llm-provider.test.ts`：**14 / 14 PASS**
- `tests/structured-llm-local-trigger.test.ts`：**17 / 17 PASS**
- `tests/sidepanel-analysis-cost-warning.test.ts`：**1 / 1 PASS**
- Chrome MV3 build：PASS
- Edge MV3 build：PASS
- local-service build：PASS
- manifest verification：PASS

## Phase Gate

`Phase 6 / Batch 5B pre-retry diagnostics V2 = PASS`。

这只批准下一次**单次、用户显式授权**的真实 Lave8 评测，不表示 Lave8 Responses/Structured Outputs 已兼容，也不表示 Capability 12 已验证。

因此：

- Capability 12：`IN_PROGRESS`
- Phase 6：`IN_PROGRESS`
- 核心能力矩阵：`12 / 15 VERIFIED`

下一次真实 Batch 5B 必须同时记录并比较：

- `analysis_http/request_accepted` count / ordinals
- `lave8/request_started` count

如果一次用户显式点击对应多于 1 个 accepted localhost request，先处理 browser/Side Panel 重复触发；如果只有 1 个 accepted localhost request 却出现多于 1 个 provider `request_started`，则处理 localhost/repository/provider 链路。任何失败均不得自动 retry。

如果 HTTP 400 再出现，只使用已验证固定诊断字段决定是否存在明确 relay compatibility evidence；没有证据时仍禁止盲删参数。
