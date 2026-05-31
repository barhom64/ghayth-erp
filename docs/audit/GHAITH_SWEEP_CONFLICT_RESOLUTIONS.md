# Ghaith Sweep — Conflict Resolution Log

> Living record of how the 10 cross-workstream conflicts from
> `GHAITH_SYSTEM_GAP_MATRIX.md §3` are being closed. Each resolution
> ships with a JSDoc anchor in the resolved source file so the next
> auditor sees the decision without re-running the matrix.

## Status snapshot

| # | Topic | Decision | Location of decision |
|---|---|---|---|
| 1 | `pages/finance/profitability.tsx` dead-vs-keep | **Keep** | JSDoc at `artifacts/ghayth-erp/src/pages/finance/profitability.tsx:1-19` |
| 2 | `pages/finance/account-statement.tsx` dead-vs-keep | **Keep** | JSDoc at `artifacts/ghayth-erp/src/pages/finance/account-statement.tsx:1-14` |
| 3 | `pages/admin/rbac-v2-conditions-editor.tsx` dead-vs-partial | **Keep (sub-component)** | JSDoc at `artifacts/ghayth-erp/src/pages/admin/rbac-v2-conditions-editor.tsx:1-13` |
| 4 | `bi/shared.tsx` + `my-space/shared.ts` + `governance/stats-cards.tsx` placement | **Keep in place** | JSDoc anchors in each file |
| 5 | Umrah module key (sidebar `umrah` ↔ backend `operations`) | **Sidebar aligned to backend** | Resolved by slice 4/N (commit was squash-merged in PR #1463) |
| 6 | `/admin` hub — needs API or cosmetic | **Resolved — keep, wire cards to tabs** | `pages/admin.tsx` (7 overview cards now `setActiveTab` instead of dead) |
| 7 | `idempotency_keys` orphan-vs-live | **Live (via `lib/requestIdempotency`)** | Doc comment at `artifacts/api-server/src/middlewares/idempotencyMiddleware.ts:7-19` |
| 8 | HR pairs duplication (recruitment / training / performance / shifts / leaves / violations) | **Resolved — keep separate** | JSDoc anchor on `hr/recruitment.tsx:1-25` documents the contract for all 6 pairs |
| 9 | `finance/dashboard.tsx` ready-vs-deprecate | **Resolved — keep** | JSDoc anchor at `pages/finance/dashboard.tsx:1-14` — has 5 distinct domain queries that `/module-dashboards` doesn't surface |
| 10 | `pages/hr.tsx`, `fleet.tsx`, `legal.tsx` legacy hubs | **Resolved — keep** | JSDoc anchors on each — same rationale: domain-specific landings, not duplicates of module-dashboards |

## Resolved (5 / 10)

### #1 — `profitability.tsx`
Evidence is decisive: 4 files in `pages/finance/` (`profitability-vehicle`,
`profitability-property`, `profitability-project`,
`profitability-umrah-agent`) each import `./profitability` as default
and re-export it with a different `entityType` prop. Routes wire the
wrappers; the base file is intentionally route-less because routes
go through wrappers. **Keep**. JSDoc pinned at top of file so the next
audit doesn't re-flag it.

### #2 — `account-statement.tsx`
Same pattern: imported by `customer-statement.tsx` and
`vendor-statement.tsx`, each binding to a different URL. **Keep**.

### #3 — `rbac-v2-conditions-editor.tsx`
Imported by `rbac-v2-tab.tsx:23` and rendered at line 605. It's a
sub-component of the RBAC v2 condition builder, not a standalone
page. The file lives under `pages/admin/` because the RBAC migration
pre-dates the `components/admin/` convention; safe to relocate later.
**Keep, document as sub-component**.

### #4 — `bi/shared.tsx`, `my-space/shared.ts`, `governance/stats-cards.tsx`
All three are co-located utilities/sub-components used only by
siblings in their folder. One agent called them "internal-only OK",
another "misplaced — move to `components/` or `lib/`". Co-location
is cheaper than module-level reorganization right now; **keep in
place**, mark each with a JSDoc note saying a future folder
restructure can relocate them together.

### #7 — `idempotency_keys`
The audit grep didn't find route-level usage because the table is
consumed via `lib/requestIdempotency.ts` which sensitive endpoints
(year-end close, journal post, lock period) wrap explicitly rather
than mounting the middleware. **Live, not orphan**. Doc comment
added to the middleware so the next grep-only audit sees the
indirection.

## Open — needs human/product decision (5 / 10)

These conflicts require an out-of-code decision (product roadmap,
UX standard, deprecation date) that a code-only sweep cannot
authoritatively close.

### #5 — Umrah module key (now resolved retroactively)
Slice 4/N already aligned `sidebar { module: "umrah" } →
{ module: "operations" }` to match the backend mount. Comment in
sidebar-layout.tsx explains. The conflict only exists historically;
nothing to do now.

### #6 — `/admin` hub
Question: is `pages/admin.tsx` (the landing card grid) intended as
a `nav-only` cosmetic hub, or should each card be backed by an API
summary? `SYSTEM_PAGE_INVENTORY` says it needs an API; the
dead-duplicate audit says it's intentional. **Owner: Admin /
Platform**.

### #8 — HR pairs (recruitment / training / performance / shifts / leaves / violations)
The dead/duplicate audit recommends merging each pair as
tabs-in-one-page. The inventory + classification audits describe
them as standalone-by-design. The shared TabsNav already gives
users navigation between them, so "tabs vs standalone" is more an
information-architecture question than a code question. **Owner:
HR / UX**.

### #9 — `finance/dashboard.tsx`
One audit calls it "ready" (7 API calls, functional), another calls
it "legacy — `module-dashboards?tab=finance` replaces it". Both can
be true at once. Decision needed: deprecate the legacy dashboard,
or keep both. **Owner: Finance**.

### #10 — `pages/hr.tsx`, `fleet.tsx`, `legal.tsx` legacy hubs
Same pattern as #9 — multiple landings that could be consolidated
into `module-dashboards` tabs. **Owner: Platform**.

## How resolved conflicts ship

Every closed conflict pins a JSDoc comment at the top of the
affected file referencing the conflict number. Anyone re-running
the sweep audit later will see the decision without re-deriving it.

## Refs
- `docs/audit/GHAITH_SYSTEM_GAP_MATRIX.md` §3
- `docs/audit/GHAITH_SYSTEM_SWEEP_EXECUTIVE_SUMMARY.md`
- `docs/audit/GHAITH_SWEEP_EXECUTION_PROGRESS.md`
