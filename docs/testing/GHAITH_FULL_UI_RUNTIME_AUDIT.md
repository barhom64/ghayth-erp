# Ghayth ERP — Full UI Runtime Audit

_Last regenerated: 2026-06-17_

End-to-end live UI sweep of the running stack (Postgres + api-server + ghayth-erp
web behind the `localhost:80` shared proxy). Every frontend route was walked by
the **Runtime Audit** workflow across 5 axes (render / data fetch / primary CTA /
navigation / runtime smoke); every candidate failure was then **re-verified by
live curl** against the authenticated API (login via `localhost:80/api/auth/login`
with the `X-E2E-Test:1` bypass header, cookie jar) before classification.

## Honesty contract

No finding is reclassified `FAIL → PASS` without fresh re-run evidence captured in
this document. Each fixed bug shows the **before** (failing) and **after** (passing)
HTTP status from the same live endpoint.

## Method

- Auth: `POST /api/auth/login` (HttpOnly `erp_access` cookie; no Bearer token).
- Scope: requests carry `?companyIds=…&branchIds=…` (multi-filter engine).
- Triage rule: a candidate is a **REAL** bug only if the live endpoint reproduces
  the failure AND the corrected form succeeds. Otherwise it is a false positive.
- Fix rule: only **isolated, safe** fixes are applied; each ships with a CI guard
  so the bug class cannot silently return. Broader/architectural findings are
  documented as **document-only** (not fixed in this pass).

---

## REAL bugs found, fixed, and guarded

### #1 — `/hr/stats` 404: scope suffix glued to a bare path

- **Symptom (runtime audit):** request to `/api/hr/stats&companyIds=1&branchIds=1`
  → **404**. The HR dashboard stat cards never loaded.
- **Root cause:** `artifacts/ghayth-erp/src/pages/hr.tsx` built the URL as
  `` `/hr/stats${scopeSuffix}` `` while `scopeSuffix` was defined with a leading
  `&` (`scopeQueryString ? `&…` : ""`). With no `?` to open the query string the
  `&companyIds=…` became part of the **path**, so the router 404'd.
- **Fix:** build the URL as `` `/hr/stats?${scopeQueryString || ""}` `` so a `?`
  always opens the query string.
- **Evidence:**
  - before: `GET /api/hr/stats&companyIds=1&branchIds=1` → `404`
  - after:  `GET /api/hr/stats?companyIds=1&branchIds=1` → `200`
- **Guard:** `check:scope-suffix-glue` (`scripts/src/check-scope-suffix-glue.mjs`)
  — separator-aware static scan: a `&`-prefixed `scopeSuffix` must be appended
  after an existing `?`; a `?`-prefixed one must be appended to a bare path.
  Pure-logic fixtures in `check-scope-suffix-glue.test.mjs`.
  - This guard **also surfaced 4 look-alikes** (`my-space`, `operations-center`,
    `properties-contracts`, `properties-payments`) that were **verified
    NON-bugs** — they define `scopeSuffix` with a `?` separator, so appending to
    a bare path is correct (live curl confirms `?`-form → 200). The guard was
    hardened to read the in-scope separator and clears them correctly.

### #5 — `/finance/cost-centers/ranking` 422: static route shadowed by `:id`

- **Symptom (runtime audit):** request to `/api/finance/cost-centers/ranking`
  → **422 «معرف غير صالح: id»**. The cost-center ranking view never loaded.
- **Root cause:** in `artifacts/api-server/src/routes/finance-cost-centers.ts`
  the `GET /cost-centers/:id` handler was registered **before**
  `GET /cost-centers/ranking`. Express matches in registration order, so
  `ranking` was captured as `:id="ranking"`, parsed as a numeric id, and 422'd.
- **Fix:** relocate the `/cost-centers/ranking` handler **above**
  `/cost-centers/:id`.
- **Evidence:**
  - before: `GET /api/finance/cost-centers/ranking?…` → `422` («معرف غير صالح: id»)
  - after:  `GET /api/finance/cost-centers/ranking?…` → `200`
  - regression check: `/cost-centers/:id` still resolves — `/1`, `/999999` →
    `404` (proper not-found, not a crash); `/tree` → `200`.
- **Guard:** `check:route-shadowing` (`scripts/src/check-route-shadowing.mjs`)
  — static scan that flags any literal route registered after a `:param` route
  that would capture it (Express order semantics). 1488 routes scanned, clean.
  Pure-logic fixtures in `check-route-shadowing.test.mjs`; baseline allowlist at
  `scripts/route-shadowing-allowlist.txt` (currently empty — no legacy shadows).

---

## Document-only findings (NOT fixed this pass — not isolated-safe)

These are real but require broader/backend work beyond an isolated safe fix, so
they are recorded here rather than changed in this PR.

### #2 — WPS credentials settings: double `/api/api` prefix + missing endpoint

- `artifacts/ghayth-erp/src/pages/settings.tsx` issues requests with a doubled
  `/api/api/…` prefix (the page prepends `/api` to an already-prefixed path).
- Backend only exposes a `/:bankCode` **stub** in `wiring-stubs.ts`; there is no
  collection endpoint for WPS credentials.
- **Why deferred:** needs a real backend endpoint + a client-prefix correction;
  not a one-line isolated fix.

### #3 — Notification suppressions page is dead

- `/api/notification-engine/suppressions` and `/summary` → **404** (endpoints
  absent). The `notification-suppressions.tsx` page cannot load.
- **Why deferred:** requires implementing the suppressions backend feature.

### #4 — RBAC v2 grants: transient `/roles/0/grants` 422

- `rbac-v2-tab.tsx` gates its grants query on `!!selectedRoleId`, but the audit
  recorded one hit to `/roles/0/grants` (server 422s on id `0`). The page works
  in normal use; this is a minor pre-selection race.
- **Why deferred:** cosmetic guard-clause tightening, low impact; bundling it
  risks scope-creep on this PR.

---

## Other suite results

- **Guard suite (`pnpm run guard`):** static + DB-gated steps green (triaged).
- **Print PDF audit:** PASS (12/12 entity × mode).
- **E2E Playwright:** not run in this pass — the suite boots its own stack on
  `localhost:80` and conflicts with the already-running dev stack. Deferred.

## Guards added by this audit

| Guard | Script | Catches |
|---|---|---|
| `check:route-shadowing` | `scripts/src/check-route-shadowing.mjs` | a static route made unreachable by an earlier `:param` route (the #5 class) |
| `check:scope-suffix-glue` | `scripts/src/check-scope-suffix-glue.mjs` | `scopeSuffix` concatenated with the wrong query separator (the #1 class) |

Both are OFFLINE source scans wired into `scripts/guard.sh` (and `package.json`
`check:*` scripts), each with a sibling `*.test.mjs` of pure-logic fixtures that
runs in the guard's vitest step and gates CI.
