# Issue #664 — Dangerous Direct UPDATE RCA (canonical)

**Generated:** 2026-05-20
**Status:** RCA / documentation only. **No `applyTransition` migrations, no engine widening, no `eventCatalog` edits, no `bypass-ok` comments are landed by the PR that ships this file.** Per owner directive: #664 is a documentation/triage track; migration decisions are deferred.

This document is the **single canonical merge** of two parallel RCA efforts:

- **PR #706** (`docs/664-dangerous-bypass-rca`, merged) — first RCA pass over the 18-hit `dangerous` bucket with the 5-cluster (A-E) grouping by fix-shape.
- **PR #707** (`claude/issue-664-dangerous-rca`, open at time of writing) — second RCA pass that (a) reclassified the same 18 by *fix-shape* into 6 classes (A-F) and (b) identified a detector-regex false positive that mis-flagged 3 soft-delete sites as `dangerous`.

Both passes converged on the same engineering call (do not migrate blindly; classify-and-defer); they differed only in taxonomy and in whether the detector itself was buggy. **This file is now the authoritative version.** PR #707 is superseded.

## Source references

| Source | Purpose |
|---|---|
| `audit/system-review/tooling/workflow-audit.mjs` | scanner — produces the raw hit list (regex over route SQL) |
| `audit/system-review/tooling/bypass-triage.mjs` | triager — sorts hits into `intentional` / `legacy` / `dangerous` |
| `audit/system-review/tooling/_workflow-audit.json` | machine-readable hit inventory |
| `audit/system-review/tooling/_bypass-triage.json` | machine-readable per-hit classification (`classified[].bucket`) |
| `docs/audit/WORKFLOW_AUDIT.md` | rendered hit inventory |
| `docs/audit/BYPASS_TRIAGE.md` | rendered triage |
| `artifacts/api-server/src/lib/lifecycleEngine.ts` | `STATE_MACHINES`, `applyTransition`, `isValidTransition` |
| `artifacts/api-server/src/lib/eventCatalog.ts` | declared event names (the `check:event-name-tense` + `check:audit-action-vocab` guards consume this) |

## Headline numbers (after detector fix, this PR)

```
                       before   after   Δ
  direct UPDATE hits      111     106    −5
  dangerous bucket         18      15    −3
  intentional bucket       76      74    −2
  legacy bucket            17      17     ·
```

The `dangerous` headline that used to read **18** is now **15** real hits. The change is purely a detector-correctness fix — **no application code was modified**. The tempered-token regex (see "Detector false positives" below) stops matching a `status` token that sits in a `WHERE` clause, which removes **5 false-positive hits** from the scan entirely:

- **−3 from `dangerous`** — the 3 Class-A soft-delete sites (`finance-journal.ts:570`, `finance-journal.ts:855`, `hr.ts:4151`); `status` there is a precondition guard, not an assignment.
- **−2 from `intentional`** — the same WHERE-clause-only pattern in `hr.ts:6244` (a genuine false positive) and `hr.ts:2722` (a genuine *multi-line* bulk update that the scanner's 2-line read window only ever matched coincidentally, via a sub-query's `WHERE … status =` token).

`legacy` is unaffected. The buckets stay internally consistent: 18 + 76 + 17 = 111 before, 15 + 74 + 17 = 106 after.

> **If you see a total of "113", an `intentional` of "81", or a `dangerous` of "18" anywhere else in the audit corpus, that is a stale snapshot.** Re-run `node audit/system-review/tooling/workflow-audit.mjs && node audit/system-review/tooling/bypass-triage.mjs` to refresh.

## What "dangerous" actually loses

For every hit in the `dangerous` bucket (when it really *is* a status transition), the direct UPDATE skips four things `applyTransition` gives you for free:

1. **Engine state-validation** — `isValidTransition(fromState → toState)` rejects impossible flips (e.g. `paid → draft`).
2. **`audit_logs` row** carrying `(actor, before, after, reason)`. Without this, governance reports that join `audit_logs` against `event_logs` miss the event entirely.
3. **`event_logs` emission** with the canonical past-tense action name (declared in `eventCatalog.ts`, enforced by the `check:event-name-tense` + `check:audit-action-vocab` guards). Subscribers (notifications, SLA crons, downstream evaluators) never see the state change.
4. **`onApply(row, client)` side-effects** inside the same transaction as the status flip — cancel pending children, free a resource, reverse GL, etc. Direct UPDATEs either inline these by hand (duplication risk) or skip them entirely.

Several of the `dangerous` hits *do* emit an event and write an audit row manually; the structural risk is **uniformity** — the guard suite cannot tell a hand-rolled `INSERT INTO event_logs` apart from a missing one, so the next refactor may silently drop the manual call.

## Detector false positives — what changed in this PR

`scanDirectStatusUpdates` in `workflow-audit.mjs` previously matched:

```js
/\bSET\b[\s\S]{0,160}(?:"?status"?|"?approvalStatus"?|"?lifecycle_state"?)\s*=/i
```

The regex's **intent** was "status-like column assigned in the SET clause". Its **effect** was "status-like column mentioned anywhere within 160 characters of `SET`" — including past the `WHERE` boundary. That mis-flagged 3 soft-delete sites whose only mention of `status` was in the WHERE precondition guard:

| Site | Actual UPDATE | Why it was flagged | Why it isn't a transition |
|---|---|---|---|
| `finance-journal.ts:570` | `SET "deletedAt" = NOW() WHERE id = $1 AND … AND status = 'draft'` | `status =` within 160 chars of `SET` | only `"deletedAt"` is assigned; `status` is a precondition guard |
| `finance-journal.ts:855` | same shape, on voucher delete | same | same |
| `hr.ts:4151` | `SET "deletedAt" = NOW() WHERE id = $1 AND … AND status = 'pending'` | same | same |

**Fix.** A tempered-token regex refuses to cross a `WHERE`:

```js
/\bSET\b(?:(?!\bWHERE\b)[\s\S]){0,160}(?:"?status"?|"?approvalStatus"?|"?lifecycle_state"?)\s*=/i
```

This is a strict subset of the old pattern — it can only *remove* matches, never add. Verified against the full 18-hit set:

- 3 sites removed (the 3 above) — all confirmed soft-deletes with `status` only in the WHERE.
- 15 sites preserved — all confirmed genuine `SET status = …` assignments.

**Blast radius:** zero on runtime behaviour (no application code changed). Detector-only.

## Class A–F taxonomy (canonical)

The 18 original hits split into 6 fix-shapes. Class A is the false-positive class identified above; Classes B-F are the 15 real hits.

| Class | Shape | Hits | `applyTransition` migration candidate? | Disposition (this RCA) |
|---|---|---:|---|---|
| **A** | Detector false positive — `status` only in the WHERE guard, never assigned | 3 | No — nothing to migrate | **Closed** by detector regex fix (this PR) |
| **B** | Soft-delete bundled with `status='cancelled'` on the same row | 4 | No without engine widening — state graph has no `posted → cancelled` / `approved → cancelled` edge | Defer — needs `STATE_MACHINES` decision (owner) |
| **C** | Payment write — `paidAmount` arithmetic + `status` derived via SQL `CASE WHEN` | 4 | No without engine API extension — `applyTransition` takes a fixed `toState`, not a `(row) => string` resolver | Defer — needs engine API decision (owner) |
| **D** | Pure single-row status flip on an engine-blessed transition, no side-effects | 1 | **Yes in principle, no in practice** — see "E3 correction" below | Defer — see atomicity note |
| **E** | Bulk cascade — multi-row WHERE (`(employeeId,…)`, `(agentId,seasonId)`, etc.), not `id = $`, often inside a wider parent tx | 5 | No without engine API extension — `applyTransition` is single-row-by-id | Defer / `bypass-ok` (future PR) |
| **F** | Transaction-internal cascade — direct UPDATE is the **side-effect of a parent `applyTransition`** that already audits/emits | 2 | Optional — nested `applyTransition` doubles audit volume for one user action | Defer / `bypass-ok` (future PR) |

**Key headline:** of the 15 real `dangerous` hits, **zero** are truly first-safe migration candidates without either an engine change or an atomicity trade-off. The original RCA claim that **E3 was the one clean candidate is corrected below.**

### E3 correction — `governance.ts:331` is not first-safe after all

The PR #706 RCA placed `governance.ts:331` (`governance_policies (draft|active) → archived`) as the one unambiguous single-site migration candidate. Re-reading the source carefully (lines 312-341):

```ts
await withTransaction(async (client) => {
  const ins = await client.query(
    `INSERT INTO governance_policies (... status, ... "parentId", ...)
     VALUES (..., 'draft', ..., $8, ...) RETURNING id`,
    [...]
  );
  insertId = ins.rows[0].id;

  await client.query(
    `UPDATE governance_policies SET status='archived', "updatedAt"=NOW()
     WHERE id=$1 AND "companyId"=$2 AND status IN ('draft','active') AND "deletedAt" IS NULL`,
    [parentId, scope.companyId]
  );

  for (const link of existingLinks) {
    await client.query(
      `INSERT INTO policy_module_links ("policyId", module, "companyId") VALUES ($1,$2,$3) ON CONFLICT DO NOTHING`,
      [insertId, link.module, scope.companyId]
    );
  }
});
```

The `UPDATE … status='archived'` is **not** a standalone single-row flip. It lives inside a `withTransaction` whose atomicity guarantee is load-bearing: if the parent is archived but the new version INSERT or the link copy fails, the policy is left without an active version. The original RCA classified this as Class E ("one-off cancel/archive flip") on the strength of the `WHERE id=$1` predicate; that classification is **structurally wrong** — the right class is **F** (transaction-internal cascade), because the archive is a *side-effect* of the new-version create, not a primary user action.

**Atomicity options if this were ever migrated:**

1. **Move the INSERTs into `applyTransition.onApply`.** Preserves atomicity (the engine's own `withTransaction` wraps everything) but changes the *primary* action emitted from `governance.policy.new_version` to `governance.policy.archived`. The new-version handler would have to additionally write the `policy.new_version` audit row by hand to preserve the existing API contract — strictly more code, two audit rows per request, and the action name surfaced to the engine is now the *secondary* action.
2. **Split into two separate transactions** (INSERT first, then `applyTransition`). Breaks atomicity — if the second tx fails the database is left with an unarchived parent and an orphan new version.
3. **Add a new event `governance.policy.archived` to `eventCatalog.ts`** so option 1 emits a third, semantically correct event. Touches the event catalog — explicitly forbidden by current scope.

**Conclusion:** even E3 — the cleanest candidate in the whole 15-hit set — requires either an engine change, an `eventCatalog` change, or an atomicity trade-off. There is no zero-touch first-safe migration in this set.

### Atomicity notes (Class F generalised)

Any direct UPDATE that lives inside a `withTransaction` whose siblings (INSERTs, UPDATEs on other tables, cascade deletes) must commit-or-rollback together cannot be naively replaced with `applyTransition`, because:

- `applyTransition` opens its **own** `withTransaction` (separate `pool.connect()` + BEGIN/COMMIT — see `lib/rawdb.ts:75` and `lib/lifecycleEngine.ts:156`).
- A second `withTransaction` inside an outer one acquires a fresh pg client and runs in an **independent** transaction. The two transactions are not nested; PostgreSQL has no nested-transaction semantics beyond `SAVEPOINT`.
- Replacing the inner UPDATE with `applyTransition` therefore breaks atomicity unless the entire parent block is restructured to live inside `applyTransition.onApply`.

This atomicity constraint is the dominant reason 2 of the 15 hits (Class F) and the E3 reclassification (Class F) are not first-safe. It applies anywhere a `dangerous` UPDATE shares a `withTransaction` with sibling writes.

## Structural-vs-migration-safe classification

Cross-cutting view of the 15 real hits by what gates the fix:

| Gate | Hits | Files |
|---|---:|---|
| **Engine state-graph widening** (`STATE_MACHINES.<entity>` needs a new edge) | 5 | `finance-invoices.ts:963/968`, `finance-journal.ts:570→removed/A`, `finance-journal.ts:855→removed/A`, `finance-invoices.ts:1034` (A4 equivalent) |
| **Engine API extension** (`applyTransition` needs `toState: (row) => string` resolver, or `setExtras` for derived columns) | 4 | `finance-invoices.ts:752/757/1197/1739` (Class C — derived status from `paidAmount`) |
| **Engine single-row constraint** (`applyTransition` is by-id; bulk cascades cannot use it without a loop) | 5 | `employees.ts:1288`, `umrah.ts:1393`, `finance-journal.ts:1405`, `finance-invoices.ts:963`, `properties.ts:1591` (when treated as bulk over schedule rows) |
| **Atomicity inside parent `withTransaction`** | 3 | `governance.ts:331` (E3 corrected to F), `finance-invoices.ts:1034`, `properties.ts:1591` |
| **`eventCatalog.ts` widening** (new event name needed, e.g. `governance.policy.archived`) | 1 | `governance.ts:331` |
| **`bypass-ok` comment is the right answer** (current code is correct, the audit just needs documentation) | up to 7 | the Class E + F sites if owner decides cascade/atomicity sites stay as direct UPDATEs |
| **None — truly migration-safe today** | **0** | — |

The "0 truly migration-safe" row is the load-bearing finding. **Every remaining `dangerous` hit requires either an engine change, an `eventCatalog` change, an atomicity trade-off, or a `bypass-ok` documentation comment.** No naïve swap exists.

## What remains — categorised

### Real `dangerous` remaining: 15

The full list (regenerable via `node audit/system-review/tooling/bypass-triage.mjs`):

| # | File:line | Table | Class | Gate |
|---|---|---|---|---|
| 1 | `employees.ts:1288` | `hr_leave_requests` | E | engine single-row |
| 2 | `finance-custodies.ts:609` | `journal_entries` | B | engine state-graph |
| 3 | `finance-invoices.ts:752` | `invoices` | C | engine API |
| 4 | `finance-invoices.ts:757` | `invoices` | C | engine API |
| 5 | `finance-invoices.ts:963` | `journal_entries` | B + E | engine state-graph + bulk |
| 6 | `finance-invoices.ts:968` | `invoices` | B | engine state-graph |
| 7 | `finance-invoices.ts:1034` | `journal_entries` | B + F | engine state-graph + atomicity |
| 8 | `finance-invoices.ts:1197` | `invoices` | C | engine API |
| 9 | `finance-invoices.ts:1739` | `invoices` | C | engine API |
| 10 | `finance-journal.ts:528` | `journal_entries` | B | engine state-graph |
| 11 | `finance-journal.ts:939` | `journal_entries` | B | engine state-graph |
| 12 | `finance-journal.ts:1405` | `financial_periods` | E | engine single-row (loop) |
| 13 | `governance.ts:331` | `governance_policies` | F (corrected from E) | atomicity + eventCatalog |
| 14 | `properties.ts:1591` | `property_units` | F | atomicity |
| 15 | `umrah.ts:1393` | `umrah_penalties` | E | engine single-row |

### False positives removed: 3

- `finance-journal.ts:570` — soft-delete, `status` in WHERE only
- `finance-journal.ts:855` — soft-delete, `status` in WHERE only
- `hr.ts:4151` — soft-delete, `status` in WHERE only

### What needs **engine work** before any migration

- **State-graph widening** for `journal_entries` (`posted → cancelled`, `approved → cancelled`) — gates 5 hits (Class B).
- **State-graph widening** for `invoices` (`posted → cancelled`) — gates 1 hit (B subset).
- **`applyTransition` API extension** to accept `toState: (row) => string` resolver or first-class derived-column support — gates 4 hits (Class C, the `paidAmount` family).
- **`applyTransition` bulk variant** (e.g. `applyTransitionWhere({ extraWhere })` returning N rows) or accepted "use loop + accept N round-trips" — gates 3 bulk hits.
- **`onApply`-nested transition** semantics clarified — does the engine permit a nested `applyTransition` from inside another's `onApply`? Today: no public guidance.

### What needs a **governance decision** (owner)

- Does the team accept that `bypass-ok` is the terminal answer for Class E (bulk) and Class F (atomicity) — i.e. classify-and-document rather than migrate?
- For Class B (JE cancel), is the right shape (a) engine state-graph widening + `applyTransition({ setExtras: { deletedAt: { raw: "NOW()" } } })`, or (b) acceptance that delete is a separate lifecycle from status transitions and the direct UPDATE is correct?
- For Class C (paidAmount + derived status), is the right shape (a) engine API extension, (b) JS-side `SELECT … FOR UPDATE` + `applyTransition({ toState: newStatus })`, or (c) `bypass-ok`?
- For E3 specifically (`governance.policy.archived`), is adding a new event name to `eventCatalog.ts` acceptable to enable a clean migration, or is the current direct UPDATE inside `withTransaction` correct-as-written?

None of these are taken in this PR.

## What this PR ships

- `audit/system-review/tooling/workflow-audit.mjs` — tempered-token regex fix (one logical line; subset semantics; documented inline).
- `audit/system-review/tooling/_workflow-audit.json` + `audit/system-review/tooling/_bypass-triage.json` — regenerated machine artefacts.
- `docs/audit/WORKFLOW_AUDIT.md` + `docs/audit/BYPASS_TRIAGE.md` — regenerated rendered artefacts.
- **This file** — single canonical RCA superseding both PR #706's and PR #707's drafts, with Class A-F taxonomy, detector FP correction, E3 correction, atomicity notes, and structural-vs-migration-safe classification.

**No route file is touched. No `applyTransition` migration is started. No engine, `eventCatalog`, schema, package, lockfile, RBAC, or GL change is introduced.** Comments are added only to `workflow-audit.mjs` to document the regex intent.

## How to refresh this RCA

```bash
# 1. Re-scan for direct UPDATE bypasses
node audit/system-review/tooling/workflow-audit.mjs

# 2. Re-classify into the 3 buckets
node audit/system-review/tooling/bypass-triage.mjs

# 3. Re-read the dangerous hits
node -e 'console.log(JSON.stringify(
  require("./audit/system-review/tooling/_bypass-triage.json")
    .classified.filter(x => x.bucket === "dangerous"), null, 2))'

# 4. If the dangerous count changes from 15, re-derive the Class A-F
#    table above — the assignments are specific to today's hit set.
```
