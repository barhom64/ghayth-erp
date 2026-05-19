# Issue #663 — fromState Graph Mismatch RCA

> Root-cause analysis for the 8 route-vs-engine fromState mismatches
> surfaced by `workflow-audit.mjs`. PRs #667 (2 fixes) and this change
> (6 fixes) close all 8. Generated as the decision record the owner
> asked for: "RCA منفصل لكل mismatch، ثم نقرر tighten route أو widen
> engine لكل حالة بشكل مستقل."

## Method

For each mismatch the question is binary:

- **Route drift** — the route declares a `fromState` that shouldn't be
  legal. Fix: tighten the route's `fromStates` whitelist.
- **Engine drift** — the engine's `STATE_MACHINES` transition graph is
  too strict; the transition the route declares is legitimate.
  Fix: widen the engine graph (surgical edge addition, not a rewrite).

The decision is made on **business semantics**, not on what's easier.

## The 8 findings

### Closed by PR #667 (route drift — 2)

| # | Site | Verdict | Fix |
|---|---|---|---|
| 1 | `finance-invoices.ts:587` `invoices sent→approved` | route drift — a sent invoice is committed to the customer; reverse-approval is not in the accounting model | dropped `sent` from `fromStates` |
| 2 | `legal.ts` terminate `draft→terminated` | route drift — drafts are *cancelled*, not *terminated* | dropped `draft` from `fromStates` |

### Closed by this change (engine drift — 6)

| # | Site | Verdict | Fix |
|---|---|---|---|
| 3 | `fleet.ts:1504` `fleet_maintenance scheduled→completed` | **engine drift** | engine: `scheduled` += `completed` |
| 4 | `hr-discipline.ts:1000` `hr_inquiry_memos pending_employee→cancelled` | **engine drift** | engine: `pending_employee` += `cancelled` |
| 5 | `hr-discipline.ts:1000` `hr_inquiry_memos pending_manager→cancelled` | **engine drift** | engine: `pending_manager` += `cancelled` |
| 6 | `hr-discipline.ts:1000` `hr_inquiry_memos pending_gm→cancelled` | **engine drift** | engine: `pending_gm` += `cancelled` |
| 7 | `legal.ts:469` `legal_contracts active→active` | **engine drift** | engine: `active` += `active` (renewal self-loop) |
| 8 | `legal.ts:469` `legal_contracts expired→active` | **engine drift** + minor route drift | engine: `expired` += `active`; route drops `draft` |

## Detailed RCA

### #3 — fleet_maintenance: scheduled → completed

**Route** (`fleet.ts:1504`, action `fleet.maintenance.completed`): allows `["scheduled", "in_progress"]`.
**Engine** (`fleet_maintenance`): `scheduled: ["in_progress", "cancelled"]` — no `completed`.

**Business semantics**: A short maintenance job — oil change, tyre rotation, light inspection — is scheduled and then completed in one operator action. Forcing it through an explicit `in_progress` state adds a click with zero business value. The `/complete` route already guards `status` (rejects already-completed and cancelled records) and runs meaningful side-effects (vehicle → available, journal entry for cost). The engine's two-hop assumption was the artefact.

**Verdict: ENGINE drift.** Added `completed` to `scheduled:` targets.

### #4-6 — hr_inquiry_memos: pending_* → cancelled

**Route** (`hr-discipline.ts:1000`, action `hr.memo.cancelled`): allows `["draft", "pending_employee", "pending_manager", "pending_gm"]`.
**Engine** (`hr_inquiry_memos`): `cancelled` is a declared state (`cancelled: ["closed"]`) but was only reachable from `draft`.

**Business semantics**: A disciplinary inquiry memo can be raised in error or become moot at any review stage. The `/memos/:id/cancel` route is the documented escape hatch — HR withdraws the memo, unlinks the related violation, logs the event. This is legitimate at the employee-response, manager-review, and GM-review stages. Once the memo is `approved`/`rejected`/`closed` it's finalised and a different lifecycle (appeal/closure) applies — cancellation no longer fits, and the engine correctly omits those.

**Verdict: ENGINE drift.** The `cancelled` state existed but the three `pending_* → cancelled` edges were missing. Added them.

### #7-8 — legal_contracts: active→active and expired→active (renewal)

**Route** (`legal.ts:469`, action `legal.contract.renewed`): allowed `["active", "draft", "expired"]` → `active`.
**Engine** (`legal_contracts`): `active: ["terminated","expired","renewed"]`, `expired: ["renewed"]` — modelled renewal via a transient `renewed` state.

**Business semantics**: The renew route extends `endDate`, bumps `renewalCount`, optionally updates `value`. For an **active** contract, renewal is status-preserving — it stays active; the engine needed a self-loop. For an **expired** contract, renewal reactivates it — `expired → active` is the real transition. The engine's `renewed` state is a transient nothing actually rests in (`renewed: ["active"]` immediately bounces back), so the route's direct `→ active` is the pragmatic and correct path.

The route's `draft` fromState is a **minor route drift**: a draft contract was never in force, so it is *activated* (`draft → active`, already legal), not *renewed*. Dropped from the route whitelist.

**Verdict: ENGINE drift (primary) + route drift (the `draft` entry).** Widened engine: `active` += `active`, `expired` += `active`. Tightened route: `fromStates` → `["active", "expired"]`. The legacy `renewed` state is kept so any existing data in that state still has a path out.

## Why "widen engine" was the right call for 6 of 8

The earlier guidance was "no engine widening, no broad lifecycle rewrites." That guidance was about avoiding *speculative* state-machine changes. These six are different: each is a **surgical single-edge addition** justified by a documented route + business reality. The RCA is the evidence; widening the graph to match a legitimate, already-shipped route is reconciliation, not a rewrite.

Routes were the source of truth for #1-2 (PR #667) because the route declared something the business model rejects. For #3-8 the *route* reflects the business model and the *engine graph* was the stale artefact.

## Verification

```
node audit/system-review/tooling/workflow-audit.mjs
  Before: 6 × fromState graph mismatch
  After:  0 × fromState graph mismatch
```

- `pnpm typecheck` (api-server): clean.
- `bash scripts/guard.sh`: green.

## Residual

None for fromState mismatches — the category is at **0**. The remaining
workflow-audit findings (`registered-but-unused`, `used-but-unregistered`,
`registry-engine mismatch`, `direct status UPDATE bypass`) are tracked
separately under #664 / #665.
