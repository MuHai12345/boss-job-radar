# Phase 6 / Batch UX-1 — Side Panel Workspace External Verification

Date: 2026-09-08

Formal outcome: **PASS**

This UX batch does not change the Capability Matrix count. Capability 12 remains `IN_PROGRESS`, and Phase 6 remains `IN PROGRESS` until the representative real Lave8 evaluation succeeds.

## Product lineage

- Approved pre-UX base: `c89b9e9ecbb7ec756bc346e3dac278c4aad8b56c`
- Initial Side Panel implementation: `2a994fcc5f86f8cde2518a5a7c5eb46c205ca5a8`
- Narrow repair: `a270abd90363807f5139b0f698ec7c55a5457c27`
- External verification/test head: `8305d0afc85243a3b281d2ccc32693c2f6247bc5`
- Final engineering CI run: `34214039548`

## Verified product behavior

The extension now uses a native browser Side Panel as its primary workspace. The toolbar popup is a small launcher only. The Side Panel keeps the last display snapshot when the user clicks the page, changes tabs, navigates away, closes the panel, or returns to an unsupported page.

The workspace provides human-readable cards for job summaries, parse/save actions, explicit job-link checking, explicit AI analysis, a recent-progress section, and a secondary collapsed minimized JSON view. Raw extraction payloads and full JD are not persisted in the browser UI snapshot.

The repair restored the already-verified manual job-link check in the new Side Panel and fixed normal BOSS detail URLs containing query/hash navigation metadata. AI analysis and link checking canonicalize the active detail URL first; query/hash values such as `securityId` / `ka` are not forwarded to localhost and are not persisted in the UI snapshot.

## Browser storage boundary

The Side Panel snapshot is reconstructed through an allowlist on read/write. Browser-side state contains only display-layer summaries/status and canonical job identities. It does not persist API keys, Authorization values, Cookie/Session, bridge token, raw HTML, whole-page raw text, full JD, relay endpoint configuration, or BOSS query parameters.

## Extension permission / manifest verification

The approved MV3 permission set is now:

- `activeTab`
- `scripting`
- `storage`
- `tabs`
- `sidePanel`

Host permission remains only:

- `http://127.0.0.1:32123/*`

Chrome and Edge manifests both expose the popup launcher and native Side Panel. No `<all_urls>`, cookies permission, content script, background script, optional host permissions, or unscoped loopback host permission was added.

## External test migration

The former popup DOM/controller acceptance suites were retired because the old popup is no longer the live product workspace. External verification added Side Panel acceptance coverage for:

- native Side Panel workspace structure;
- popup launcher wiring;
- approved permissions;
- parameterized BOSS detail URL canonicalization before AI analysis;
- explicit link-check wiring;
- zero automatic link checks / AI calls during initialization;
- tab-change continuity without clearing previous results;
- minimized browser snapshot contract;
- browser secret/provider-config exclusion;
- JSON being secondary rather than the main UI.

Two unrelated opportunity tests had become clock-dependent as wall-clock time moved beyond their fixed fixture dates. External verification stabilized only their test clocks; no opportunity product code changed.

## Final engineering verification

GitHub Actions run `34214039548`:

- `npm ci`: PASS
- typecheck: PASS
- lint: PASS
- tests: PASS — **52 test files / 746 tests**
- Side Panel acceptance: **10 / 10 PASS**
- Chrome MV3 build: PASS
- Edge MV3 build: PASS
- local-service build: PASS
- manifest verification: PASS

Build output includes both `popup.html` and `sidepanel.html` for Chrome and Edge.

## Remaining Phase 6 work

The earlier representative real Lave8 attempt did not persist an analysis and returned only the generic `502 analysis_failed` boundary. Current evidence does not identify whether the failure was transport, relay request compatibility, response contract, structured output validation, source-state validation, or persistence.

Before a second real paid relay attempt, the previously approved narrow Batch 5B repair must add secret-safe fixed-stage diagnostics while preserving generic browser/HTTP errors, zero automatic retries, and zero fallback. No second real Lave8 request is approved until that repair receives external review and CI PASS.

Capability 12 therefore remains `IN_PROGRESS`.
