# Phase 6 / Batch 5B — Safe Lave8 Message Hints External Verification

Date: 2026-09-09

Formal outcome: **PASS**

## Scope

This verification covers the narrow relay-error diagnostic repair added after the representative real Lave8 evaluation returned HTTP 400 with only fixed `unknown/other/absent` categories.

The goal was to inspect at most a bounded prefix of `error.message` locally and emit only fixed, secret-safe diagnostic hints without reflecting any upstream text or changing provider behavior.

## Product commits

- Initial safe message hint implementation: `325fc9e086be11f7627af49c80e5ec897a3ab35c`
- Token-boundary false-positive repair: `7f1c4a726f530c1ab3658bcc63cb6eadf508390f`

The token-boundary repair modified only:

- `src/domain/llm/lave8-structured-llm-diagnostics.ts`

No provider request shape, endpoint, model, timeout, retry/fallback behavior, Side Panel code, database code, localhost HTTP contract, migrations, or dependencies changed.

## External verification changes

External ChatGPT added/updated only tests:

- `4bbd4acdd152b0b925fb39c96e08d2c63123dd90` — initial safe message-hint test coverage
- `9cac979843f0ceda024c7c7ffac6827800d7b9d8` — update legacy diagnostic summary baselines for `messageHints`
- `41ca3d6f971e06395d69969bfe55917afc43ab10` — harden token-boundary false-positive tests

## Verified behavior

The final implementation was verified to:

- inspect no more than the first 2048 characters of an upstream error message;
- read only a plain-object own data property and never invoke message accessors/getters;
- emit only fixed local enum values through `messageHints`;
- return `[]` for unavailable/non-string/accessor-backed messages;
- return `['other']` for unrecognized message text;
- emit at most 16 unique hints in deterministic rule order;
- recognize representative compatibility hints for model, model-not-found, model-unsupported, reasoning/reasoning-effort, JSON schema, Responses API, Chat Completions, authentication, permission, rate limit, and quota;
- preserve path-style matching such as `reasoning.effort`, `max_output_tokens`, `text.format`, `json_schema`, `/v1/responses`, and `/v1/chat/completions`;
- avoid false positives where ordinary words merely contain parameter names, including `upstream` → not `stream`, `restored` → not `store`, and `modeling` → not `model`;
- require genuine model tokens for `model_not_found` / `model_unsupported` compound hints;
- never emit raw provider error text, arbitrary substrings, provider wording, external model names, URLs, IDs, prompts, JD, API keys, Authorization values, Cookies, Sessions, database paths, or environment dumps;
- leave provider result semantics, request shape, endpoint, model, timeout, zero-retry, and zero-fallback behavior unchanged.

## CI

Final verified head:

`41ca3d6f971e06395d69969bfe55917afc43ab10`

GitHub Actions run:

`34307575857`

Result:

- Typecheck: PASS
- Lint: PASS
- Tests: **57 test files / 776 tests PASS**
- `tests/lave8-diagnostics.test.ts`: 11/11 PASS
- `tests/lave8-message-hints.test.ts`: 7/7 PASS
- `tests/lave8-structured-llm-provider.test.ts`: 14/14 PASS
- `tests/structured-llm-runtime-diagnostics.test.ts`: 8/8 PASS
- `tests/analysis-http-diagnostics.test.ts`: 3/3 PASS
- `tests/structured-llm-local-trigger.test.ts`: 17/17 PASS
- Chrome MV3 build: PASS
- Edge MV3 build: PASS
- Local-service build: PASS
- Manifest verification: PASS

## Capability status

Capability 12 remains **IN_PROGRESS**.

This diagnostics repair does not itself prove Lave8 Responses/Structured Outputs compatibility and does not provide a successful persisted representative real model result.

The next approved step is one new explicit real Lave8 evaluation attempt with:

- one user click maximum;
- `analysis_http/request_accepted` and `lave8/request_started` counts compared;
- zero automatic retry/fallback;
- the new fixed `messageHints` captured if another non-2xx response occurs;
- no additional request if that attempt fails.

Capability 12 may move to `VERIFIED` only after a representative real result is successfully persisted and externally reviewed for grounding and business usefulness.
