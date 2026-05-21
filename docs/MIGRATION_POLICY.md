# Migration Policy

> Status: enforced. New migrations are checked by
> `scripts/src/check-migration-policy.mjs` (run as `pnpm audit:migrations`
> and inside `scripts/guard.sh`).

This document defines how schema changes are written, reviewed, and applied
in Ghayth ERP. The runner is already mature — `artifacts/api-server/src/lib/migrate.ts`
handles transaction-incompatible statements, partial-DB safety gates, and a
baseline load. What this policy adds is **discipline around the migrations
themselves**: contracts, rollback plans, zero-downtime rules, and a
compatibility policy — with the finance and HR domains held to a higher bar.

---

## 1. The live migration directory

There is exactly one directory the runtime applies:

```
artifacts/api-server/src/migrations/
```

`build.mjs` copies it to `dist/migrations/`; `migrate.ts` applies every
`*.sql` file in **filename sort order**, recording each in the
`schema_migrations` table so it is applied at most once.

> `artifacts/api-server/migrations/` (no `src/`) is a historical baseline and
> is **not** applied by the runner. Do not add new migrations there.

---

## 2. Naming convention

```
NNN[suffix]_short_snake_case_name.sql
```

- `NNN` — a zero-padded numeric prefix, **3 digits or more**. The prefix
  drives apply order, so padding matters (`009` sorts before `010`).
- `suffix` — an optional single lowercase letter (`172z_…`) used only to
  slot a file between existing numbers without renumbering.
- The rest is a short, descriptive `snake_case` name.

Filenames must be **unique** (`check-duplicate-migrations` enforces this).
Two files may share a numeric prefix only if the rest of the name differs;
prefer a fresh number.

The migration-policy guard rejects any filename that does not match
`^[0-9]{3,}[a-z]?_[A-Za-z0-9_]+\.sql$`.

---

## 3. Migration contract — the header

Every **new** migration must begin with a `--` comment header that declares
its contract. Copy [`docs/migration-template.sql`](migration-template.sql):

```sql
-- ===========================================================================
-- 182_invoices_dispatch_status.sql
-- ---------------------------------------------------------------------------
-- WHAT:  adds invoices.dispatch_status (nullable text) + a partial index.
-- WHY:   #742 — courier dispatch tracking for B2B invoices.
-- SAFETY: additive, nullable column; index built CONCURRENTLY; no lock.
-- @rollback: ALTER TABLE invoices DROP COLUMN IF EXISTS dispatch_status;
-- ===========================================================================
```

The guard requires, for every new migration:

1. The first non-blank line is a `--` comment.
2. A **rollback annotation** — a line matching `-- @rollback: …`.
3. Any destructive statement is acknowledged (see §4).

---

## 4. Destructive changes

Destructive statements — `DROP TABLE`, `DROP COLUMN`, `DROP SCHEMA`,
`TRUNCATE` — destroy data that no rollback can recover. They are allowed,
but must be **explicit**. Add this line to the migration:

```sql
-- @policy:destructive
DROP TABLE IF EXISTS deprecated_table;
```

Without the `-- @policy:destructive` acknowledgement the guard fails the
build. The line exists so a reviewer is never surprised by an irreversible
change buried in a large migration.

Before dropping anything, confirm via a code search that no running code
path still references the table or column. Prefer the expand/contract
sequence in §7 — a `DROP` should land at least one release **after** the
code that used it stopped shipping.

---

## 5. Idempotency

Write DDL that can be re-run without error:

- `CREATE TABLE IF NOT EXISTS`, `CREATE INDEX IF NOT EXISTS`
- `ALTER TABLE … ADD COLUMN IF NOT EXISTS`, `… DROP COLUMN IF EXISTS`
- `INSERT … ON CONFLICT DO NOTHING` for seed rows

The runner records a migration in `schema_migrations` only after the whole
file commits, so a migration that fails midway is retried in full on the
next boot. Idempotent DDL makes that retry safe. The guard emits an advisory
warning for a `CREATE TABLE` without `IF NOT EXISTS`.

---

## 6. Rollback plans

Every migration declares a rollback in its `@rollback:` header line:

- **Reversible** (the common case) — give the exact inverse SQL:
  `@rollback: ALTER TABLE invoices DROP COLUMN IF EXISTS dispatch_status;`
- **Irreversible** — say so plainly and explain the data loss:
  `@rollback: irreversible — drops the legacy_imports table and its rows.`

Rollback SQL is documentation and a manual operator step; it is **not** run
automatically. A forward-only fix (a new migration that corrects the
previous one) is usually safer in production than a manual rollback — see §7.

---

## 7. Zero-downtime discipline

During a deploy the old and new application versions run **at the same
time** against the **same database**. A migration must not break the
version that is still running. Use **expand / contract**:

| Phase | Migration | Code |
| --- | --- | --- |
| Expand   | add the new column/table (nullable, no `NOT NULL` yet) | release that writes both old + new |
| Backfill | populate the new column in batches                    | — |
| Migrate  | (optional) add the `NOT NULL` / constraint once backfilled | release that reads new only |
| Contract | drop the old column/table                              | — |

Concrete rules:

- **Never** add a `NOT NULL` column without a `DEFAULT` or a prior backfill —
  it rewrites/locks the whole table and breaks the running old version.
- **Never** rename a column in one step. Add the new name, backfill,
  switch the code, drop the old name in a later release.
- Build indexes on large tables with `CREATE INDEX CONCURRENTLY` — the
  runner already detects this and runs such files outside a transaction.
- Keep a single migration's lock footprint small; split a big change into
  several files rather than one long-locking transaction.

---

## 8. Schema compatibility policy

- **Additive changes are backward compatible** — new nullable columns, new
  tables, new indexes. These are the default and always safe.
- **Subtractive / narrowing changes are breaking** — dropping a column,
  adding `NOT NULL`, tightening a `CHECK`, narrowing a type. They require
  the expand/contract sequence and must trail the code change by a release.
- A column read by an `@workspace/api-zod` contract or an OpenAPI response
  must not be dropped until that contract has stopped exposing it.
- Type changes that are not binary-compatible (e.g. `text` → `int`) are
  treated as subtractive: add a new column, backfill, switch, drop.

---

## 9. Finance & HR — higher bar

Finance (`journal_entries`, `journal_lines`, `invoices`, `vouchers`,
`financial_periods`, …) and HR/payroll (`employees`, `attendance`,
`hr_*`, payroll tables) carry money and legally-sensitive records. For a
migration touching these tables:

- **No destructive change** without an RCA reference in the header and
  sign-off recorded in the PR. Posted financial rows are effectively
  immutable history.
- A column feeding GL posting, period logic, or payroll calculation must be
  backfilled and verified **before** any code depends on it — a half-applied
  finance migration can mis-state the ledger.
- Prefer additive columns + a forward-only correcting migration over any
  in-place `UPDATE` of posted journal or payroll rows.
- Encrypted columns (see `lib/fieldEncryption.ts`) must keep their format;
  widening an encrypted column's length is fine, changing its encoding is
  not — it requires a re-encryption migration, not a type change.

---

## 10. The guard and the legacy allowlist

`scripts/src/check-migration-policy.mjs`:

- **Universal rules** (filename pattern, non-empty) apply to every migration.
- **Strict rules** (§3, §4) apply only to migrations **not** listed in
  `scripts/migration-policy-legacy-allowlist.txt`.

The allowlist freezes the migrations that pre-date this policy so the guard
never fails retroactively — the same pattern as `scripts/ghost-row-allowlist.txt`.

**Do not add new migrations to the allowlist.** It exists only to freeze
history. Every new migration must satisfy the strict rules.

Run it locally before committing a migration:

```
pnpm audit:migrations
```

It also runs inside `scripts/guard.sh` (pre-commit hook + CI).
