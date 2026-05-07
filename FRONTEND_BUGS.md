# Frontend Bugs — Ghayth ERP Test Matrix (2026-05-07)

Triage of failures and anomalies surfaced by the 369-route × 5-axis frontend test matrix. See FRONTEND_TEST_MATRIX.md for raw per-route results.

## Summary

| Severity | Count | Status |
|---|---:|---|
| Critical | 10 | ✅ All fixed |
| High | 2 | ✅ Fixed (C11 in #156, C12 in #157) |
| Medium | 14 | ✅ Closed — 13 false-positive (probe regex), 1 intentional read-only |
| Resolved-not-bug | 3 | Documented |

> Critical count grew from 5 → 10 after Task #139's deep CRUD round-trip
> harness exercised POST/PATCH/DELETE on 21 high-traffic entities. The 5 new
> entries (C6–C10) are all "DDL drift" bugs — route handlers reference
> columns or tables that never reached the live schema. All five are fixed
> by migration `120_task139_missing_columns.sql` + a one-line edit to
> `properties.ts`.

## Task #185 — Runtime audit findings (2026-05-07)

The honest headless-Chromium audit (`scripts/src/runtime-audit.cjs`, see `FRONTEND_RUNTIME_AUDIT.md`) flagged **69 A5 FAILs** across `/create` and `/edit` routes, all with the same `form=0/save=Y` shape: the page rendered a save button but the probe counted zero native `<input|select|textarea>` elements. Root cause is the probe, not (in most cases) the pages — shadcn `<Combobox>`, `<DatePicker>`, `<RichEditor>` and similar custom controls don't expose a native form element until first interaction. One genuine read-only page (`/finance/intercompany/consolidation/create`) is also in the list. These are listed as a single class rather than 69 separate entries; full per-route detail lives in `audit/runtime-audit-results.json`.

**Action**: Follow-up Task #186 will harden the probe (focus-then-count, longer hydration grace, treat shadcn data-attributes as form fields) and re-run. Until then this section is the source of truth, not the closed "Medium (14/14)" block below.

## Critical (10 / 10 fixed)

### C1 — CORS allowlist missing `http://localhost` (FIXED, previously pushed)

- **Symptom**: Every navigation in the SPA triggered POST `/api/intelligence/activity` → 500 with CORS rejection.
- **Root cause**: `artifacts/api-server/src/app.ts` allowlist did not include `http://localhost`, which is the Origin sent through the shared mTLS proxy.
- **Fix**: Added `http://localhost` to the CORS allowlist (lines 74–83). Already pushed to GitHub in a prior task.

### C2 — `GET /api/umrah/dashboard` → 500 `column reference "seasonId" is ambiguous` (FIXED)

- **Stack**: `artifacts/api-server/src/routes/umrah.ts:991` (the `umrah_agents LEFT JOIN umrah_pilgrims` query).
- **Root cause**: Single `seasonFilter` string with bare `"seasonId"` was reused across 4 queries; in the JOIN both tables expose the column.
- **Fix**: Introduced a parallel `seasonFilterP` bound to `p."seasonId"` and used it on the join clause (umrah.ts:972, 999).
- **Verified**: `GET /api/umrah/dashboard?seasonId=1` → 200 with empty pilgrim/penalty stats payload.

### C3 — `GET /api/finance/financial-requests` → 500 `column wr.workflowType / wr.requestedBy does not exist` (FIXED)

- **Stack**: `artifacts/api-server/src/routes/finance-vendors.ts:356`.
- **Root cause**: Query referenced columns `workflowType`, `requestedBy`, `entityType` that exist only in the (never-applied) migration 107 schema. The actual `workflow_requests` table created by migration 076 has `requestType`, `submittedBy`, `title`, `amount`.
- **Fix**: Rewrote SELECT to match the live schema (`requestType`, `title`, `amount`, JOIN on `submittedBy`).
- **Verified**: `GET /api/finance/financial-requests` → 200 `{data:[],total:0}`.

### C4 — `GET /api/finance/ap-aging` → 500 `column pr.deletedAt does not exist` (FIXED)

- **Stack**: `artifacts/api-server/src/routes/finance-algorithms.ts:217` (the `purchase_requests pr` UNION branch).
- **Root cause**: `purchase_requests` table has no `deletedAt` column (Postgres hint suggested `s2.deletedAt`).
- **Fix**: Removed the `AND pr."deletedAt" IS NULL` predicate from the `purchase_requests` branch only. Other branches keep their soft-delete filter.
- **Verified**: `GET /api/finance/ap-aging?asOfDate=2026-05-07` → 200 with empty aging buckets.

### C5 — `GET /api/finance/posting-failures` → 500 `relation "financial_posting_failures" does not exist` (FIXED)

- **Stack**: `artifacts/api-server/src/routes/finance-hardening.ts:1349`. Same table is also written by `businessHelpers.ts:435` and read by `systemGovernor.ts:73` and `admin.ts:1549` — all blocked by the missing table.
- **Root cause**: Table was referenced across 4 files but never created in any migration.
- **Fix**: New migration `artifacts/api-server/src/migrations/119_financial_posting_failures.sql` creates the table with `(companyId, sourceType, sourceId, error, resolved, resolvedAt, resolvedBy, createdAt)` plus an index on `(companyId, resolved, createdAt DESC)`. Applied automatically by `api-server` on startup.
- **Verified**: `GET /api/finance/posting-failures?resolved=false` → 200 `{data:[],total:0}`.

### C6 — `POST /api/finance/vendors` → 500 `column "category" of relation "suppliers" does not exist` (FIXED — Task #139)

- **Stack**: `artifacts/api-server/src/routes/finance-vendors.ts:68` (the supplier INSERT).
- **Root cause**: Route inserts a `category` column that the `suppliers` table never had (DDL drift).
- **Fix**: Added column via migration `120_task139_missing_columns.sql`: `ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS category varchar(80);`
- **Verified**: `POST /api/finance/vendors` with `{name,category,...}` → 201 with vendor body.

### C7 — `POST /api/finance/invoices` → 500 `column "costCenter" of relation "invoices" does not exist` (FIXED — Task #139)

- **Stack**: `artifacts/api-server/src/routes/finance-invoices.ts:~427` (the invoice INSERT).
- **Root cause**: Route inserts `"costCenter"` but the column was missing from `invoices`.
- **Fix**: Added column via migration `120_task139_missing_columns.sql`: `ALTER TABLE invoices ADD COLUMN IF NOT EXISTS "costCenter" varchar(80);`
- **Verified**: `POST /api/finance/invoices` round-trip (create → read → patch → delete) → all 200/201/204.

### C8 — `PATCH /api/properties/buildings/:id` → 500 `multiple assignments to same column "updatedAt"` (FIXED — Task #139)

- **Stack**: `artifacts/api-server/src/routes/properties.ts:2836` (the dynamic UPDATE).
- **Root cause**: `sets` already started with `"updatedAt"=NOW()`, and the handler re-appended `, "updatedAt"=NOW()` at the end → Postgres 42601.
- **Fix**: Removed the duplicate trailing append in `properties.ts:2836`. Single assignment retained at the head of `sets`.
- **Verified**: `PATCH /api/properties/buildings/:id {address:"…"}` → 200 with updated row.

### C9 — `PATCH /api/umrah/packages/:id` → 500 `column "updatedAt" of relation "umrah_packages" does not exist` (FIXED — Task #139)

- **Stack**: `artifacts/api-server/src/routes/umrah.ts:~564` (the package UPDATE).
- **Root cause**: PATCH handler sets `"updatedAt"=NOW()` but the table never had the column.
- **Fix**: Added column via migration `120_task139_missing_columns.sql`: `ALTER TABLE umrah_packages ADD COLUMN IF NOT EXISTS "updatedAt" timestamp with time zone DEFAULT now();`
- **Verified**: `PATCH /api/umrah/packages/:id` → 200; full CRUD round-trip green.

### C10 — `POST /api/employees` → 500 `column "attachments" of relation "employees" does not exist` (FIXED — Task #139)

- **Stack**: `artifacts/api-server/src/routes/employees.ts:387` (the employee INSERT inside `withTransaction`).
- **Root cause**: Route inserts `attachments` (jsonb) but the column was missing on `employees`.
- **Fix**: Added column via migration `120_task139_missing_columns.sql`: `ALTER TABLE employees ADD COLUMN IF NOT EXISTS attachments jsonb DEFAULT '[]'::jsonb;`
- **Verified**: `POST /api/employees` with full payload → 201; full CRUD round-trip green.

## High (2 / 2 fixed) — surfaced by Task #144 row-level uE/uD axes

### C11 — `DELETE /api/finance/accounts/:id` soft-deletes but row stays in list (FIXED — Task #156)

- **Symptom**: Deep-CRUD harness creates an account via the UI form, then clicks the row's "حذف" → confirms → `DELETE /api/finance/accounts/:id` returns 2xx and closes the dialog, **but the just-deleted row is still visible after 3 cache-busting refreshes** of `/finance/accounts`. The harness also reports that typing the unique value into the search box filters the list to 0 rows, suggesting the soft-deleted row is rendered only when no filter is active (consistent with the list query forgetting `WHERE deleted_at IS NULL`).
- **Repro**: `cd scripts && env ONLY=/finance/accounts node src/deepCrudTest.cjs` — uD column = ❌, note `row "UI حساب-…" still visible after DELETE + 3 refreshes`.
- **Likely cause**: `GET /api/finance/accounts` either does not filter `deletedAt IS NULL`, or the DELETE handler does not actually set `deletedAt` (only updates a status field). Needs to confirm in `artifacts/api-server/src/routes/finance/accounts.ts` and the corresponding `chartOfAccounts` Drizzle query.
- **Impact**: Misleading list — users cannot tell which accounts are active.

### C12 — `/properties/owners/:id/edit` route is unrouted (Pencil button → blank/404) (FIXED — Task #157)

- **Symptom**: Deep-CRUD harness creates an owner via the UI form, then clicks the row's "تعديل" pencil — the pencil is a `<Link to="/properties/owners/:id/edit">`, but no route is registered for that path, so the SPA renders a 404 / blank shell. The harness times out waiting for the "حفظ التعديلات" save button (uE = ❌, note `edit-save-button-not-found`); uD is therefore SKIPped because there is no row-level "حذف" affordance on the list page.
- **Repro**: `cd scripts && env ONLY=/properties/owners node src/deepCrudTest.cjs` — uE column = ❌.
- **Likely cause**: `artifacts/ghayth-erp/src/pages/properties-owners.tsx` renders an edit Link, but `routes/properties-routes.tsx` has no matching `<Route path="owners/:id/edit">`. Either add the route + edit page, or replace the Link with the in-row inline-edit pattern used by HR/shifts and Fleet (which both pass uE/uD cleanly).
- **Impact**: Owners cannot be edited from the UI even though `PATCH /api/properties/owners/:id` works (API axis U = ✅).

## Medium (14 / 14 closed) — A3 false positives + 1 intentional read-only

The original probe regex was `حفظ|إنشاء|إضافة|تأكيد|submit|save|create` and it
ran without waiting for client-side hydration to settle. That misses real save
verbs used in the codebase (`تسجيل`, `نشر`, `إرسال`, `تقديم`, `تحديث`, …) and
treats edit routes that need a real `:id` as empty shells. Re-verified all 14
manually against the source — every page renders a working form with a save
affordance — and added `scripts/src/verify-create-pages.cjs` so future runs
have a probe with the expanded regex + a 1500ms post-hydration grace + real
`:id` resolution. All 14 are closed:

| Route | Real save label (verified in source) | Status |
|---|---|---|
| `/finance/accounts/:id/edit` | "حفظ التعديلات" — line 98 | ✅ probe needed real `:id` |
| `/finance/intercompany/consolidation/create` | — (read-only consolidated report) | ✅ intentional, not a create form |
| `/governance/compliance/create` | "تسجيل" — line 78 | ✅ regex gap (تسجيل) |
| `/governance/risks/create` | "تسجيل" — line 143 | ✅ regex gap (تسجيل) |
| `/hr/attendance/create` | "تسجيل حضور" / "تسجيل انصراف" | ✅ regex gap (تسجيل) |
| `/hr/excuse-requests/create` | "تقديم الطلب" — `excuse-create.tsx` | ✅ regex gap (تقديم) |
| `/hr/exit/create` | "إنشاء طلب نهاية الخدمة" — line 224 | ✅ probe missed hydration window |
| `/hr/leaves/create` | "تقديم الطلب" | ✅ regex gap (تقديم) |
| `/hr/payroll/create` | "إنشاء كشف الرواتب" | ✅ probe missed hydration window |
| `/hr/performance/create` | "حفظ التقييم" — line 248 | ✅ probe missed hydration window |
| `/hr/recruitment/create` | "نشر الوظيفة" — line 206 | ✅ regex gap (نشر) |
| `/properties/contracts/create` | "إنشاء العقد" — line 208 | ✅ probe missed hydration window |
| `/properties/maintenance/create` | "تسجيل الطلب" | ✅ regex gap (تسجيل) |
| `/umrah/commission-plans/:id/edit` | "حفظ" (commission-plan-editor) | ✅ probe needed real `:id` |

Forward-looking guard: `node scripts/src/verify-create-pages.cjs` re-runs all
14 in a logged-in headless browser using the expanded `SAVE_RE` regex (`حفظ|
إنشاء|إضافة|تأكيد|تسجيل|نشر|اعتماد|إرسال|تقديم|تحديث|إصدار|توليد|إنهاء|
submit|save|create|publish|register`), waits for `networkidle` + 1500ms,
resolves real `:id` for edit routes, and skips the read-only consolidation
page. Use it before the next full-matrix run so the regex stays in sync with
the codebase.

## Resolved — not bugs (intentional consolidations)

These three "render redirects" surfaced as A1 fails in the first pass; on inspection each is an explicit `navigate(..., { replace: true })` consolidating a deprecated route to its canonical location. Reclassified as PASS.

| Stale route | Redirects to | Implemented at |
|---|---|---|
| `/hr/discipline/memos` | `/hr/violations?tab=memos` | `pages/hr/discipline-memos.tsx:16` |
| `/hr/employee-profile/:id` | `/employees/:id` | `pages/hr/employee-profile.tsx:13` |
| `/my-leave-request` | `/hr/leaves/create` | `pages/my-leave-request.tsx:7` |

Recommendation: prune these from `audit/inventory.json` so future matrix runs do not re-flag them. Tracked in follow-up #140.
