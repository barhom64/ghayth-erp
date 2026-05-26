# Numbering Center — Architecture Lock (#1141)

> Status: **Locked** as of #1191 + #1219 (the enterprise-hardening + integration-tests PRs).  
> Scope: every official document number issued in Ghaith ERP — requests, contracts, correspondence, invoices, vouchers, journal entries, purchase orders, GRNs, umrah groups + agent invoices, fleet trips, properties contracts + receipts, support tickets, projects, CRM contracts, legal cases, and every future executive entity.  
> Owner: `artifacts/api-server/src/lib/numberingService.ts` + `routes/numbering.ts`.

---

## 1. The hard rule

**All official document numbers MUST come from `numberingService.issueNumber()`.**

```
route POST handler ─────► numberingService.issueNumber({                       
                            companyId, branchId,
                            moduleKey, entityKey,
                            entityTable, entityId?, actorId,
                            seasonId?, fiscalYear?, period?,
                          })
                                       │
                                       ▼
                            withTransaction:
                              1. upsert numbering_counters row
                                 (scope tuple: scheme + branch + year + period + season)
                              2. SELECT … FOR UPDATE (serialise concurrent allocators)
                              3. bump counter.nextNumber
                              4. format number against scheme.pattern
                              5. INSERT numbering_assignments (status='assigned')
                              6. INSERT numbering_audit_logs (action='issue')
                                       │
                                       ▼
                            { number, sequenceValue, schemeId, counterId, assignmentId }
```

The number string returned is what the route writes into the executive row's `ref` / `number` / `code` column. The `entityId` is then linked back to the assignment row (`UPDATE numbering_assignments SET "entityId" = $1`).

**Banned everywhere inside `artifacts/api-server/src/routes/`** (enforced by 4 hard lint rules + a Stop-Ship audit, all in `scripts/src/lint-patterns.mjs` + `scripts/src/audit-numbering-coverage.mjs`):

- `nextval('…_seq')` calls of any kind on official sequences
- `generateTimeRef("PREFIX")` for official document numbers
- `generateRef(...)` / `generateBranchRef(...)` — legacy ref builders that don't go through the center
- `Math.random()` near a `ref` / `seq` / `number` value (the classic "random fallback" anti-pattern)
- Any INSERT into an executive document table without a paired `issueNumber` / `issueCorrespondenceNumber` call in the same file

The only legitimate use of `generateTimeRef` is **inside `lib/`** for genuine internal correlation refs (batch ids, payment-gateway correlation, etc.) — and even there the wrapper `lib/internalRef.ts#internalTechRef()` exists to mark intent explicitly.

Why this is a hard line:

| Bypassing the numbering center means losing... | Concrete impact |
|---|---|
| `numbering_assignments` audit row | No record of who issued what, no search, no reprint detection |
| Counter `FOR UPDATE` serialisation | Two concurrent issues collide on the `UNIQUE` index → SQLSTATE 23505 surfaces to the user |
| `lockAfterStatuses` policy enforcement | Approved/posted documents lose their numbers via override/void |
| Per-company / per-branch / per-season scope | Cross-tenant collisions, branches confused over whose number is whose |
| Manual-edit policy gate | Users edit posted document numbers without an audit trail |
| The 21 `UNIQUE` indexes from migration 217 | Database silently accepts duplicate refs |

Any code that emits an official number outside the service is treated as a **Critical Architecture Violation**.

---

## 2. Service boundary

```
┌──────────────────────────────────────────────────────────────┐
│ artifacts/api-server/src/routes/<domain>.ts                  │
│                                                              │
│  ↓ ONLY entry point for issuing numbers                      │
│                                                              │
│  import { issueNumber } from "../lib/numberingService.js";   │
│  const issued = await issueNumber({ … });                    │
│  // INSERT INTO executive_table (…, ref) VALUES (…, $ref)    │
│  // UPDATE numbering_assignments SET entityId = $row.id      │
└─────────────────────────┬────────────────────────────────────┘
                          │
┌─────────────────────────▼────────────────────────────────────┐
│ artifacts/api-server/src/lib/numberingService.ts             │
│                                                              │
│ Public surface:                                              │
│   issueNumber          — atomic counter+assignment+audit     │
│   reserveNumber        — for `on_draft` policies             │
│   assignReservedNumber — flip reserved → assigned            │
│   previewNextNumber    — UI peek without consuming           │
│   validateManualNumber — gate manual user input              │
│   overrideNumber       — admin path with reason + lifecycle  │
│   voidNumber           — admin path with reason + lifecycle  │
│   resetCounter         — admin reset with safety check       │
│   lockCounter          — bar further issues (fiscal close)   │
│   unlockCounter                                              │
│   assertNumberingAssignment — guard helper                   │
│   readEntityStatus     — lifecycle-gate input                │
└─────────────────────────┬────────────────────────────────────┘
                          │
┌─────────────────────────▼────────────────────────────────────┐
│ Tables (migrations 213 / 214 / 215 / 216 / 217):             │
│                                                              │
│   numbering_schemes      ─ one row per (company,module,      │
│                            entity) policy. seeded for every  │
│                            tenant via migrations 213/214/    │
│                            215/217.                          │
│   numbering_counters     ─ actual counter per scope tuple    │
│                            (scheme,branch,fiscalYear,period, │
│                            season). unique scope index.      │
│   numbering_assignments  ─ every issued number, ever.        │
│                            unique on (company,module,entity, │
│                            number).                          │
│   numbering_audit_logs   ─ append-only audit trail.          │
│                                                              │
│ + 21 UNIQUE indexes on the ref column of every executive     │
│   document table (migration 217).                            │
│ + branches.numberingCode column for the {BRANCH} token.      │
└──────────────────────────────────────────────────────────────┘
```

The service is a **utility, not a controller**. It does not decide whether a document should exist — that's the route's domain. It only issues the number according to the policy and records the issuance.

---

## 3. How to migrate a new route

### Step 1 — pick (or seed) a scheme

Every route needs a `(moduleKey, entityKey)` tuple. Browse `numbering_schemes` to see if one already exists; if not, add it via a new migration:

```sql
-- artifacts/api-server/src/migrations/NNN_my_new_scheme.sql

-- @rollback:
--   DELETE FROM numbering_schemes WHERE ("moduleKey","entityKey") = ('mymodule','myentity');

INSERT INTO numbering_schemes (
    "companyId", "moduleKey", "entityKey",
    "displayNameAr", prefix, pattern, "padLength",
    "resetPolicy", "scopePolicy", "issueTiming",
    "manualEditPolicy", "lockAfterStatuses",
    "defaultEntityTable", "defaultRefColumn"
)
SELECT c.id, 'mymodule', 'myentity',
       'وصف عربي', 'PFX', '{PREFIX}-{BRANCH}-{YYYY}-{SEQ}', 4,
       'yearly', 'branch', 'on_draft',
       'draft_only', '["approved","posted","closed"]'::jsonb,
       'my_entity_table', 'ref'
FROM companies c
WHERE COALESCE(c.status,'active') <> 'deleted'
ON CONFLICT ("companyId","moduleKey","entityKey") DO NOTHING;
```

Available `resetPolicy` / `scopePolicy` / `issueTiming` / `manualEditPolicy` values are declared as TS unions in `numberingService.ts`.

> **`issueTiming` is enforced** — pick a value the route can actually call at. Today every wired route calls `issueNumber` from its CREATE handler and passes `expectedTiming: "on_draft"`. If you seed a scheme as `'on_submit'`/`'on_approval'`/`'on_posting'` but the corresponding route still issues at draft time, the service will throw a clear Arabic `ValidationError` on every call. Match the scheme value to the lifecycle point your route is actually calling from, or refactor the route to defer.

### Step 2 — also add a DB UNIQUE index

The 21 UNIQUE indexes from migration 217 are defence-in-depth — even if a route bypasses the service somehow, the DB rejects the duplicate. New executive tables MUST follow:

```sql
CREATE UNIQUE INDEX IF NOT EXISTS uniq_<table>_<refcol>
    ON <table> ("companyId", <refcol>)
    WHERE <refcol> IS NOT NULL AND "deletedAt" IS NULL;
```

### Step 3 — wire the route

```typescript
// artifacts/api-server/src/routes/mymodule.ts

import { issueNumber } from "../lib/numberingService.js";
import { withTransaction, rawExecute, assertInsert } from "../lib/rawdb.js";

router.post("/", authorize({ feature: "...", action: "create" }), async (req, res) => {
  try {
    const scope = req.scope!;

    // Numbering center — issue + INSERT + linkback are ONE atomic
    // transaction. If any step fails, everything rolls back so we never
    // leave an orphaned counter slot or an unlinked assignment row.
    // issueNumber itself opens an inner withTransaction that joins this
    // outer one via SAVEPOINT (see rawdb.ts:99-124).
    const atomic = await withTransaction(async () => {
      const issued = await issueNumber({
        companyId: scope.companyId,
        branchId: scope.branchId ?? null,
        moduleKey: "mymodule",
        entityKey: "myentity",
        entityTable: "my_entity_table",
        actorId: scope.userId,
        expectedTiming: "on_draft",   // REQUIRED — must match scheme.issueTiming
        // seasonId: ...               // ONLY if scopePolicy === "season"
      });
      const result = await rawExecute(
        `INSERT INTO my_entity_table ("companyId", ref, ...) VALUES ($1, $2, ...)`,
        [scope.companyId, issued.number, ...]
      );
      assertInsert(result.insertId, "my_entity_table");
      await rawExecute(
        `UPDATE numbering_assignments SET "entityId" = $1 WHERE id = $2`,
        [result.insertId, issued.assignmentId]
      );
      return { insertId: result.insertId, ref: issued.number };
    });

    res.status(201).json({ id: atomic.insertId, ref: atomic.ref });
  } catch (err) {
    handleRouteError(err, res, "خطأ في إنشاء المعاملة");
  }
});
```

**DO NOT** call `issueNumber` outside `withTransaction`, and **DO NOT** wrap the link-back UPDATE in `.catch(log)`. The lawyer's review nit #2 closed both of those legacy patterns — re-introducing either one bypasses the atomicity guarantee and leaves orphaned counter slots on failure.

### Step 4 — confirm coverage

```bash
$ pnpm audit:numbering-coverage
✓ audit-numbering-coverage: every route that writes to an executive
  document table also calls issueNumber.
```

If the audit shows `MISSING`, add the executive table to the `EXECUTIVE_TABLES` set in `scripts/src/audit-numbering-coverage.mjs` so the Stop-Ship gate covers it going forward.

---

## 4. The four lint guards (`scripts/src/lint-patterns.mjs`)

All four are **hard rules** — no `countBaseline`, no ratchet. Any new violation fails CI.

| Rule id | Catches |
|---|---|
| `nextval-in-route` | `nextval('any_seq')` inside `routes/` |
| `generateTimeRef-as-official-number` | `generateTimeRef("PREFIX")` inside `routes/` (use `internalTechRef` in `lib/` for internal refs) |
| `random-as-ref-fallback` | `Math.random()` within 180 chars of `seq` / `ref` / `number` |
| `generateRef-or-generateBranchRef-in-route` | The two legacy ref-builder helpers inside `routes/` |

---

## 5. The Stop-Ship audit (`scripts/src/audit-numbering-coverage.mjs`)

Where the lint rules catch **forbidden CALLS**, the coverage audit catches **MISSING CALLS** — a route can have zero forbidden patterns AND zero numberingService calls AND still emit an INSERT into an executive document table.

```bash
$ pnpm audit:numbering-coverage
```

For every file in `routes/` that INSERTs into an executive document table (the list in `EXECUTIVE_TABLES`), the audit requires a paired `issueNumber()` or `issueCorrespondenceNumber()` call somewhere in the same file. Wired into the guard pipeline (`scripts/guard.sh` step 9b).

---

## 6. Lifecycle gate — `lockAfterStatuses`

Every scheme carries a `lockAfterStatuses` JSON array of status strings (e.g. `["approved","posted","sent","closed"]`). When the linked entity reaches one of these statuses, both `validateManualNumber` (used by `overrideNumber`) and `voidNumber` will:

1. Read the entity's live status via `readEntityStatus(entityTable, entityId)`.
2. Check if that status is in the scheme's `lockAfterStatuses`.
3. Refuse the mutation with an actionable Arabic message:
   > "لا يمكن تعديل رقم {scheme} بعد دخوله حالة \"{status}\" — هذه الحالة مقفلة بموجب سياسة الترقيم"

This is the missing-link the original review flagged: the policy was declared but never enforced. Test coverage: `tests/integration/numberingService.dynamic.test.ts` → `lifecycle gate`.

---

## 7. Backfill — for legacy data

When the numbering center launched, every existing document already had a `ref` from the old `nextval` paths. Those rows aren't in `numbering_assignments`, so:

- the new admin UI would show an empty history,
- the next `issueNumber` call would collide with the highest legacy ref.

**`lib/numberingBackfill.ts`** solves this:

| Function | Purpose |
|---|---|
| `previewBackfill(schemeId)` | How many legacy rows would be inventoried? Cheap read, no writes. |
| `backfillScheme(schemeId)` | Insert one `numbering_assignments` row per legacy ref; bump counter past the max. Idempotent. |
| `backfillAllSchemes()` | One-shot for every active scheme. |
| `extractSequenceFromRef(ref)` | Pure parser: extracts trailing digits from "REQ-MK-2026-0042" → 42. |

The counter **only ratchets UP** (`GREATEST(...)`) — backfill can never reduce the next-issued sequence.

UI integration: the `BackfillBanner` in `settings/numbering-tab.tsx` shows a yellow card with the pending count + a one-click "جرد المعاملات السابقة" button whenever a scheme has legacy refs not yet imported.

---

## 8. Tests

| File | What it pins |
|---|---|
| `tests/unit/numberingServiceSmoke.test.ts` | Public surface, transaction shape, migration shape, route surface, every priority-1/2 route migration, all 4 lint rules + Stop-Ship gate, every UNIQUE constraint. ~80 contract assertions. |
| `tests/unit/numberingBackfillParser.test.ts` | `extractSequenceFromRef` against every legacy ref shape ever emitted. |
| `tests/integration/numberingService.dynamic.test.ts` | 13 real-DB scenarios: 20-way concurrent contention, branch isolation, tenant isolation, fiscal-year reset, season rollover, lifecycle gate, manual override + uniqueness, counter reset (with + without force), DB-level UNIQUE drift catch. |

Activation of the integration suite is gated by `DATABASE_URL` containing one of `_test` / `localhost:54329` / `127.0.0.1:54329` (same pattern as the existing `tenantIsolation.dynamic.test.ts`).

---

## 9. Common pitfalls

### "the chevron rotates but the editor doesn't open"
The admin UI inline editor renders below the table. On long policy lists it can land below the fold — `scrollIntoView({block:"nearest"})` was added in #1213. Each row also has an explicit "تعديل / إغلاق" button now.

### "ON CONFLICT" SQL errors after adding a scheme
The `numbering_counters_unique_scope` index uses a `COALESCE(...)` expression list. If you write a custom upsert against `numbering_counters`, the `ON CONFLICT` clause MUST mirror that exact expression list, or Postgres throws `42P10`.

### "id ambiguous" in queries that join counters + schemes
Both tables have an `id` column. Prefix with `c.id` / `s.id`.

### Backfill returns "حدث خطأ غير متوقع"
The scheme's `defaultEntityTable` points at a table that doesn't exist in this tenant's DB (e.g. migration that adds the column hasn't run, or the scheme was hand-edited). The service surfaces a clear Arabic message after #1213 — check the toast text + the audit log.

### "the system marked migration as applied but the constraint isn't there"
The CI workflow loads `db/schema.sql` (the dump baseline) and then marks every migration as already-applied. If a new migration creates a UNIQUE index, the index MUST also be added to `db/schema_post.sql` so the dump matches what live tenants will have. See migrations 213 / 216 / 217 commits for the pattern.

---

## 10. Adding a new scheme — checklist

- [ ] New migration `NNN_<name>.sql` with `INSERT … ON CONFLICT DO NOTHING` against `numbering_schemes` for every company.
- [ ] `@rollback:` annotation on the migration.
- [ ] `defaultEntityTable` + `defaultRefColumn` set so backfill works.
- [ ] UNIQUE index on the executive table's ref column added in the same migration (or migration 217-style index in `db/schema_post.sql`).
- [ ] Route imports `issueNumber` from `../lib/numberingService.js`.
- [ ] `entityId` linked back to the assignment after INSERT.
- [ ] `audit-numbering-coverage` reports CLEAN.
- [ ] If a new executive table was introduced: also add it to the `EXECUTIVE_TABLES` set in `audit-numbering-coverage.mjs`.
- [ ] Integration test scenario added to `numberingService.dynamic.test.ts` if the scheme is for a critical document class.
- [ ] Smoke assertion added to `numberingServiceSmoke.test.ts` pinning the new route's `entityKey:` literal.

---

## 11. The architectural promise

> "مركز الترقيم مسار/خدمة خادمة لا تملك منطق القرار. أي محاولة من مسار لتوليد رقم رسمي داخليًا تعد Critical Architecture Violation."

Defended on **four enforcement layers**:

1. **TypeScript** — lint rules forbid the four legacy patterns.
2. **CI** — `audit-numbering-coverage` fails the build if any new route INSERTs into an executive table without going through the service.
3. **Service** — `numberingService.issueNumber` is the only path that emits an audit row + a counter row; it throws (no fallback) on any failure.
4. **DB** — 21 `UNIQUE` indexes on executive ref columns + 4 unique indexes on the numbering tables themselves catch any path that somehow gets past all three layers above.

Removing any one layer is a regression. All four must stay green for the architectural promise to hold.
