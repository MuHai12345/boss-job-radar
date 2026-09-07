# Phase 5 / Batch 3 External Verification

Date: 2026-09-07

## Verdict

`PASS`

Capability 10 — recruiter activity / platform freshness / local observation recency / job link status — is externally verified.

## Product implementation reviewed

- Initial implementation: `3f04bb40ce14e0e1b106e7b311a03f1c31bc3b98`
- Status handling repair: `34f108ae7b281597d2291d9deacabef8ec112369`
- Lint-only repair: `c40528526610d764d1c5987852124d2d2fcc7447`

The final lint repair changed only the unnecessary `/` escape in the login/challenge regular expression and did not change product behavior.

## External automated verification

External ChatGPT synchronized the stale schema v5 test baseline to schema v6, added Batch 3-specific tests, and established GitHub Actions CI. Codex did not write or run these tests.

Final verified test head:

`1d6ed4405c53eb55318541a5e6ed0d2f3693d78b`

GitHub Actions run:

`34124021524`

Results:

- `npm ci`: PASS
- `npm run typecheck`: PASS
- `npm run lint`: PASS
- `npm test`: PASS — 43 test files, 634 tests passed
- `npm run build`: PASS
- `npm run build:edge`: PASS
- `npm run build:local`: PASS
- `npm run verify:manifests`: PASS

## Batch 3 coverage

Automated verification covers at least:

- schema v6 migration, constraints and future-version fail-closed behavior;
- recruiter activity deterministic parsing;
- platform freshness deterministic parsing;
- local observation rolling recency bands;
- source selection and older-source warnings;
- canonical job detail URL validation;
- manual link-check request validation;
- automatic saved-detail `available` evidence and idempotent import replay;
- append-only manual link history and deterministic current-link ordering;
- newer `available` evidence superseding an older explicitly-unavailable observation in the current assessment without deleting history;
- `/job-link-checks` protected localhost route and generic errors;
- link-check client fresh-session-per-call and no POST retry;
- navigation, unstable document, challenge and scripting failure fail-closed behavior;
- popup active-tab disappearance/lookup failure regression and in-flight concurrency lock;
- DOM probe exact unavailable markers, inline text composition, hidden-node exclusion, challenge/login/iframe fail-closed handling, and long-JD false-positive prevention;
- full pre-existing regression suite plus Chrome/Edge/local builds and manifest verification.

## Real BOSS browser verification

User-reported real logged-in BOSS job-detail verification:

- link-status action visible on the current supported job detail page: PASS
- normal job classified as `available`: PASS
- result persisted through the local-service path: PASS

The following real-world samples were not naturally available during this review:

- real `explicitly_unavailable` BOSS job page: `DEFERRED`
- real CAPTCHA/login/security-challenge page producing `unknown`: `DEFERRED`

These are not claimed as real-browser PASS. The user is not required to deliberately trigger risk controls or search for an expired sample. Their fail-closed behavior is covered by automated tests and can receive supplemental real-browser verification later if a natural sample appears.

## Safety / product-boundary review

No automatic application, greeting, chat, private BOSS API use, Cookie/Session export, CAPTCHA bypass, fingerprint spoofing, unattended browsing, auto-scroll, or auto-pagination was introduced.

No low-priority or unavailable job is silently deleted by this capability; status is recorded as a separate, explainable axis.

## Final conclusion

`Phase 5 / Batch 3 = PASS`

Capability matrix after this verdict: `11 / 15 VERIFIED`.

Next approved implementation target: Phase 5 / Batch 4 — Capability 11 (growth value / career-switch value / risks / priority / interview questions), still deterministic and without LLM.
