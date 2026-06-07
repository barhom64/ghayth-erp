# Ghaith System Sweep — Layer Audit (measured, not reported)

**Date:** 2026-05-31 · **Base:** `main` @ `fca26b6` · **Method:** every number below
was produced by a script in `scripts/src/` run against the current tree, not
copied from a prior report. Re-run any figure with the command shown.

> Convention: ✅ enforced by a CI guard · 📊 measured/report-only · ⚠️ open item.

---

## 0. New durable audit tooling added by this sweep

| Tool | Purpose | Gate |
|---|---|---|
| `scripts/src/audit-event-bus.mjs` | emit↔subscribe reconciliation (dynamic-dispatch aware) | ✅ fails on any provably-dead handler |
| `scripts/src/audit-api-consumption.mjs` | reverse API audit — backend endpoints no SPA call consumes | 📊 report-only |

Both supersede ad-hoc greps; they resolve the dynamic forms (ternary `action:`,
hoisted `const action`, template literals `` `x.${v}` ``, mount-prefix
resolution, `useApiQuery`/`useApiMutation` 2nd-arg URLs) that made earlier
hand counts wrong.

---

## 1. API Drift  ✅
`pnpm audit:wiring` · `pnpm audit:route-doubling` · `pnpm audit:domain-routes`

- Every frontend `apiFetch`/hook URL resolves to a real backend route+method — **0 unresolved**.
- URL-doubling (`/foo/foo`) — **0**.
- 14 domains, 12 route files — **all mounted** in `routes/index.ts`.

## 2. Frontend Drift  ✅ / ⚠️
`pnpm audit:routes` · `pnpm audit:sidebar`

- **594/594** page files imported & wired — **0 orphan pages**.
- ⚠️ 3 pages reachable by route but absent from sidebar navigation:
  `/fleet/tires`, `/hr` (index), `/legal` (index). Direct-access only — cosmetic.

## 3. Event Bus  ✅
`node scripts/src/audit-event-bus.mjs`

- **211** `eventBus.on()` subscriptions · **716** resolvable emit names.
- **0 provably-dead handlers** (subscribed event whose name appears in no file
  outside `eventListeners.ts`/`eventCatalog.ts`).
- **1** flagged for dynamic-dispatch verification — `purchase_request.rejected`
  — **confirmed live**, emitted via `` `purchase_request.${newStatus}` ``
  (finance-purchase.ts:553).

**Correction of record:** an earlier heuristic mis-reported ~26 "dead" handlers.
Actual measurement proved all are dispatched (ternary/template/config emits),
e.g. `umrah.overstay.detected`/`umrah.absconder.detected` fire from
`umrahImportEngine` via a hoisted `eventName` variable. **No dead handlers
exist.**

## 4. RBAC  ✅
`pnpm audit:stop-ship`

- **832** write endpoints — **100% guarded**. **847** read endpoints.
- **0 critical violations · 0 warnings.**

## 5. Workflow / Journey Coverage  ✅ / ⚠️
- `workflowEngine` — **wired & active** (imported by ≥7 route files: hr, hr-loans,
  hr-overtime, hr-exit, finance-purchase, workflows, cronScheduler).
- ⚠️ `journeyEngine` — **Reserved/Planned** (fully implemented, **0 callers**).
  Documented as Reserved in code; its table `journey_instances` materialised by
  **migration 248** (PR #1506). 20 journey `requiredEvent`s are roadmap-reserved.

## 6. Database Constraint  📊
From `db/schema_pre.sql` + `db/schema_post.sql`.

| Metric | Value |
|---|---|
| Tables | 388 |
| Foreign keys | 474 |
| Tables with PRIMARY KEY | 373 / 388 |
| Tables with `companyId` (tenant isolation) | **327 / 388** |
| **Tables without PK** | **15** |

The 15 PK-less tables, classified by verified characteristic:
- **Append archives — intentional** (no PK by design): `audit_logs_archive`, `integration_logs_archive`.
- **Sequence-backed `id` — safe to add PK in a reviewed DBA migration**:
  `budget_approval_requests`, `numbering_assignments`, `numbering_audit_logs`,
  `numbering_counters`, `numbering_schemes`, `vendor_contracts`.
- **Natural/composite-key — needs key analysis before any PK**:
  `accounting_allocation_results`, `accounting_allocation_rules`,
  `umrah_attachments`, `umrah_import_mapping_presets`, `wht_categories`,
  `fleet_alerts`, `tax_codes`.

⚠️ Deliberately **not** auto-migrated: `ALTER TABLE … ADD PRIMARY KEY` on a
populated production table fails irreversibly on any legacy duplicate/NULL id —
out of scope for an automated sweep; tracked as a reviewed DBA task.

## 7. Reverse API Consumption  📊
`node scripts/src/audit-api-consumption.mjs`

- **1213** SPA-facing backend endpoints · **1021** distinct frontend call URLs.
- **166** endpoints unconsumed by any `apiFetch`/`useApiQuery`/`useApiMutation`
  — candidates only: many are reached outside `apiFetch` (file downloads via
  `window.open`/`<a href>`, PDF/preview links) or are genuinely legacy. Use as
  a triage list, not a kill list.

---

## Cumulative findings

| Category | Result |
|---|---|
| **Dead code** | `journeyEngine` only (now Reserved-documented). **0** dead event handlers. **0** orphan pages. |
| **Duplicates** | Migration *number* overlaps across parallel branches — acceptable (basenames unique, deterministic order). **0** duplicate route paths. |
| **Unused routes** | **0** orphan pages; all domain route files mounted. |
| **Unconnected services** | `journeyEngine` (Reserved). All other engines wired (namespace/direct import). |
| **Unconsumed APIs** | 166 SPA-unconsumed candidates (triage; incl. non-`apiFetch` download links). |
| **Unconnected UI** | 3 pages route-reachable but not in sidebar nav. |
| **Ghaith architecture conflicts** | ✅ no cross-domain writes, ✅ all numbering via the center, ✅ GL boundary clean, ✅ 327/388 tenant-scoped. Only schema-discipline gap (`journey_instances`) — closed in PR #1506. |

## Status alignment (measured ⇒ your estimate)
- **Architectural foundation 90–93%** — corroborated: boundaries, numbering,
  RBAC-guarding (832/832), tenant isolation (327/388), event bus (0 dead) all clean.
- **Operational 80–85%** — remaining gaps are operational, not structural:
  3 nav entries, 15 PK-less tables, 166 API-triage candidates, 1 reserved engine.
- **Pilot launch: YES** — 0 critical RBAC violations, 0 dead handlers, schema
  drift 0, build + 6325 tests green.
- **Full commercial: not yet** — open rounds: Data-Integrity (PK + natural keys),
  Reverse-API triage, nav completeness, journey-engine activation.

---

## Follow-up workflow (tracked)

| # | Item | Owner-type | Risk | Status |
|---|---|---|---|---|
| F1 | Wire `audit-event-bus` into CI guard | tooling | none | ✅ this sweep |
| F2 | Triage the 166 reverse-API candidates → delete legacy / annotate download links | per-domain | low | ⬜ |
| F3 | PK on the 6 sequence-backed tables (reviewed migration, verify no dup/NULL on live) | DBA | medium | ⬜ |
| F4 | Natural-key decision for the 7 composite tables | DBA + domain | medium | ⬜ |
| F5 | Add 3 pages to sidebar or annotate as direct-access | frontend | low | ⬜ |
| F6 | Journey-engine activation (wire emitters for 20 reserved events) or formal deferral | product | low | ⬜ |
