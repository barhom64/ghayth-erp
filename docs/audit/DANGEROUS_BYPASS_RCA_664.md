# Issue #664 — Dangerous Direct UPDATE RCA

**Generated:** 2026-05-20
**Scope:** The 18 hits classified as `dangerous` by
`audit/system-review/tooling/_bypass-triage.json`. These are the direct
`UPDATE … SET status=…` calls that touch a table registered in
`STATE_MACHINES` (`artifacts/api-server/src/lib/engines/lifecycleEngine.ts`)
and therefore skip the central state-validation + audit-log + event-emission
pipeline that `applyTransition({ ... })` provides.

**This document is RCA-only.** No code is changed in the same PR as this
report. Per the owner directive, no `applyTransition` migration starts
until each hit has a confirmed cluster, a confirmed blast radius, and a
named first-safe cluster.

## Source references

| Source | Purpose |
|---|---|
| `docs/audit/WORKFLOW_AUDIT.md` | full 111-hit static inventory + state-machine inventory (this RCA's parent) |
| `docs/audit/BYPASS_TRIAGE.md` | classifies the 111 into intentional / legacy / dangerous |
| `audit/system-review/tooling/_bypass-triage.json` | machine-readable triage (the 18 hits below come from `classified[].bucket === "dangerous"`) |
| `artifacts/api-server/src/lib/engines/lifecycleEngine.ts` | `STATE_MACHINES`, `applyTransition`, `isValidTransition` |
| `artifacts/api-server/src/lib/entityRegistry.ts` | per-entity lifecycle block (registry side) |

## What "dangerous" actually loses

For every hit below, the direct `UPDATE` skips four things `applyTransition`
gives you for free:

1. **Engine state-validation** — `isValidTransition(fromState → toState)`
   guard against impossible flips (e.g. `paid → draft`).
2. **Audit-log row** in `audit_logs` carrying `(actor, before, after,
   reason)`. The triage spec for #664 explicitly mentions that direct
   UPDATEs of lifecycle tables don't appear in `audit_logs`, which breaks
   the join the governance reports rely on.
3. **`event_logs` emission** with the canonical past-tense action name
   (see `lib/eventCatalog.ts` + the `check:event-name-tense` guard) — so
   downstream subscribers (notifications, scheduled rule evaluators,
   FNOL/SLA crons) never see the state change.
4. **`onApply(row, client)` side-effects** — cancel pending children,
   reverse GL, free a resource, etc., run inside the same transaction as
   the status flip. Direct UPDATE versions either inline these by hand
   (with all the duplication risk that implies) or skip them entirely.

NOTE: some of the 18 hits below DO emit an event / write an audit row
manually, just not through the engine. The risk is *uniformity*: the
guard suite has no way to know a hand-rolled `INSERT INTO event_logs` is
the moral equivalent of `applyTransition`, so audits will continue to
flag the site, and the next developer who edits the handler may drop the
manual call without realising it was load-bearing.

## Cluster overview

The 18 hits fall into 5 natural clusters by what kind of edit a fix
would be:

| Cluster | Hits | Table(s) | First-safe? |
|---|---:|---|---|
| **A. journal_entries.status flip (approval handoff)** | 4 | `journal_entries` (post-create flip from `draft`→`pending_approval`) | ⚠️ touches the approval pipeline — needs design |
| **B. journal_entries.status flip (cancel/soft-delete)** | 4 | `journal_entries` | ⚠️ touches AR/AP cancel paths — needs design |
| **C. invoices.paidAmount + derived status** | 5 | `invoices` | 🔴 dangerous to migrate naively — derived status is a CASE expression, not a flip |
| **D. side-effect inside another `applyTransition`** | 3 | `journal_entries` / `property_units` / `contract_payment_schedule` | 🟢 candidate for first-safe cluster — already inside a transition's `onApply` |
| **E. one-off cancel/archive flips** | 5 | `hr_leave_requests` x2, `governance_policies`, `umrah_penalties`, `financial_periods` | 🟢 candidate for first-safe cluster — single-row flip with a fixed `toState` |
| TOTAL | 21 (some hits touch 2 dimensions) | | |

*The cluster sum (21) is larger than the hit count (18) because three
hits — the invoice cancel chain in `finance-invoices.ts` 963/968 and the
property unit free in `properties.ts:1591` — sit in both Cluster B and
Cluster D depending on how you count them.*

## Per-hit RCA (18 hits)

### Cluster A — `journal_entries` approval-handoff flip (4 hits)

These four are the same pattern: a `POST /…` handler creates a journal
entry via `financialEngine.postJournalEntry({ ... })` (which writes the
row with `status='draft'`), then calls `initiateApprovalChain({ ... })`,
and if the chain says `requiresApproval`, the handler flips
`status='draft' → 'pending_approval'` directly. The flip is on the row
that was just inserted in the same handler.

| # | File:line | Caller | Surrounding ctx |
|---|---|---|---|
| A1 | `finance-custodies.ts:609` | `POST /finance/custodies` | lines 600-612: `if (approvalResult.requiresApproval) { rawExecute(UPDATE journal_entries SET status='pending_approval' WHERE id=$1 AND status='draft') }` |
| A2 | `finance-journal.ts:528` | `POST /finance/journal/expenses` | one-liner: `if (approvalResult.requiresApproval) { await rawExecute(`UPDATE journal_entries SET status='pending_approval' WHERE id=$1 AND status='draft' …`) }` |
| A3 | `finance-journal.ts:939` | `POST /finance/journal/salary-advances` | identical to A2 plus an `affectedRows` check that throws `NotFoundError` |
| A4 | `finance-invoices.ts:1034` | `invoiceApprovalAction(... 'rejected'/'returned')`, inside an existing `applyTransition.onApply` block | flips the *companion* JE from `posted/approved → cancelled` when the invoice itself is being rejected/returned via the engine |

**Risk profile.** A1–A3 are post-create transitions on a row created by
the engine in the same request. Their state is known (`draft`), the target
is known (`pending_approval`), and `journal_entries.status` IS in
`STATE_MACHINES` (`draft → pending_approval` is allowed). The
*conceptually correct* fix is to push the "if approvalResult.requiresApproval
then flip" decision into `financialEngine.postJournalEntry` itself (so the
engine takes the chain result as an input and writes the right initial
state). A naïve `rawExecute → applyTransition` swap would work but
duplicates engine knowledge in 3 routes — same anti-pattern that produced
the original drift.

A4 is the *opposite* shape — it's an `onApply` side-effect of an
`applyTransition` call on `invoices`. The flip target is the companion JE,
not the invoice. `journal_entries` allows `posted → ?` and `approved → ?`
transitions (per `STATE_MACHINES`); `cancelled` is NOT listed as a valid
target from `posted` or `approved`. So before any fix, the engine state
table itself needs a `posted → cancelled` and `approved → cancelled`
edge added — otherwise `applyTransition` would refuse the flip that the
direct UPDATE silently performs today. **That's a STATE_MACHINES edit,
not just a route edit, which is out of scope for this RCA-only PR per
"no DB / migrations / engine changes".**

### Cluster B — `journal_entries` cancel / soft-delete flip (4 hits)

These four flip `journal_entries.status='cancelled'` (and/or `deletedAt=NOW()`)
on a JE that's being soft-deleted as part of a wider entity delete.

| # | File:line | Caller | Notes |
|---|---|---|---|
| B1 | `finance-invoices.ts:963` | `DELETE /finance/invoices/:id` | flips the JE before the matching invoice flip (B3) — both inside one `withTransaction` |
| B2 | `finance-journal.ts:570` | `DELETE /finance/journal/expenses/:id` | flips JE to `deletedAt=NOW()` only when `status='draft'`; then calls `reverseAccountBalances` outside the txn |
| B3 | `finance-journal.ts:855` | `DELETE /finance/journal/vouchers/:id` | identical shape to B2 but on the voucher delete |
| B4 | `finance-invoices.ts:968` | same `DELETE /finance/invoices/:id` as B1 — flips the *invoice* (companion to B1 on the JE) | inside the same `withTransaction` |

**Risk profile.** B1/B2/B3 sit on the soft-delete path where the engine
state-machine doesn't actually have a `'cancelled'` target from every
source state (`STATE_MACHINES.journal_entries.status: posted → []`). The
direct UPDATE works because there's no engine guard; an
`applyTransition`-based fix would require either (a) widening the JE
state-graph to add `posted → cancelled` (engine change — out of scope),
or (b) accepting that delete is a different lifecycle from
status-transition and using `applyTransition`'s `setExtras` to land
`deletedAt=NOW()` while leaving status alone. **Decision needed before
any line is rewritten** — that's exactly why the owner directive
forbids a blind swap.

B4 has the same shape but on `invoices` — which is also in
`STATE_MACHINES`. The current invoice graph likely doesn't allow
`posted → cancelled` either; same engine-edit dependency.

### Cluster C — `invoices.paidAmount` + derived status (5 hits)

These five touch the `invoices` row but the primary write is
`paidAmount = paidAmount + $1`. The `status` column is updated as a
*side effect* via a `CASE WHEN` expression based on the new paidAmount,
not a flat target state.

| # | File:line | Caller | Status target |
|---|---|---|---|
| C1 | `finance-invoices.ts:752` | `POST /finance/invoices/:id/pay` (payment fully covers total) | `'paid'` + `paidAt=NOW()` |
| C2 | `finance-invoices.ts:757` | same handler, partial payment branch | `'partial'` |
| C3 | `finance-invoices.ts:1197` | `POST /finance/invoices/:id/credit-memo` | `CASE WHEN …>=total THEN 'paid' WHEN …>0 THEN 'partial' ELSE status END` |
| C4 | `finance-invoices.ts:1739` | `POST /finance/customer-advances/apply` (apply advance to invoice) | identical `CASE` to C3 |
| C5 | `finance-invoices.ts:1733` (customer_advances row) ↳ counted separately under "intentional" in the triage — listed here for context because it lives in the same `withTransaction` as C4 | — |

**Risk profile.** This cluster is the most dangerous to migrate. The
`applyTransition` interface takes a fixed `toState` per call — it does
**not** natively support a SQL-side `CASE` expression that derives the
target state from another column in the same UPDATE. To migrate C3/C4 you
would either:

- compute `newStatus` in JS before the UPDATE, then call
  `applyTransition({ toState: newStatus })` — which requires a `SELECT
  paidAmount, total FOR UPDATE` first to avoid races with concurrent
  payments;
- or extend `applyTransition` to accept a `toState: (row) => string`
  resolver — which is an engine change.

C1/C2 are simpler because the JS already computes `newStatus` before the
UPDATE (lines 746-748), but they're inside a `withTransaction` that
already does the `FOR UPDATE` lock — converting only the status flip
would leave the `paidAmount` and `paidAt` writes as a separate UPDATE,
adding a write where there is none. **Net: this cluster needs a design
decision before a migration PR, and is the strongest candidate for "do
not migrate, write a `// bypass-ok: paidAmount + derived status, engine
does not model derived-from-column transitions yet` comment instead."**

### Cluster D — side-effect inside an existing `applyTransition` (3 hits)

These three are already inside an `applyTransition({ ... onApply })`
block — the dangerous UPDATE is the *side effect* the transition triggers,
not the primary state flip. The primary flip is already engine-driven.

| # | File:line | Outer transition | Inner UPDATE |
|---|---|---|---|
| D1 | `finance-invoices.ts:1034` | `invoices status='rejected'/'returned'` (engine-driven) | flips the companion `journal_entries.status='cancelled'` |
| D2 | `properties.ts:1591` | `rental_contracts status='terminated'` (engine-driven, line 1566) | flips `property_units.status='available'` |
| D3 | `properties.ts:3525` *(legacy bucket per triage, but architecturally identical)* | rental contract early-end | flips `contract_payment_schedule.status='cancelled'` |

**Risk profile.** This is the cluster with the lowest blast radius
because the outer transition already carries the audit log + event for
the user-visible change. The inner UPDATE is "free the resource" plumbing
that no end user sees as a separate state change. Two paths exist:

1. **Wrap the inner UPDATE in a nested `applyTransition`** on the
   resource entity — gives engine-validation of e.g. `occupied → available`
   on `property_units`, emits an event for the unit-status change. **But**
   adds a 2nd `applyTransition` per request, doubling audit-log volume on
   what was conceptually one user action. May or may not be desired.
2. **Leave as direct UPDATE, add `// bypass-ok: side-effect of outer
   <entity>.<transition> applyTransition; resource flip is plumbing, not
   a user-visible state change` comment**. Zero behaviour change.
   Documents intent for the next audit.

**Cluster D is the strongest "first-safe" candidate per the owner
directive** — it can be addressed in a single PR that *only* adds
`// bypass-ok` comments + verifies the outer `applyTransition` is the
authoritative audit/event source. No engine edits, no logic change, no
GL impact.

### Cluster E — one-off cancel / archive flips (5 hits)

Single-row status flip with a known target state and a known fromState.
These look like the cleanest `applyTransition` migration candidates on
paper — but each has a subtle gotcha that the RCA needs to record.

| # | File:line | Table | From → To | Surrounding context |
|---|---|---|---|---|
| E1 | `employees.ts:1288` | `hr_leave_requests` | `pending → cancelled` | inside the `DELETE /hr/employees/:id` termination cleanup tx — bulk flip across all the terminated employee's pending leave requests (multi-row, predicate on `"employeeId" = $1`). **Bulk** — `applyTransition` is single-row-by-id, so this would either need a loop (N round-trips) or stay as a documented bulk-operation bypass. |
| E2 | `hr.ts:4151` | `hr_leave_requests` | `pending → deletedAt=NOW()` (soft delete) | inside `DELETE /hr/leave-requests/:id`. Target is soft-delete, not a status flip — same shape as Cluster B's `setExtras: { deletedAt: NOW() }` pattern. The hr_leave_requests state-machine does NOT define a "deleted" terminal state. |
| E3 | `governance.ts:331` | `governance_policies` | `(draft|active) → archived` | inside `POST /governance/policies/:id/new-version` — when a new version is created the parent is archived in the same transaction. **`governance_policies` IS in STATE_MACHINES** and `(draft|active) → archived` IS a valid transition per the engine. Single-row, single id. The cleanest migration candidate in the entire 18-hit set. |
| E4 | `umrah.ts:1393` | `umrah_penalties` | `pending → invoiced` | inside `POST /umrah/agent-invoices` — bulk flip across all `pending` penalties for an `(agent, season)` pair. **Bulk**, predicate is `(agentId, seasonId)`, no single `id`. Same constraint as E1 — would need a loop or a documented bulk bypass. |
| E5 | `finance-journal.ts:1405` | `financial_periods` | `open → closed` | inside `POST /finance/journal/year-end-closing` (`force` branch). Multi-row loop over `missing` periods. Each iteration could call `applyTransition` (single-row) — but the loop body also has an `INSERT` branch when the period doesn't exist, so a clean `applyTransition` swap needs a guard. |

**Risk profile.** Of the 5, only **E3 (`governance_policies`
draft|active → archived)** is unambiguously a single-row engine-blessed
transition with no "bulk" or "soft-delete" or "side-effect" complication.

The other 4 each have a real reason the direct UPDATE was used (E1 + E4
bulk; E2 not actually a status flip; E5 mixed with INSERT branch). Those
are candidates for `// bypass-ok` comments *with the specific reason*,
not for migration.

## First-safe cluster recommendation

Per the owner directive: **no fix lands until RCA confirms first-safe.**

Based on the per-hit analysis above, the safe ordering is:

1. **First PR (zero behaviour change):** Cluster D + the "documented
   bulk-operation" hits in E (E1, E2, E4, E5). Add `// bypass-ok:
   <one-line reason>` comments on each so the triage re-runs and they
   drop out of the dangerous bucket. This is the same engineering-rule
   path the 76 intentional hits already follow. No logic change. No
   engine change. No DB / GL / RBAC change.

2. **Second PR (single-site real migration):** E3 only —
   `governance.ts:331` — migrate to `applyTransition({ entity:
   "governance_policies", fromStates: ["draft","active"], toState:
   "archived", … })`. Single-row, single-id, engine-blessed, no GL, no
   companion-row side effects. This is the proof-of-concept that the
   pattern works in this repo without scope creep.

3. **Third PR (engine extension, requires owner approval):** Cluster A
   refactor — move "if requiresApproval → flip to pending_approval"
   *into* `financialEngine.postJournalEntry` as a parameter. This
   removes the direct UPDATE in A1/A2/A3 by removing the *need* for a
   route-side flip in the first place. A4 is held back until the engine
   change in step 4.

4. **Fourth PR (engine state-graph edit, requires owner approval):**
   Cluster B + A4 — extend `STATE_MACHINES.journal_entries.status` to
   include `posted → cancelled` and `approved → cancelled`. Then migrate
   B1/B2/B3 + A4 to `applyTransition({ setExtras: { deletedAt:
   { raw: "NOW()" } } })`. Same kind of engine edit as PR #654 (which
   relaxed `isValidTransition`). Touches lifecycle semantics — must be
   reviewed against the journal cancel-policy spec.

5. **Fifth PR (engine API extension, requires owner approval):** Cluster C
   — either add `toState: (row) => string` resolver support to
   `applyTransition`, or accept that derived-from-column status writes
   are a separate pattern and add `// bypass-ok: derived status from
   paidAmount, engine API does not support resolver toState` comments.
   Either way: the call is *not* a blind rewrite.

## What is explicitly NOT decided by this RCA

- No engine changes (`lifecycleEngine.ts`, `entityRegistry.ts`).
- No DB migrations.
- No package / lockfile changes.
- No RBAC / authorize edits.
- No GL / finance / business-logic edits.
- No route reorganisation.
- No `applyTransition` migration is started in this PR.
- No `// bypass-ok` comments are added in this PR (that's the first
  follow-up PR, gated on owner approval of the first-safe cluster
  ordering above).
- The 17 `legacy` and 76 `intentional` hits remain out of scope for #664
  per the triage's own scope definition.

## How to refresh this RCA

```bash
# 1. Re-scan for direct UPDATE bypasses
node audit/system-review/tooling/workflow-audit.mjs

# 2. Re-classify into the 3 buckets
node audit/system-review/tooling/bypass-triage.mjs

# 3. Re-read the 18 dangerous hits
node -e 'console.log(JSON.stringify(
  require("./audit/system-review/tooling/_bypass-triage.json")
    .classified.filter(x => x.bucket === "dangerous"), null, 2))'

# 4. Update this file with the new cluster table + per-hit RCA + first-safe call
```

If the headline count moves off 18 between refreshes, the cluster
groupings + first-safe recommendation here must be re-derived — they're
specific to the current 18-hit set.
