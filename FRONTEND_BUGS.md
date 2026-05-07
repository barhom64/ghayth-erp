# Frontend Bugs — Ghayth ERP Test Matrix (2026-05-07)

Triage of failures and anomalies surfaced by the 369-route × 5-axis frontend test matrix. See FRONTEND_TEST_MATRIX.md for raw per-route results.

## Summary

| Severity | Count | Status |
|---|---:|---|
| Critical | 5 | ✅ All fixed |
| High | 0 | — |
| Medium | 14 | Open (A3 probe, see triage) |
| Resolved-not-bug | 3 | Documented |

## Critical (5 / 5 fixed)

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

## Medium (14 open) — A3 CRUD probe could not assert save affordance

These `/create` pages render and load data, but the SPA-aware probe could not match a button via the regex `حفظ|إنشاء|إضافة|تأكيد|submit|save|create` after client-side hydration. They split into two real categories:

**Category A — form is empty / not yet implemented (form=0)**: The probe reports `form=0/save=false`, suggesting the create page renders a shell only. Worth product/dev review:

- `/finance/accounts/:id/edit`
- `/finance/intercompany/consolidation/create`
- `/hr/excuse-requests/create`
- `/hr/exit/create`
- `/hr/performance/create`
- `/properties/contracts/create`

**Category B — form fields present but save button regex did not match (form>0)**: Likely false-positive due to button label variation (e.g. icon-only, custom Arabic label). Manual spot-check is recommended before treating as a bug:

- `/governance/compliance/create` (form=7)
- `/governance/risks/create` (form=10)
- `/hr/attendance/create` (form=3)
- `/hr/leaves/create` (form=6)
- `/hr/payroll/create` (form=4)
- `/hr/recruitment/create` (form=13)
- `/properties/maintenance/create` (form=6)

Tracked in follow-up #139 (improve probe heuristics + audit Category A pages).

## Resolved — not bugs (intentional consolidations)

These three "render redirects" surfaced as A1 fails in the first pass; on inspection each is an explicit `navigate(..., { replace: true })` consolidating a deprecated route to its canonical location. Reclassified as PASS.

| Stale route | Redirects to | Implemented at |
|---|---|---|
| `/hr/discipline/memos` | `/hr/violations?tab=memos` | `pages/hr/discipline-memos.tsx:16` |
| `/hr/employee-profile/:id` | `/employees/:id` | `pages/hr/employee-profile.tsx:13` |
| `/my-leave-request` | `/hr/leaves/create` | `pages/my-leave-request.tsx:7` |

Recommendation: prune these from `audit/inventory.json` so future matrix runs do not re-flag them. Tracked in follow-up #140.
