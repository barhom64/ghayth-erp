# Issue #664 — Dangerous Direct-UPDATE Bypass RCA

> Root-cause analysis for the **18 hits** the `bypass-triage.mjs` tool
> placed in the `dangerous` bucket. Per the owner directive: analyse each
> hit one-by-one, classify it by *fix-shape*, then open **one** PR for the
> single clearest, lowest-risk cluster — no business-logic change.
>
> This document is the decision record. The PR that ships alongside it
> closes **Class A only** (3 of the 18). The remaining 15 are classified
> and queued; their fixes are deliberately deferred because each carries
> behaviour risk that the first PR is forbidden to take on.

## Method

`workflow-audit.mjs` flags every route-level `UPDATE … status …` that
does not go through `applyTransition`. `bypass-triage.mjs` then sorts the
111 hits into `intentional` / `legacy` / `dangerous`. The `dangerous`
rule is purely structural: *the table is in `STATE_MACHINES`, the hit is
not bulk, not a cron file*. It does **not** inspect what the `UPDATE`
actually does.

So the first job of this RCA was to look at each of the 18 and answer:
**is this even a lifecycle status transition?** It turns out the 18 are
not homogeneous. They split into six fix-shapes:

| Class | Shape | Count | `applyTransition` candidate? |
|---|---|---:|---|
| **A** | Detector false positive — `status` only in the `WHERE` guard, never assigned | 3 | No — nothing to migrate |
| **B** | Soft-delete **+** `status='cancelled'` bundled together | 2 | No — engine has no soft-delete |
| **C** | Payment write — `paidAmount`/`paidAt` arithmetic, `status` derived via `CASE` | 4 | No — engine cannot compute `paidAmount` |
| **D** | Pure single-row conditional `status` flip | 4 | **Yes** — but behaviour-affecting |
| **E** | Bulk cascade — multi-row `WHERE` (not `id = $`) | 3 | No — engine is per-row |
| **F** | Transaction-internal cascade — side-effect inside a parent op that already audits | 2 | No — parent already covers it |

The headline finding: **only 4 of the 18 (Class D) are genuine
`applyTransition` migration candidates.** The triage heuristic
over-counted; "18 dangerous" was never "18 things to migrate".

## The 18 hits

### Class A — Detector false positives (3) — **closed by this PR**

| # | Site | Table | `UPDATE` shape |
|---|---|---|---|
| 1 | `finance-journal.ts:570` | `journal_entries` | `SET "deletedAt" = NOW() WHERE id = $1 … AND status = 'draft'` |
| 2 | `finance-journal.ts:855` | `journal_entries` | `SET "deletedAt" = NOW() WHERE id = $1 … AND status = 'draft'` |
| 3 | `hr.ts:4151` | `hr_leave_requests` | `SET "deletedAt" = NOW() WHERE id = $1 … AND status = 'pending'` |

**Analysis.** None of these three assign a status-like column. Each is a
plain soft-delete (`SET "deletedAt" = NOW()`). The token `status` appears
*only in the `WHERE` clause* as a precondition guard — "only soft-delete
a row that is still `draft`/`pending`". That is correct, defensive SQL,
not a lifecycle transition.

They were flagged because the detector regex —
`/\bSET\b[\s\S]{0,160}…status…=/` — matched `status =` anywhere within
160 characters of `SET`, including past a `WHERE`. The regex's *intent*
was "status assigned in the SET list"; its *effect* was "status
mentioned anywhere nearby".

**Verdict: detector drift, not code drift.** The fix is a tooling
correctness change, not a route change.

**Action taken (this PR):** the detector regex was tightened with a
tempered token — `(?:(?!\bWHERE\b)[\s\S]){0,160}` — so the 160-char run
cannot cross a `WHERE`. The new pattern is a strict subset of the old: it
can only *remove* matches, never add. The three route files are **not
touched** — their code was correct all along.

**Blast radius:** zero on runtime behaviour (no application code
changed). On the audit: total hits 111 → 106, `dangerous` 18 → 15.

**Confidence: very high.** The regex change is provably a subset
(verified against all 18 snippets); the three sites are unambiguous
soft-deletes.

> **Detector collateral (honest disclosure).** Tightening the regex also
> dropped **2 hits outside the `dangerous` bucket**:
> - `hr.ts:6244` — `UPDATE employee_assignments SET "branchId"=…,"jobTitle"=…,salary=…`. Genuine false positive — same shape as Class A (`status` only in the `WHERE`). Correctly dropped.
> - `hr.ts:2722` — `UPDATE hr_employee_loans … SET … status = CASE … END …` (a multi-line bulk loan-reconciliation sweep). This **is** a genuine status write, but the `status = CASE` assignment sits on line 4 of a 10-line statement — outside the detector's fixed 2-line read window. The old regex matched it only *coincidentally*, via a sub-query's `WHERE … status = 'paid'` token. The new regex correctly refuses to treat a `WHERE` token as an assignment, so the coincidental match is gone. This hit was already `intentional` (a documented bulk sweep); no fix was ever required for it. The detector's inability to see line 4 of a multi-line `UPDATE` is a **pre-existing limitation**, recorded under *Residual* below — it is not introduced by this change.

### Class B — Soft-delete + status (2) — deferred

| # | Site | Table | `UPDATE` shape |
|---|---|---|---|
| 4 | `finance-invoices.ts:963` | `journal_entries` | `SET "deletedAt" = NOW(), status = 'cancelled' WHERE id = $1` |
| 5 | `finance-invoices.ts:968` | `invoices` | `SET "deletedAt" = NOW(), status = 'cancelled' WHERE id = $1` |

**Analysis.** Here `status = 'cancelled'` *is* in the `SET` list, so they
are not false positives — but the status write is bundled into a
soft-delete. `applyTransition` has no soft-delete path; it would set
`status` but never `deletedAt`. Migrating would either split one atomic
delete into two writes or need an `onApply` hook to do the `deletedAt`
write — extra surface for no invariant gain. These run inside the invoice
soft-delete flow which already emits an invoice event.

**Recommendation:** `bypass-ok` comment documenting that the cancel is
part of deletion, not a standalone transition. Low priority. Not in this
PR — touching `finance-invoices.ts` here means editing a financial route
with no behaviour benefit.

**Blast radius:** GL + invoice ledger. **Confidence: high** on
classification, medium on "no action needed".

### Class C — Payment write, status derived (4) — deferred, *not* a migration candidate

| # | Site | Table | `UPDATE` shape |
|---|---|---|---|
| 6 | `finance-invoices.ts:752` | `invoices` | `SET "paidAmount" = $1, status = $2, "paidAt" = $3` |
| 7 | `finance-invoices.ts:757` | `invoices` | `SET "paidAmount" = $1, status = $2` |
| 8 | `finance-invoices.ts:1197` | `invoices` | `SET "paidAmount" = COALESCE("paidAmount",0)+$1, status = CASE …` |
| 9 | `finance-invoices.ts:1739` | `invoices` | `SET "paidAmount" = COALESCE("paidAmount",0)+$1, status = CASE …` |

**Analysis.** These record a payment / credit-memo / customer-advance
application. `status` is **derived from money arithmetic** — `CASE WHEN
paidAmount >= total THEN 'paid' WHEN paidAmount > 0 THEN
'partially_paid' …`. The status is an *output* of the payment math, not
an independent transition. `applyTransition` cannot compute `paidAmount`
and must not — pushing payment arithmetic into the lifecycle engine
would be exactly the "GL/business-logic rewrite" the directive forbids.

**Recommendation:** `bypass-ok` comment. These are correct as written;
the audit should stop calling them dangerous. **Not** an
`applyTransition` candidate under any reading. Not in this PR.

**Blast radius:** invoice payment ledger. **Confidence: very high** —
these are categorically the wrong shape for the engine.

### Class D — Pure single-row status flip (4) — **the genuine migration candidates, deferred to a follow-up PR**

| # | Site | Table | `UPDATE` shape |
|---|---|---|---|
| 10 | `finance-custodies.ts:609` | `journal_entries` | `SET status = 'pending_approval' WHERE id = $1 AND status = 'draft'` |
| 11 | `finance-journal.ts:528` | `journal_entries` | `SET status = 'pending_approval' WHERE id = $1 AND status = 'draft'` |
| 12 | `finance-journal.ts:939` | `journal_entries` | `SET status = 'pending_approval' WHERE id = $1 AND status = 'draft'` |
| 13 | `finance-invoices.ts:1034` | `journal_entries` | `SET status = 'cancelled' WHERE id = $1 AND status IN ('posted','approved')` |

**Analysis.** These four *are* clean, single-row, conditional status
transitions — the real shape `applyTransition` was built for.

- #10–12 are all the same pattern: right after `initiateApprovalChain`
  reports `requiresApproval`, the entry is bumped `draft →
  pending_approval`. The route then emits a `*.created` event, so the
  *creation* is audited — but the `draft → pending_approval` hop itself
  skips engine validation and has no dedicated audit row.
- #13 is the GL-reversal leg of invoice rejection: `journal_entries
  posted/approved → cancelled`. The parent action (invoice reject) is
  *already* an `applyTransition`; this is its cascade.

**Why deferred, not in this PR:** migrating these is the *correct*
long-term fix, but it is **not zero-behaviour-change**. Routing them
through `applyTransition` adds engine `fromState` validation and writes
new audit/event rows that do not exist today. That is a behaviour change
— defensible, but it needs its own PR with before/after evidence, and
the directive caps the first PR at "no business-logic change". #13 in
particular needs the `journal_entries` state graph checked for a
`posted/approved → cancelled` edge before it can be migrated safely.

**Recommendation:** dedicated follow-up cluster PR (`#664` part 2) —
migrate #10–12 together (identical pattern), evaluate #13 separately
after confirming the engine graph. **Confidence: high** that these are
migratable; **medium** on effort until the graph is verified.

### Class E — Bulk cascade (3) — deferred, keep as bulk

| # | Site | Table | `UPDATE` shape |
|---|---|---|---|
| 14 | `employees.ts:1288` | `hr_leave_requests` | `SET status = 'cancelled' WHERE "employeeId" = $1 AND status = 'pending'` |
| 15 | `umrah.ts:1393` | `umrah_penalties` | `SET status = 'invoiced', "invoiceId" = $1 WHERE "agentId" = $2 AND "seasonId" = $3 AND status = 'pending'` |
| 16 | `finance-journal.ts:1405` | `financial_periods` | `SET status = 'closed', "closedAt" = NOW() … WHERE id = $2 AND status = 'open'` (loop over missing periods) |

**Analysis.** Multi-row updates keyed on something other than `id` (an
employee's whole pending-leave set on termination; an agent/season's
pending penalties on bulk invoicing; the missing-period sweep inside
year-end force-close). `applyTransition` is a per-row contract — looping
it row-by-row here would be slower with no semantic gain, and the
triage's own `intentional` rule already says bulk operations belong
there.

**Recommendation:** `bypass-ok` comment per hit (the engineering rule for
intentional bulk). Effectively these are mis-bucketed `intentional`
hits. Not in this PR. **Confidence: high.**

### Class F — Transaction-internal cascade (2) — deferred, keep

| # | Site | Table | `UPDATE` shape |
|---|---|---|---|
| 17 | `governance.ts:331` | `governance_policies` | `SET status = 'archived' WHERE id = $1 AND status IN ('draft','active')` |
| 18 | `properties.ts:1591` | `property_units` | `SET status = 'available' WHERE id = $1 AND status IN ('occupied','rented')` |

**Analysis.** Both are side-effects *inside* a parent operation that is
already governed:
- #17 runs in `withTransaction` when a new policy version is created —
  the previous version is archived in the same transaction; the route
  audits/emits the primary "new version" action.
- #18 runs inside the `onApply` hook of an existing `applyTransition`
  (property-contract termination) — the unit is freed as a documented
  lifecycle side-effect of a transition that is *already* engine-driven
  and audited.

Re-routing the cascade through a second nested `applyTransition` would
add a nested transaction for no invariant gain.

**Recommendation:** `bypass-ok` comment. #18 in particular is close to a
false positive — it is inside a lifecycle hook. Not in this PR.
**Confidence: high.**

## What this PR ships

**One change, one cluster: Class A (3 hits).**

- `audit/system-review/tooling/workflow-audit.mjs` — detector regex
  tightened (tempered against `WHERE`). One logical line.
- `_workflow-audit.json`, `_bypass-triage.json`, `WORKFLOW_AUDIT.md`,
  `BYPASS_TRIAGE.md` — regenerated artefacts.
- This RCA document.

**No route file is touched. No business logic changes. No DB migration.**

## Before / after

```
node audit/system-review/tooling/workflow-audit.mjs
node audit/system-review/tooling/bypass-triage.mjs

                       before   after
  direct UPDATE hits     111      106     (−5)
  dangerous bucket        18       15     (−3)
  intentional bucket      76       74     (−2)
  legacy bucket           17       17
```

The `dangerous` drop (−3) is exactly Class A. The two further drops are
the detector collateral disclosed above (`hr.ts:6244` genuine FP,
`hr.ts:2722` coincidental match) — both already non-dangerous.

## Residual

- **15 dangerous hits remain** (Classes B–F). They are classified and
  queued above. Class D (4 hits) is the only genuine `applyTransition`
  work and is the natural next PR; B/C/E/F want `bypass-ok` comments
  rather than migration.
- **Detector multi-line limitation.** `scanDirectStatusUpdates` reads
  only the hit line + 1. A multi-line `UPDATE` whose `status =`
  assignment falls on line 3+ (e.g. `hr.ts:2722`) is not reliably
  detected. Widening the window risks a broad, unpredictable count
  change, so it is deliberately *not* done here — logged as a known gap.
- The `bypass-triage.mjs` classifier still buckets purely on table
  membership; it does not yet read the fix-shape classes in this RCA.
  Teaching it the six classes is a possible future tooling improvement.
