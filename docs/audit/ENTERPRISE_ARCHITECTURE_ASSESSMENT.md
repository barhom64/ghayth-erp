# Ghaith as an Enterprise Platform — Architectural Assessment

**Date:** 2026-06-03 · **Base:** `main` @ `7de56e2` · **Method:** every verdict
below is grounded in a code/schema measurement run this session (commands in
each row), not in prior reports or assumptions.

This answers the 14 enterprise-platform questions and your priority ranking,
with the honest focus you asked for: **the two real structural fears are #1
Party Model and #2 Organization-as-security-boundary. Almost everything else
already exists in some maturity** — the system is further along as a platform
than the "scattered features" worry implies.

---

## Verdict table (measured)

| # | Pillar | Reality on `main` | Maturity | Verdict |
|---|---|---|---|---|
| 1 | **Party / Master-Data Model** | **No `party`/`person` table.** employees, users, clients, suppliers, umrah_agents, umrah_sub_agents, umrah_pilgrims, property_owners, fleet_drivers, tenants are **10 independent tables**; only `users.employeeId` links any two. | **❌ Absent** | **Biggest structural gap. Confirmed.** |
| 2 | **Organization Model** | company → branch → department (department has `parentId` for sub-depts) exist. **No teams/divisions/sections.** RBAC scope = `allowedCompanies` + `allowedBranches` + `allowedAssignments`; **department is NOT a security boundary.** | **🟡 Partial (3 levels, 2 enforced)** | **Second structural gap.** |
| 3 | **Approval Engine** | `workflowEngine.ts` + `approval_chains`/`approval_chain_steps`/`approval_requests`/`approval_actions`. Routed through it: PO, loan, overtime, exit, + generic `workflows`. HR leave keeps extra `leave_approval_stages`. | **🟢 Unified core (~6 flows)** | Better than feared; finish coverage (expense/custody/contract/leave onto one path). |
| 4 | **Task Center** | `/action-center` aggregates **15 sources** (leave, overtime, loans, excuses, exits, memos, transfers, expense_claims, inventory_counts, journal_entries, maintenance, official_letters, purchase_orders, notifications…). `/inbox` exists. | **🟢 Exists & broad** | Much better than feared; polish UX + add missing sources. |
| 5 | **Notification Center** | `notificationEngine.ts` with **Email / InApp / Push / WhatsApp / SMS** channels from one engine. | **🟢 Unified multi-channel** | Solid. Verify all flows publish through it. |
| 6 | **Global Search** | `/search` router exists. Covers **5 entities**: clients, employees, fleet_vehicles, invoices, umrah_pilgrims. | **🟡 Exists, partial** | Extend to cases, contracts, custody, agents, properties, trips. |
| 7 | **Document Service** | `documents` route + `documentAcl.ts` (per-doc access control, mig 242) + prior `umrah_attachments` unification. | **🟢 Largely unified** | Confirm every module writes via it (HR/legal/properties/transport). |
| 8 | **Financial Impact / GL** | `lib/gl/` = `posting.ts` + `journal-poster.ts` + `account-purposes.ts`; domain-boundary audit shows **no cross-domain GL writes**. | **🟢 Centralised GL** | Strong. Surface "financial impact" on each operation's UI. |
| 9 | **CEO / Exec Dashboard** | `execDashboard.ts` (+`/exec-dashboard/unified-pnl`), `operationsCenter.ts`, `moduleDashboards.ts`. | **🟢 Exists** | Consolidate cross-domain KPIs into one CEO view. |
| 10 | **AI** | Infra only: `aiEngine.ts` + `aiGovernance` + `aiUsage` + governance route. **No natural-language domain assistants** (no nl2sql/ask endpoints). | **🟠 Infra only** | As you said — beginning. Assistants are net-new. |
| 11 | **Activity Feed** | `activityLog.ts` + `activityIngest` + `event_logs` + `/intelligence/activity/stats`. Data captured; user-facing chronological feed partial. | **🟡 Data yes, feed partial** | Build the "X did Y, 5 min ago" feed UI on existing data. |
| 12 | **Backup / Restore / DR** | `scripts/backup.sh` + `scripts/restore.sh` exist. | **🟡 Basic scripts** | No scheduled snapshots / tested DR runbook — harden. |
| 13 | **Monitoring** | `admin-observability.ts` (AI cost/tokens, failure tracking) + `health.ts`. | **🟢 Exists** | Extend to DB/API-latency/print-failure SLOs + alerting. |
| 14 | **Module Marketplace** | `company_feature_flags` + `permissions.ts` give per-company module toggles (VIS-002 partial-activation). | **🟡 Flags yes, marketplace no** | Foundation present; marketplace is long-horizon. |

**Score:** 7 green · 5 partial/yellow · 1 orange · 1 red. As an enterprise
platform the *operational* pillars (approval/task/notify/GL/dashboard/monitor)
are real; the *foundational identity* pillars (party + org-as-security) are the
genuine debt.

---

## The two real fears — detail + recommendation

### #1 Party Model — the strategic decision
**Evidence:** 10 person-like entities, 0 shared identity. A driver who is also
an employee, a supplier who is also a client, an agent who becomes a pilgrim —
all are duplicated rows with no link. Cross-entity identity resolution,
de-duplication, "one 360° view of محمد", and consistent contact data are all
impossible today.

**Recommendation — do NOT big-bang.** Retrofitting a classic Party supertype
across 388 tables on a live system is months of risk. The safe enterprise path
is **additive, in three slices**:
1. Introduce a `parties` registry (`id, type, displayName, nationalId, phone,
   email, …`) + a `party_links(partyId, entityTable, entityId, role)` join.
2. Backfill from the 10 tables; resolve duplicates by nationalId/phone.
3. Point *new* features (global search, 360 view, contact dedupe) at `parties`
   while legacy tables keep working — no forced migration of existing FKs.

This gets the Party *benefits* without a destructive rewrite. It is a strategic
slice, not a blocker for pilot.

### #2 Organization as a security boundary
**Evidence:** the hierarchy table exists (department.parentId) but
`authMiddleware` never scopes by department/team — only company+branch. So
"this manager sees only their department" is not enforceable today.

**Recommendation:** additive too — add `allowedDepartments` to the scope
(derived from `employee_assignments.departmentId`, already a column) and let
`buildScopedWhere` optionally filter by it. No schema change; it's a
middleware + opt-in-per-route change. Medium effort, high governance payoff.

---

## Alignment with your priority ranking

Your ranking is sound. Refinement based on the measurements:

- **Urgent (1–5):** nav review (#1505), pin open PRs, visual test, DBA review,
  final RBAC — all correct. *Add:* extend `allowedDepartments` here (cheap, and
  it's the #2 fear's safe slice).
- **Medium (6–10):** Approval/Task/Notification/Document are **mostly built** —
  reframe these from "build" to "**finish coverage + UX polish**" (much smaller
  than they sound). Search needs real extension.
- **Strategic (11–15):** Party Model (slice plan above) and AI Assistants are
  the only genuinely *new* large builds. Org Model is a cheap slice, not a
  rebuild. CEO Dashboard is consolidation of existing pieces. Marketplace is
  long-horizon.

**Bottom line:** the platform is closer to enterprise-grade than the "scattered"
fear suggests. Of your two biggest fears, **Party Model is real and strategic**
(but solvable additively), while **Approval & Task — your other fear — are in
fact already unified-enough**; the remaining work there is finishing and polish,
not foundation.
