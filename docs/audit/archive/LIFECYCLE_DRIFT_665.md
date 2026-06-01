# Task #665 — Lifecycle State Drift Report (entityRegistry ↔ STATE_MACHINES)

**Generated:** 2026-05-20 · **Mode:** report-only (lifecycle changes banned by standing directive)
**Sources:**
- `artifacts/api-server/src/lib/entityRegistry.ts` — declarative entity catalog (`lifecycle.states[]`)
- `artifacts/api-server/src/lib/lifecycleEngine.ts` — enforcement layer (`STATE_MACHINES[].transitions`)
- Extraction script: `/tmp/extract-drift.mjs` (raw output `/tmp/drift.json`)

## Headline

| Metric | Count |
|--------|-------|
| Entities in `entityRegistry.ts` with declared lifecycle states | **32** |
| State-machine blocks in `lifecycleEngine.ts` (entity + statusColumn pairs) | **28** |
| **Drifted entities** (no machine OR state-set mismatch) | **26** |
| **Orphan machines** (machine exists but no matching registry entry) | **16** |

Both layers are out of sync with each other — neither is the canonical source of truth today. The registry is consulted by the frontend (entity routes, status badges) and the engine is consulted by route handlers via `STATE_MACHINES_BY_KEY` at runtime. Drift means a state legal per registry may be rejected by the engine (or vice versa) at transition time.

## 26 Drifted Entities

### Class A — Registry declares lifecycle, NO matching state-machine exists (20)

The frontend will render status badges/transitions for these states, but **no transition rules are enforced server-side** when a state mutation occurs. Falls through `lifecycleEngine` to "no enforcement" branch.

| Table | statusColumn | Registry states |
|---|---|---|
| `employees` | `approvalStatus` | draft, pending_approval, approved, rejected, signed, active, terminated |
| `hr_attendance_records` | status | pending, approved, rejected |
| `hr_official_letters` | status | pending, approved, rejected, printed |
| `hr_loans` | status | pending, approved, rejected, active, completed |
| `employee_transfers` | status | pending, approved, rejected, completed |
| `hr_excuse_requests` | status | pending, approved, rejected |
| `payroll_runs` | status | draft, calculated, approved, posted, paid |
| `hr_evaluation_cycles` | status | draft, approved, rejected, returned, sent, partial, paid, overdue, cancelled, closed, posted ⚠️ *contains finance-vocabulary states; likely copy-paste from invoices* |
| `expense_claims` | status | pending, approved, rejected, paid |
| `custodies` | status | pending, approved, rejected, settled |
| `salary_advances` | status | pending, approved, rejected, deducted |
| `payment_vouchers` | status | draft, approved, posted, cancelled |
| `chart_of_accounts` | status | scheduled, in_progress, completed, cancelled ⚠️ *finance master-data with maintenance-job states; almost certainly wrong* |
| `fleet_fuel_logs` | status | active, expired, cancelled, renewed ⚠️ *contract states applied to fuel logs; wrong* |
| `property_buildings` | status | draft, active, terminated, expired, renewed, cancelled |
| `maintenance_requests` | status | pending, approved, in_progress, completed, cancelled |
| `clients` | status | prospecting, qualification, proposal, negotiation, won, lost ⚠️ *opportunity pipeline applied to clients; mis-mapped* |
| `warehouse_products` | status | draft, in_progress, pending_approval, approved, cancelled ⚠️ *request states applied to product master; wrong* |
| `store_orders` | status | pending, confirmed, processing, shipped, delivered, cancelled |
| `projects` | status | draft, confirmed, partial, paid, cancelled ⚠️ *invoice states applied to projects; wrong* |

⚠️ flags = registry entries that appear copy-pasted from a sibling entity. Owner should review before any state-machine work.

### Class B — Both layers exist but state SETS diverge (6)

These have enforcement, but the engine and registry disagree on which states are legal. Most-common pattern: engine declares a transition state (`returned`, `pending_approval`) the registry doesn't list, so the frontend can't render it.

| Table | statusColumn | Only in registry | Only in state-machine |
|---|---|---|---|
| `hr_leave_requests` | status | — | returned |
| `hr_inquiry_memos` | status | issued, acknowledged, appealed, escalated, gm_review, justified | pending_employee, pending_manager, pending_gm, approved, rejected, appeal_pending, appeal_accepted, cancelled |
| `journal_entries` | status | reversed | approved, returned |
| `purchase_orders` | status | — | pending, sent, confirmed, invoice_matched, invoice_mismatch, payment_scheduled, returned |
| `budgets` | status | — | returned |
| `umrah_seasons` | status | draft, active | open, closed |

**`hr_inquiry_memos` is the most severe** — the two layers describe **completely different lifecycles**. Either the registry was rewritten without touching the engine, or a refactor split the entity in two. Owner approval needed before reconciling.

**`umrah_seasons`** maps directly to the dynamic emit caveat in `UMRAH_EVENTS_DRIFT_684.md` — the route emits `umrah.season.${b.status}` where `b.status` is one of `open|closed`, but the registry says `draft|active`. Three layers (registry, engine, emit) disagree on this entity's lifecycle.

## 16 Orphan State Machines (no registry entry)

The engine enforces transitions for these tables but no `entityRegistry` entry exists, so the frontend has no rendering metadata and these entities don't appear in the entity browser:

`invoices#status`, `journal_entries#approvalStatus`, `fleet_trips#status`, `property_contracts#status`, `property_units#status`, `crm_opportunities#status`, `workflow_instances#status`, `umrah_sales_invoices#status`, `umrah_pilgrims#status`, `umrah_agents#status`, `umrah_transport#status`, `governance_policies#status`, `financial_periods#status`, `fleet_traffic_violations#status`, `umrah_penalties#status`, `umrah_agent_invoices#status`

Note: `invoices` is the most surprising — there IS an entityRegistry entry for `invoices` (table `invoices`, statusColumn `status`) AND a STATE_MACHINE for `invoices#status`. The cross-match shows them as drifted, not orphan. Re-checking the extractor: `journal_entries` has **two** STATE_MACHINE entries (one per statusColumn) — orphan flag is correctly raised only on the `approvalStatus` variant that has no registry counterpart.

## Recommended action (owner approval required)

Every fix below modifies lifecycle metadata or state-machine transitions, which is blocked by the current standing directive (no lifecycle changes):

1. **Class A — add 20 state machines OR remove lifecycle from registry.** For each entity, decide:
   - Is this entity actually approval/workflow-managed? → add `STATE_MACHINES` block with transition rules.
   - Is the `status` column just a tag/category (e.g. `chart_of_accounts.status`)? → remove `lifecycle:` from the registry entry to stop falsely advertising transitions.
   - 7 entries flagged ⚠️ — copy-paste suggests the registry author cloned a sibling entity and forgot to rewrite states. **Do not add state machines for these without first verifying actual product intent.**
2. **Class B — reconcile to a single source of truth.** Hardest: `hr_inquiry_memos` (8 vs 6 mismatched states). Easiest: add `returned` to registry for `hr_leave_requests` / `budgets` to match engine.
3. **Orphans — add registry entries** for the 15 truly-orphan tables so they appear in the entity browser and get status badges. `journal_entries#approvalStatus` is fine as-is (orphan-by-design, single registry entry covers both statusColumns via lifecycle on the primary).
4. **Add a guard `check:lifecycle-drift`** following the `check:event-name-tense` pattern: parse both files, fail on any drift, allowlist for legitimate exceptions (`journal_entries#approvalStatus` etc).

## Self-verification

Re-run `node /tmp/extract-drift.mjs` against any future branch — output JSON at `/tmp/drift.json`. Adapt into `scripts/src/check-lifecycle-drift.mjs` for CI (template: `scripts/src/check-event-name-tense.mjs`). Out of scope for this report.
