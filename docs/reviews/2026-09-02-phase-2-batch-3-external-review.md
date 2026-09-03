# Phase 2 / Batch 3 外部审阅记录

- 审阅者：外部网页版 ChatGPT
- 审阅 commit：`a91d1a331ca7f267fd10757e2de37f002b50f5ec`
- 初次结论：`CHANGES_REQUIRED`
- 问题统计：Critical 0、High 0、Medium 2、Low 0
- 当前整改状态：`PASS（external re-review complete）`

## Medium 1：verified detail rawDetailText 作用域过宽

初次实现中，`parseVerifiedBossJobDetail(document, ...)` 沿用 generic parser 的 `readRootText(root)`，会读取整个 `document.documentElement.textContent`。这可能把导航、用户相关页面文本、竞争力分析、安全提示、推荐岗位和其他非当前岗位内容写入 `rawDetailText`，且整页读取不应用结构化 JD 的节点排除规则。

整改后，verified wrapper 强制将 raw detail scope 限定为 `.job-sec-text`，并通过 `domElementToStructuredText` 提取。导航、竞争力分析、安全提示、推荐岗位以及 `SCRIPT`、`STYLE`、`NOSCRIPT`、`TEMPLATE` 均不会进入 verified `rawDetailText`。generic/synthetic parser 未指定 scope 时继续保持原有 root text 行为。

## Medium 2：verified search card links 可能保存 query/hash

初次实现中，`parseVerifiedBossJobCards` 直接沿用 generic parser 的 raw-link contract，`jobHrefRaw` 和 `jobUrl` 可能保留 security/tracking query 与 hash。

整改后，仅 verified card 路径启用严格 canonical URL policy：要求 HTTP/HTTPS、合法 BOSS hostname、无 URL userinfo、单层 `/job_detail/*.html` pathname，并删除 query/hash。合法链接的 `jobHrefRaw` 和 `jobUrl` 都是安全 absolute canonical URL；非法协议、外部 hostname、userinfo 或非法 pathname 不作为有效 verified job URL，也不保留原始 href。generic/synthetic parser 行为保持兼容。

以上整改已由后续外部复审确认通过；该结论不表示项目已进入下一批。

## Privacy/scope repair re-review

Repair commit：`bf66591c66e9854b6415ad2e9787bd5b4257450e`

外部网页版 ChatGPT 最终结论：`PASS`

问题统计：Critical 0、High 0、Medium 0、Low 0。

确认：

- Medium 1：`PASS`。verified detail `rawDetailText` 已限定于 `.job-sec-text`，不会读取整个 `Document`；并通过 `domElementToStructuredText` 排除 `SCRIPT`、`STYLE`、`NOSCRIPT`、`TEMPLATE`。导航、竞争力分析、安全提示和推荐岗位不会进入 verified raw detail。
- Medium 2：`PASS`。verified search card 的 `jobHrefRaw` 和 `jobUrl` 均采用安全 canonical BOSS detail URL；query/hash 不保存，userinfo、外部 hostname、非 HTTP(S) 和非 `job_detail` pathname 均拒绝。generic/synthetic parser 行为保持兼容。

这是外部网页版 ChatGPT 已作出的复审结论。Codex 只负责记录。
