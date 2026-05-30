# Schema-Drift Sweep — "خطأ في هيكل قاعدة البيانات" (pg 42703)

**Date:** 2026-05-30
**Trigger:** Operator report — the toast *«تعذّر تنفيذ العملية — خطأ في هيكل
قاعدة البيانات، يرجى التواصل مع الدعم الفني»* appears in many scattered
places, reproducibly on **إضافة قسم** (add department). Separately: a newly
created company is **not linked to its creator**.

---

## 1. Where the message comes from

`artifacts/api-server/src/lib/errorHandler.ts:263` maps PostgreSQL error
code **`42703` (`column … does not exist`)** to:

```
status 500 · SERVER_ERROR · "خطأ في هيكل قاعدة البيانات، يرجى التواصل مع الدعم الفني"
```

So every occurrence is the API issuing SQL that names a column the live
table does not have — i.e. **code ↔ schema drift**, not a transient fault.
Because the migration runner (`lib/migrate.ts`) *throws* on failure in
production (the server will not boot half-migrated), a 42703 at runtime can
only mean the code references a column that **no migration and no baseline
ever created**.

## 2. Method

The live column set = baseline dump (`db/schema_pre.sql`, 378 tables) ∪ every
migration `ADD COLUMN` / `CREATE TABLE` (`artifacts/api-server/src/migrations/*`).
Every raw-SQL `INSERT INTO <table> (cols…)` in `routes/` and `lib/` was parsed
and each column checked against that set. (INSERT column-lists are the
highest-signal surface for user-facing *write* failures.) Comment- and
literal-aware parsing was used to avoid false positives from commas inside
`--` comments in `CREATE TABLE` bodies.

## 3. Findings & resolution

| # | Table.column | Call site | User impact | Fix |
|---|---|---|---|---|
| 1 | `departments.nameEn` | `routes/settings.ts` POST+PUT `/departments` | **add/edit department always 42703** (the reported repro) | **migration 240** — add column (mirrors `branches.nameEn`) |
| 2 | `digital_signature_otps.{entityType,entityId,action,userAgent,usedAt}` | `routes/digital-signature.ts` request-otp / verify | document e-sign OTP always 42703 | **migration 241** — add columns |
| 3 | `digital_signature_logs.{entityType,entityId,signatureRef,otpRef}` + dead `action` CHECK | `routes/digital-signature.ts` verify / logs | document e-sign verify + log query 42703 | **migration 241** — add columns, drop incompatible CHECK |
| 4 | `tasks.dueDate`, `tasks.createdBy` | `routes/legal.ts` court-session task | legal-session task silently never created (swallowed) | **code** — use existing `scheduledDate`, drop `createdBy` (matches every other `INSERT INTO tasks`) |
| 5 | `purchase_orders.title` | `lib/cronScheduler.ts` auto-PO | auto purchase order silently fails (swallowed) | **code** — `title` → existing `notes` |
| 6 | `hr_leave_balances.total` | `lib/cronScheduler.ts` annual renewal | annual leave-balance renewal silently fails (swallowed) | **code** — `total` → existing `entitled` (`remaining` is a GENERATED column) |

**Fix principle:** add a column only when the concept is genuinely missing
and the column is its right home (1–3); otherwise correct the code to the
column that already exists (4–6). No dead columns introduced.

## 4. Company not linked to creator

Company access is derived in `middlewares/authMiddleware.ts` from active
`employee_assignments` rows (`allowedCompanies = distinct companyId`, with an
owner/GM expansion). `POST /companies` created the company + bootstrapped
defaults but **never inserted an assignment for the creator**, so the creator
had no entitlement to the company they just made.

**Fix:** `lib/companyBootstrap.ts` now mints an `owner` `employee_assignments`
row for the creator's employee inside the bootstrap transaction (so it is
covered by the existing cleanup-on-failure). `role='owner'` makes the
authMiddleware owner-expansion add the new company to `allowedCompanies` on
the next request. `isPrimary=false` leaves the creator's original primary
assignment untouched. Skipped only when the user has no employee record.

## 5. Deferred (needs a design decision — NOT a blind fix)

**`auto_detection_log`** — `lib/autoViolationEngine.ts:509` writes
*run-aggregate* columns (`targetDate, detected, violationsCreated, …`), but the
table created by migration `105_missing_tables.sql` and read by
`routes/hr-discipline.ts` (`detectedAt, ruleType, severity, violationId`) is a
*per-detection* table. Two features share one name with incompatible shapes.
The engine's insert is wrapped in a swallowing `try/catch`, so it is
**background-only with no user-facing error** — but the detection-run log is
silently never written. Correct fix is to give the engine its own table
(e.g. `auto_detection_run_log`) rather than overload this one; deferred so the
schema decision is made deliberately.

## 6. Verification

- Static re-scan after fixes: drift list went **20 → 7**, the remaining 7 all
  the single deferred `auto_detection_log` insert above.
- `tsc --noEmit` on `artifacts/api-server`: **0 errors**.
