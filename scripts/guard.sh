#!/usr/bin/env bash
#
# scripts/guard.sh — unified pre-commit / CI guard. (diag PR)
#
# Runs the full defensive stack in a fixed order, failing fast on the
# first red check. The goal is to catch every class of bug we have
# shipped to users before (in order of frequency):
#
#   1. Broken imports / missing functions       → typecheck
#   2. Banned legacy patterns                   → lint:patterns
#   3. Pages built but never wired to a route   → audit:routes
#   3b. Frontend apiFetch URL → real backend route → audit:wiring
#   4. Raw SQL referencing dropped/typo columns → audit:schema
#   5. Route identifiers vs live DB columns     → check:schema-drift
#   6. Soft-delete tables read w/o IS NULL      → check:ghost-rows
#   7. Cross-domain SQL writes (boundary leak)  → audit:domain-boundaries
#   8. Domain → routeFile mounting              → audit:domain-routes
#   9. Migration basename collisions            → check:duplicate-migrations
#  10. Migration header/rollback/destructive/breaking policy → check:migration-policy
#  11. Unit/smoke tests                         → test
#

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

PASS="\033[32m✓\033[0m"
FAIL="\033[31m✗\033[0m"
INFO="\033[36mℹ\033[0m"

echo -e "${INFO} guard.sh starting from $REPO_ROOT"
START=$(date +%s)

run_step() {
  local name="$1"
  shift
  local step_start=$(date +%s)
  echo
  echo -e "${INFO} [$name] running: $*"
  if "$@"; then
    local step_end=$(date +%s)
    echo -e "${PASS} [$name] ok (${name} took $((step_end - step_start))s)"
  else
    echo -e "${FAIL} [$name] FAILED"
    exit 1
  fi
}

run_step "typecheck"          pnpm -s run typecheck
# Pure-logic fixtures for the lint-pattern regexes + ratchet invariants
# — no DB needed. Runs before lint:patterns so a broken regex fails the
# test (with a precise diff) rather than producing a silent green run.
run_step "lint:patterns:tests" node scripts/src/lint-patterns.test.mjs
run_step "lint:patterns"      pnpm -s run lint:patterns
run_step "audit:routes"       node scripts/src/audit-routes.mjs
# URL-doubling guard introduced after #1354 — catches the bug class
# where a router is mounted at "/foo" and internally declares
# "/foo/..." paths, producing /api/foo/foo/.... See scripts/src/
# audit-route-doubling.mjs header for the canonical example.
run_step "audit:route-doubling" node scripts/src/audit-route-doubling.mjs
# Navigation governance gates (UX Nav Governance wave) — source-only, no DB.
#   gate:tabs          — fails if an internal *-tabs-nav tab points at a dead /
#                        redirect-only / create-edit-detail route.
#   gate:quick-actions — fails if a header quick-action button points at a
#                        redirect-only / dead route (create links are allowed).
#   gate:nav           — fails on a sidebar dead-link, a create page in the nav
#                        drawer, or an orphan list page (0 after the off-sidebar
#                        recognition fixes: quick-create heuristic + documented
#                        intentional-off-sidebar / superseded-by-shell allowlists).
# Report-only siblings for local triage: audit:tabs / audit:quick-actions / audit:sidebar.
run_step "gate:tabs"          pnpm -s run gate:tabs
run_step "gate:quick-actions" pnpm -s run gate:quick-actions
run_step "gate:nav"           pnpm -s run gate:nav
#   gate:labels        — fails on a DUPLICATE sidebar label (same Arabic name on
#                        two different pages → looks like a duplicated feature),
#                        a Latin label leaking back after Arabisation, or a label
#                        that drifted from navigation.canonical-map.ts. Stops the
#                        label-mismatch / duplication defects from recurring.
run_step "gate:labels"        pnpm -s run gate:labels
#   gate:nav-titles    — fails if a PageShell page title leaks English, so page
#                        titles stay Arabic like the sidebar (established acronyms
#                        WPS / ZATCA / WHT / PDPL / … are allow-listed).
run_step "gate:nav-titles"    pnpm -s run gate:nav-titles
#   gate:subtabs       — fails if a page's in-page sub-tab (<TabsTrigger>) leaks
#                        English; keeps the SECOND horizontal menu layer Arabic.
run_step "gate:subtabs"       pnpm -s run gate:subtabs
# nav-mirror: every horizontal module bar must mirror its sidebar groups (it now
# delegates to <ModuleTabsNav>, derived from the registry) — blocks any drift.
run_step "gate:nav-mirror"    pnpm -s run gate:nav-mirror
# Pure-logic fixtures for the wiring audit's string-literal reader,
# URL normaliser, and segment matcher — runs before the audit itself
# so a broken heuristic fails with a precise diff rather than a
# misleading orphan list. Includes an end-to-end check that the
# 0-orphan baseline still holds.
run_step "audit:wiring:tests" node scripts/src/check-frontend-backend-wiring.test.mjs
run_step "audit:wiring"       node scripts/src/check-frontend-backend-wiring.mjs
run_step "audit:schema"       node scripts/src/audit-schema-drift.mjs
# Pure-logic fixtures for the ghost-row predicates — no DB needed, so
# this runs in every environment to guard the guard itself.
run_step "check:ghost-rows:tests" node scripts/src/check-ghost-rows.test.mjs
# Pure-logic fixtures for the ambiguous-column scanner — no DB needed, so
# this runs in every environment to guard the guard itself.
run_step "check:sql-ambiguity:tests" node scripts/src/check-sql-ambiguity.test.mjs
# Pure-logic fixtures for the negative-journal-lines diagnostic (formatter +
# psql-row parser) — no DB needed; guards the report tool's logic.
run_step "report:negative-journal-lines:tests" node scripts/src/report-negative-journal-lines.test.mjs
if [ -n "${DATABASE_URL:-}" ]; then
  run_step "check:schema-drift" node scripts/src/check-schema-drift.mjs
  run_step "check:ghost-rows"   node scripts/src/check-ghost-rows.mjs
  # NOTE: check:insert-columns is intentionally NOT run here. It needs the DB at
  # migration HEAD, but this CI provisions Postgres from the db/schema.sql dump
  # (pre-server-boot), so post-dump migration columns read as false positives.
  # It is a manual diagnostic (pnpm check:insert-columns) until a head-of-main
  # DB lane exists.
  # Bare column shared across 2+ joined relations → Postgres
  # "column reference … is ambiguous" 500. Needs the live schema to know
  # which columns collide. See scripts/src/check-sql-ambiguity.mjs.
  run_step "check:sql-ambiguity" node scripts/src/check-sql-ambiguity.mjs
elif [ -n "${CI:-}" ]; then
  # GitHub Actions doesn't provision a Postgres by default. The local
  # pre-commit hook still enforces these checks against the real DB
  # before any developer can push, so we warn loudly here but don't
  # block CI on the absence of DATABASE_URL.
  echo -e "${INFO} [check:schema-drift] WARN: skipped in CI (no DATABASE_URL secret configured)"
  echo -e "${INFO} [check:ghost-rows]   WARN: skipped in CI (no DATABASE_URL secret configured)"
  echo -e "${INFO} [check:sql-ambiguity] WARN: skipped in CI (no DATABASE_URL secret configured)"
else
  echo -e "${INFO} [check:schema-drift] skipped (DATABASE_URL not set; allowed outside CI)"
  echo -e "${INFO} [check:ghost-rows] skipped (DATABASE_URL not set; allowed outside CI)"
  echo -e "${INFO} [check:sql-ambiguity] skipped (DATABASE_URL not set; allowed outside CI)"
fi
run_step "audit:boundaries"   node scripts/src/audit-domain-boundaries.mjs
run_step "audit:domain-routes" node scripts/src/audit-domain-routes.mjs
# Multi-table writes without a transaction — a failure on the second+ write
# leaves the first committed (silent partial/corrupt data). OFFLINE, schema-
# validated scan; baseline in scripts/tx-coverage-allowlist.txt, fails only on
# a NEW offender so the debt shrinks but never regrows.
run_step "check:tx-coverage"  node scripts/src/check-tx-coverage.mjs
# Event-bus reconciliation — fails if any eventBus.on() handler can never fire
# because its event is emitted nowhere (dynamic-dispatch aware). See
# scripts/src/audit-event-bus.mjs.
run_step "audit:event-bus"    node scripts/src/audit-event-bus.mjs
# Stop-Ship gate for #1141: every route that INSERTs into an executive
# document table must also call `numberingService.issueNumber`. A pure
# lint regex can't catch a fresh INSERT into invoices/contracts/etc.
# that simply doesn't import issueNumber at all — this audit can.
run_step "audit:numbering-coverage" node scripts/src/audit-numbering-coverage.mjs

# Stronger numbering guards added 2026-05-27 after the lawyer's review
# demanded fewer-words / more-proof. These cover layers the original
# audit missed:
#   • service-bypass: forbids direct INSERT/UPDATE on numbering_* from
#     outside lib/numberingService.ts (with the documented linkback
#     exception). Catches code that forges assignments or hand-bumps
#     counters.
#   • schemes-vs-callers: cross-checks seeded scheme tuples against
#     issueNumber call sites. Fails CI if a route issues a tuple that
#     has no seed migration (would throw on a fresh tenant).
run_step "audit:numbering-bypass"      node scripts/src/audit-numbering-service-bypass.mjs
run_step "audit:numbering-schemes-vs-callers" node scripts/src/audit-numbering-schemes-vs-callers.mjs

run_step "check:duplicate-migrations" node scripts/src/check-duplicate-migrations.mjs
# Dump staleness — every table a pre-cutoff migration creates must exist in
# db/schema_pre.sql (fresh installs never re-run pre-cutoff migrations, so a
# stale dump silently 500s clean environments — the 2026-06 inbox incident).
run_step "check:dump-drift"   node scripts/src/check-dump-drift.mjs
# Invalid interactive-element nesting: <Link><Button> renders <a><button>,
# which is invalid HTML and breaks keyboard / screen-reader semantics.
# OFFLINE source scan; baseline in scripts/button-nesting-allowlist.txt,
# fails only on a NEW offender. Pure-logic fixtures guard the detector.
run_step "check:button-nesting:tests" node scripts/src/check-button-nesting.test.mjs
run_step "check:button-nesting" node scripts/src/check-button-nesting.mjs
# Component rendered in JSX with an explicit `<any>` generic (`<DataTable<any> …>`):
# the Replit dev-metadata Babel plugin mangles it into an unparseable opening tag,
# Vite pushes the transform error to every client as a GLOBAL error overlay, and a
# single offending lazily-loaded file freezes the ENTIRE dev preview (every route
# shows the red overlay). typecheck/build/lint all pass — invisible until you open
# the preview. OFFLINE source scan; baseline in scripts/jsx-generic-component-allowlist.txt,
# fails only on a NEW offender. Pure-logic fixtures guard the detector.
run_step "check:jsx-generic-component:tests" node scripts/src/check-jsx-generic-component.test.mjs
run_step "check:jsx-generic-component" node scripts/src/check-jsx-generic-component.mjs
# Canonical component pairs (registry): a file must not use both a canonical
# unified component and its raw alternative (two entries for one job). Registry-
# driven (scripts/src/check-canonical-component-pairs.mjs PAIRS) — generalises &
# replaces the per-case attachment guard (#2978); the financial-attachment pair
# (FinancialAttachmentViewer vs FileDropZone, #2975) is the first registry entry.
# OFFLINE source scan; baseline scripts/canonical-component-pairs-allowlist.txt.
# `type Attachment` import alone is allowed. Pure-logic tests.
run_step "check:canonical-component-pairs:tests" node scripts/src/check-canonical-component-pairs.test.mjs
run_step "check:canonical-component-pairs" node scripts/src/check-canonical-component-pairs.mjs
# Component hygiene — detect duplicate / unrelated components system-wide
# («علم وجود مكوّنات مكرّرة أو ليست ذات علاقة»). Baseline mode: current state
# frozen in scripts/*-allowlist.txt (the awareness report); fails only on a NEW
# offender. Pure-logic fixtures guard each detector.
#   • duplicate-component-content — two differently-named .tsx with identical
#     normalized body (copy-paste the dup-filenames guard misses).
#   • dead-components — a component .tsx no file imports (orphan/dead); counts
#     re-exports from lib/* kit facades so live components aren't false-flagged.
run_step "check:duplicate-component-content:tests" node scripts/src/check-duplicate-component-content.test.mjs
run_step "check:duplicate-component-content" node scripts/src/check-duplicate-component-content.mjs
run_step "check:dead-components:tests" node scripts/src/check-dead-components.test.mjs
run_step "check:dead-components" node scripts/src/check-dead-components.mjs
# Responsive tables: a raw <table> not inside an overflow scroll container
# clips/breaks the layout on phone widths (the 2026-06 mobile pass wrapped
# every offender). OFFLINE source scan; empty baseline in
# scripts/responsive-tables-allowlist.txt — fails on any NEW unwrapped table.
# Pure-logic fixtures guard the detector.
run_step "check:responsive-tables:tests" node scripts/src/check-responsive-tables.test.mjs
run_step "check:responsive-tables" node scripts/src/check-responsive-tables.mjs
# Display-table canonicalization: a page-level list/display table must use the
# shared <DataTable> (sort, per-user page-size, mobile cards, column footers,
# CSV export), not a hand-rolled raw <table>. The 2026-06 table-unification
# pass converted them all; this keeps NEW raw tables out of src/pages/**.
# OFFLINE source scan; baseline of verified-bespoke pages (forms / statements /
# tree / info-blocks) in scripts/display-tables-allowlist.txt. Fixtures guard
# the detector.
run_step "check:display-tables:tests" node scripts/src/check-display-tables.test.mjs
run_step "check:display-tables" node scripts/src/check-display-tables.mjs
# Mobile grid-cramping: Tailwind is mobile-first, so a BARE grid-cols-N (N>=4)
# IS the phone layout and shows N cramped columns on a 360px screen. The 2026-06
# mobile pass collapsed every stat/input/tab grid to grid-cols-2 md:grid-cols-N;
# this keeps NEW cramped grids out of src/pages/**. OFFLINE source scan with
# mechanical exclusions (key-value col-span, min-w / overflow-x scroll wrappers,
# calendar/guide files); intentional dense layouts pinned in
# scripts/mobile-grids-allowlist.txt. Fixtures guard the detector.
run_step "check:mobile-grids:tests" node scripts/src/check-mobile-grids.test.mjs
run_step "check:mobile-grids" node scripts/src/check-mobile-grids.mjs
# Page action-bar consistency (refresh/print/export): a hand-rolled control —
# a <Button> pairing the action's icon with its bare Arabic label (RefreshCw+«تحديث»
# / Printer+«طباعة» / Download+«تصدير») — instead of the unified component
# (<RefreshAction/> / <PrintButton/> / <ExportAction/>), so the same action looked
# and behaved differently on every page before unification. OFFLINE source scan;
# deliberate framework/section/per-row exceptions (action:path) in
# scripts/page-actions-allowlist.txt, fails only on a NEW offender.
# Pure-logic fixtures guard the detector.
run_step "check:page-actions:tests" node scripts/src/check-page-actions.test.mjs
run_step "check:page-actions" node scripts/src/check-page-actions.mjs
# Native API origin: a relative `/api` or local `const BASE =
# import.meta.env.BASE_URL` hits the app bundle (https://localhost), not the
# server, inside the Capacitor native shell — so the whole data layer fails in
# the app. The single native-aware source is API_BASE in lib/api.ts. OFFLINE
# source scan; empty baseline in scripts/api-base-allowlist.txt. Fixtures guard
# the detector.
run_step "check:api-base:tests" node scripts/src/check-api-base.test.mjs
run_step "check:api-base"       node scripts/src/check-api-base.mjs
# Direct API fetch: a raw fetch(`${BASE}/api…`) bypasses apiFetch, so on the
# native app it carries no Bearer token (cookies don't cross the WebView
# origin) and 401s. Forces new API calls through apiFetch; reviewed raw
# blob/upload sites are baselined in scripts/direct-api-fetch-allowlist.txt.
run_step "check:direct-api-fetch:tests" node scripts/src/check-direct-api-fetch.test.mjs
run_step "check:direct-api-fetch" node scripts/src/check-direct-api-fetch.mjs
# Nested anchors: a wouter <Link> WITHOUT `asChild` directly wrapping <a>
# renders <a><a> (the OUTER <a> carries href+onClick, the author's INNER <a>
# carries content but no href). Invalid HTML — React logs a validateDOMNesting
# / hydration warning and the browser un-nests them, stripping the click
# target's href/onClick and breaking tab/link navigation. typecheck/build/lint
# all pass — invisible until you open the page. OFFLINE source scan; baseline in
# scripts/link-nested-anchor-allowlist.txt, fails only on a NEW offender.
# Pure-logic fixtures guard the detector.
run_step "check:link-nested-anchor:tests" node scripts/src/check-link-nested-anchor.test.mjs
run_step "check:link-nested-anchor" node scripts/src/check-link-nested-anchor.mjs
  # setState INSIDE useMemo: a render-phase side effect. With an unstable
  # callback and/or a setState that always builds a new reference it becomes an
  # infinite render loop that wedges the tab — invisible to typecheck/build/lint,
  # only manifests at runtime (the /finance/reports/is-trend incident). OFFLINE
  # source scan flagging a BARE setter (excludes Date/DOM mutators like
  # `.setHours(`) at the TOP level of a useMemo callback (excludes setters inside
  # returned-JSX event handlers). Pure-logic fixtures guard the detector.
  run_step "check:usememo-setstate:tests" node scripts/src/check-usememo-setstate.test.mjs
  run_step "check:usememo-setstate" node scripts/src/check-usememo-setstate.mjs
  # RULES OF HOOKS: a React Hook called conditionally — after an early `return`,
  # inside an if/loop/ternary, or in a plain helper function — changes the hook
  # count between renders and throws "Rendered more hooks than during the
  # previous render", blanking the whole page (the expenses-create / exempt-
  # pilgrims / org-model incidents). typecheck/build pass; only manifests at
  # runtime. AST-based scan (bundled tsc); empty baseline in
  # scripts/hooks-rules-allowlist.txt. Pure-logic fixtures guard the detector.
  run_step "check:hooks-rules:tests" node scripts/src/check-hooks-rules.test.mjs
  run_step "check:hooks-rules" node scripts/src/check-hooks-rules.mjs
  # The strict account-creation limiter (registerLimiter, max 5/hour) must never
  # gate a GET probe. /api/auth/setup-state is polled on every login-page mount;
  # gating it with the registration budget 429s the probe under modest/shared-IP
  # load (no e2e bypass) — breaking first-run detection + spraying console errors
  # (the runtime audit recorded ~79 setup-state 4xx). OFFLINE source scan of the
  # auth router; pure-logic fixtures guard the detector.
  run_step "check:register-limiter-misuse:tests" node scripts/src/check-register-limiter-misuse.test.mjs
  run_step "check:register-limiter-misuse" node scripts/src/check-register-limiter-misuse.mjs
# ROUTE SHADOWING: a static route registered AFTER a `:param` route on the same
# method+prefix is unreachable — Express captures the literal segment as the
# param value (the /cost-centers/ranking -> /:id with id="ranking" 422 «معرف غير
# صالح: id» incident). OFFLINE source scan; baseline in
# scripts/route-shadowing-allowlist.txt, fails only on a NEW shadow. Pure-logic
# fixtures guard the detector.
run_step "check:route-shadowing:tests" node scripts/src/check-route-shadowing.test.mjs
run_step "check:route-shadowing" node scripts/src/check-route-shadowing.mjs
# SCOPE-SUFFIX GLUE: `scopeSuffix` (the multi-filter query fragment) must be
# concatenated with the separator its in-scope definition uses — a `&`-prefixed
# suffix appended to a bare path yields `/hr/stats&companyIds=1` which the router
# 404s (the runtime-audit /api/hr/stats&companyIds incident); a `?`-prefixed
# suffix appended after an existing `?` yields a double query string. OFFLINE
# separator-aware source scan. Pure-logic fixtures guard the detector.
run_step "check:scope-suffix-glue:tests" node scripts/src/check-scope-suffix-glue.test.mjs
run_step "check:scope-suffix-glue" node scripts/src/check-scope-suffix-glue.mjs
# Duplicate basenames within a single frontend artifact's src/ (e.g. two
# policies-tab.tsx) — copy-paste components that drift apart and resolve
# imports to the wrong copy. OFFLINE filename scan; baseline in
# scripts/dup-filename-allowlist.txt, fails only on a NEW collision.
# Pure-logic fixtures guard the detector.
run_step "check:dup-filenames:tests" node scripts/src/check-dup-filenames.test.mjs
run_step "check:dup-filenames" node scripts/src/check-dup-filenames.mjs
# WRITE endpoints (POST/PUT/PATCH/DELETE) with no detectable audit trail —
# threat-model Repudiation requires every sensitive mutation to log who/what/
# when. OFFLINE source scan (mirrors api-to-audit-map detection); baseline in
# scripts/audit-coverage-allowlist.txt, fails only on a NEW unaudited write.
# Pure-logic fixtures guard the detector.
run_step "check:audit-coverage:tests" node scripts/src/check-audit-coverage.test.mjs
run_step "check:audit-coverage" node scripts/src/check-audit-coverage.mjs
# Pure-logic fixtures for the breaking-change detection — no DB needed,
# guards the guard itself (same pattern as check:ghost-rows:tests above).
run_step "check:migration-policy:tests" node scripts/src/check-migration-policy.test.mjs
run_step "check:migration-policy" node scripts/src/check-migration-policy.mjs
# Two previously-dormant guards now activated after main was brought
# clean against them (PR #574 originally proposed activating all four;
# this PR activates the two that pass today and leaves the remaining
# two — `check-finance-period-drift` and `check-workflow-silent-failures`
# — dormant until their separate cleanup PRs land, since each still has
# real findings unrelated to the guard wiring itself).
run_step "check:utc-time-drift" node scripts/src/check-utc-time-drift.mjs
# REDIRECT-TO-NOWHERE: every redirectTo("/x") alias in the ghayth-erp route
# table must resolve to a real mounted route. Catches the A4-navigation failure
# class (delete/rename a canonical page, leave its alias behind -> SPA 404)
# statically, before merge. Pure-logic fixtures first, then the live scan.
run_step "check:redirect-targets:tests" node scripts/src/check-redirect-targets.test.mjs
run_step "check:redirect-targets" node scripts/src/check-redirect-targets.mjs
# TABS-NAV COVERAGE: every tab in components/shared/*-tabs-nav.tsx must point at
# a real mounted route — a dead tab silently 404s (companion to the sidebar +
# redirect-target nav guards). Pure-logic fixtures first, then the live scan.
run_step "check:tabs-coverage:tests" node scripts/src/check-tabs-coverage.test.mjs
run_step "check:tabs-coverage" node scripts/src/check-tabs-coverage.mjs --strict
# MODULE-STRIP COVERAGE: the INVERSE of tabs-coverage — every routed MAIN page
# (list/dashboard/report/tool) that lives inside a module must RENDER that
# module's top strip (<XxxTabsNav/>), so the horizontal nav never disappears as
# the user moves between pages of the same module. Generalises the 5-page HR
# contract (hrNavStabilitySmoke) to all 12 strip-bearing modules. Detail/create
# forms + focused/standalone layouts are exempt by design. Pure helpers first.
run_step "check:module-strip-coverage:tests" node scripts/src/check-module-strip-coverage.test.mjs
run_step "check:module-strip-coverage" node scripts/src/check-module-strip-coverage.mjs --strict
# FILTER-BAR INVENTORY (جرد): report-only census of every list page's filter/
# search bar — canonical (<AdvancedFilters>/DataTable toolbar) vs hand-rolled
# (client = safe to migrate onto the canonical bar; server = keep server-side
# filtering, only the LAYOUT should be normalised). Report-only by design:
# server-side filtering is a legitimate pattern and must NOT fail the build. The
# pure classifiers are gated by the :tests sibling.
run_step "check:filter-bar-coverage:tests" node scripts/src/check-filter-bar-coverage.test.mjs
run_step "check:filter-bar-coverage" node scripts/src/check-filter-bar-coverage.mjs
# OPERABILITY CENSUS (جرد العمليّة): report-only per-page inventory of the
# operational elements — back / print / sort / search — across every routed
# page, classified by page type so every gap (or n/a) carries a reason. The
# accounting tool behind the «back/print/search/sort» standardisation campaign.
run_step "check:page-operability:tests" node scripts/src/check-page-operability.test.mjs
run_step "check:page-operability" node scripts/src/check-page-operability.mjs
# SIDEBAR COVERAGE: every mounted route must be reachable from the left sidebar
# (navigation.registry.ts) or be legitimately off-sidebar (detail / create /
# redirect-stub / allowlisted); and no nav entry may be a dead link or a
# create/edit page in the drawer. Third nav guard (sidebar + tabs +
# redirect-targets). Pure-logic fixtures first, then the live scan.
run_step "check:sidebar-coverage:tests" node scripts/src/check-sidebar-coverage.test.mjs
run_step "check:sidebar-coverage" node scripts/src/check-sidebar-coverage.mjs --strict
# RAWQUERY-PARAM-ARITY: a Postgres parameterized statement must be bound with
# exactly max($N) values. Catches the 08P01 "bind message supplies N parameters,
# but prepared statement requires M" class statically — e.g. the umrah
# /calendar/events overstay 500, where a query referenced only $1,$2 while
# sharing the 3-element `baseParams` its siblings filled via BETWEEN $2 AND $3.
# Pure-logic fixtures first (no DB), then the live scan; vetted FPs in
# scripts/rawquery-param-arity-allowlist.txt.
run_step "check:rawquery-param-arity:tests" node scripts/src/check-rawquery-param-arity.test.mjs
run_step "check:rawquery-param-arity" node scripts/src/check-rawquery-param-arity.mjs
# SCOPED-BRANCH-QUALIFIED: a buildScopedWhere call that alias-qualifies its
# companyColumn (the multi-table/aliased-FROM case) MUST also qualify its
# branchColumn or set disableBranchScope:true. A qualified company + bare
# default `"branchId"` is the warehouse-advanced (42702 ambiguous-column 500)
# and warehouse-cycle-counts (wrong-table scoping) class. Offline static scan;
# pure-logic fixtures first, then the live scan; vetted FPs in
# scripts/scoped-branch-qualified-allowlist.txt.
run_step "check:scoped-branch-qualified:tests" node scripts/src/check-scoped-branch-qualified.test.mjs
run_step "check:scoped-branch-qualified" node scripts/src/check-scoped-branch-qualified.mjs
run_step "check:workflow-pnpm-filters" node scripts/src/check-workflow-pnpm-filters.mjs
run_step "check:workflow-silent-failures" node scripts/src/check-workflow-silent-failures.mjs
# Fourth of the four originally-dormant guards from PR #574 — finally
# active after the 51-site finance-period-drift cleanup landed across
# PRs #1019 (frontend batch 1), #1026 (frontend batch 2), and #1028
# (bi.ts + finance-budget.ts route files).
run_step "check:finance-period-drift" node scripts/src/check-finance-period-drift.mjs
# FIN-NONPOSTABLE-FALLBACK (#2325): every resolveAccountCode 4th-arg fallback
# must be a postable leaf, never a non-postable parent (a parent fallback hard-
# fails posting once account_mappings is empty). Baseline in the script's
# ALLOWLIST (offenders in other in-flight tracks); fails only on a NEW offender,
# which is exactly how #2044 silently re-introduced vat_output→2200 after #2181.
run_step "check:postable-fallbacks:tests" node scripts/src/check-postable-fallbacks.test.mjs
run_step "check:postable-fallbacks" node scripts/src/check-postable-fallbacks.mjs
# Tenant-isolation (FND-013): a static read/write of a tenant-scoped table
# (has a "companyId" column) MUST carry a "companyId" predicate, else one
# tenant's rows leak into another's session. Baseline in
# scripts/tenant-isolation-allowlist.txt (the existing surface, to be triaged
# and fixed in owning tracks); fails only on a NEW unscoped statement, freezing
# the leak surface from growing while buildScopedWhere adoption catches up.
run_step "check:tenant-isolation" node scripts/src/check-tenant-isolation.mjs
# GL-failure handling (#2301): a catch around a GL posting must rethrow, else the
# request 200s while the journal silently never posts (non-atomic; recoverable
# only via the financial_posting_failures retry queue). Whole-file baseline in
# scripts/gl-swallow-allowlist.txt (existing surface, triaged per #2301); fails
# on a NEW file that swallows a GL error without rethrowing.
run_step "check:gl-swallow" node scripts/src/check-gl-swallow.mjs
# Stop-Ship compliance scan (#1139 §8): every write endpoint must have an
# RBAC guard. File-level audit/event gaps are reported as warnings (the
# global auditMiddleware provides baseline coverage) and don't fail the
# build. Route-level exemptions live in scripts/src/audit-stop-ship.mjs.
run_step "audit:stop-ship"    node scripts/src/audit-stop-ship.mjs
# E2E login-entry guard (#flaky-test): a Playwright spec that opens the app
# at the bare root `page.goto("/")` before driving the login form races the
# SPA's unauthenticated "/" → "/login" redirect against the field fills,
# producing a non-deterministic empty-email login that bounces to /login.
# The product is healthy — the failure is the test. Use the race-free
# e2e/tests/_helpers/login.ts (goto "/login" directly) instead. Pure-logic
# fixtures first, then the live spec scan.
run_step "check:e2e-login:tests" node scripts/src/check-e2e-login-pattern.test.mjs
run_step "check:e2e-login"    node scripts/src/check-e2e-login-pattern.mjs
# Dangerous-action UX guard — native browser confirm() (RTL-broken, no
# impact-preview / blockers / audit) must use the unified ConfirmDeleteDialog /
# ConfirmActionDialog. Pure-logic fixtures first, then the baseline-frozen scan.
run_step "check:dangerous-actions:tests" node scripts/src/check-dangerous-actions.test.mjs
run_step "check:dangerous-actions" node scripts/src/check-dangerous-actions.mjs
run_step "test"               pnpm -s --filter @workspace/api-server run test
# Frontend component tests (jsdom + @testing-library/react). Real behavioural
# verification for sensitive UI (e.g. ProductSelect snap-to-catalog) without a
# live app — the gate the package requires for FE component work.
run_step "test:fe"            pnpm -s --filter @workspace/ghayth-erp run test

END=$(date +%s)
echo
echo -e "${PASS} guard.sh green — all $((END - START))s"
