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

## 5. `auto_detection_log` — table-name conflict, resolved end-to-end

`lib/autoViolationEngine.ts` `logDetectionRun()` writes **run-aggregate**
columns (`targetDate, detected, violationsCreated, memosCreated, skipped,
errors, details, createdAt`), but migration `105_missing_tables.sql` created
the table as **per-detection** (`ruleType NOT NULL, employeeId, detectedAt,
severity, violationId, status`). Investigation showed **the engine is the only
writer** — no code ever produced per-detection rows — so both the engine's
logging (42703 / 23502, swallowed by a self-heal `try/catch`) and the
`routes/hr-discipline.ts` summary that reads it were effectively dead.

Resolution (the engine's actual shape wins, since it is the sole writer):

- **migration 242** adds the run-aggregate columns and drops the
  never-satisfiable `ruleType NOT NULL`. `detectedAt` (DEFAULT NOW) is kept;
  `createdAt` is added (the engine orders/filters on it).
- `autoViolationEngine.logDetectionRun` — the self-heal `CREATE TABLE` + retry
  hack is removed; the schema is now guaranteed by the migration, so a failure
  is best-effort log-only.
- `routes/hr-discipline.ts` `/auto-detection/summary` — the two stat queries
  are switched to run-aggregate semantics: `totalRuns = COUNT(*)`, the
  counters `SUM()`-ed (so `totalMemos`/`totalErrors` are now real instead of
  hard-coded `0`), and the by-type breakdown unnests each run's `details`
  JSON array (`jsonb_array_elements`) instead of reading a never-populated
  `ruleType` column.

## 6. Verification

- Static re-scan after fixes: **INSERT** column drift **20 → 0**.
- Extended the sweep to **UPDATE … SET** column lists: **0** drift.
- `tsc --noEmit` on `artifacts/api-server`: **0 errors**.
- Scope note: the sweep covers raw-SQL `INSERT`/`UPDATE` column lists (the
  surfaces that produce user-facing write 42703s). Drift inside complex
  `SELECT`/join projections is not statically resolved here and is left as a
  follow-up if any read-path 42703 is reported.
