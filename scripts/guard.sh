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
# Pure-logic fixtures for the scoped-where ambiguity scanner (bare scope
# columns injected by buildScopedWhere into multi-table queries) — no DB
# needed, so this runs in every environment to guard the guard itself.
run_step "check:scoped-where-ambiguity:tests" node scripts/src/check-scoped-where-ambiguity.test.mjs
# Pure-logic fixtures for the schema-drift scanner's template sanitiser
# (depth-aware ${…} stripping) — no DB needed, so this runs in every
# environment to guard the guard itself.
run_step "check:schema-drift:tests" node scripts/src/check-schema-drift.test.mjs
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
  # Bare scope column (companyId/branchId) that buildScopedWhere injects
  # into a multi-table query where the column exists on 2+ relations →
  # same ambiguous-column 500 class. Needs the live schema. See
  # scripts/src/check-scoped-where-ambiguity.mjs.
  run_step "check:scoped-where-ambiguity" node scripts/src/check-scoped-where-ambiguity.mjs
elif [ -n "${CI:-}" ]; then
  # GitHub Actions doesn't provision a Postgres by default. The local
  # pre-commit hook still enforces these checks against the real DB
  # before any developer can push, so we warn loudly here but don't
  # block CI on the absence of DATABASE_URL.
  echo -e "${INFO} [check:schema-drift] WARN: skipped in CI (no DATABASE_URL secret configured)"
  echo -e "${INFO} [check:ghost-rows]   WARN: skipped in CI (no DATABASE_URL secret configured)"
  echo -e "${INFO} [check:sql-ambiguity] WARN: skipped in CI (no DATABASE_URL secret configured)"
  echo -e "${INFO} [check:scoped-where-ambiguity] WARN: skipped in CI (no DATABASE_URL secret configured)"
else
  echo -e "${INFO} [check:schema-drift] skipped (DATABASE_URL not set; allowed outside CI)"
  echo -e "${INFO} [check:ghost-rows] skipped (DATABASE_URL not set; allowed outside CI)"
  echo -e "${INFO} [check:sql-ambiguity] skipped (DATABASE_URL not set; allowed outside CI)"
  echo -e "${INFO} [check:scoped-where-ambiguity] skipped (DATABASE_URL not set; allowed outside CI)"
fi
run_step "audit:boundaries"   node scripts/src/audit-domain-boundaries.mjs
run_step "audit:domain-routes" node scripts/src/audit-domain-routes.mjs
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
run_step "check:workflow-pnpm-filters" node scripts/src/check-workflow-pnpm-filters.mjs
run_step "check:workflow-silent-failures" node scripts/src/check-workflow-silent-failures.mjs
# Fourth of the four originally-dormant guards from PR #574 — finally
# active after the 51-site finance-period-drift cleanup landed across
# PRs #1019 (frontend batch 1), #1026 (frontend batch 2), and #1028
# (bi.ts + finance-budget.ts route files).
run_step "check:finance-period-drift" node scripts/src/check-finance-period-drift.mjs
# Stop-Ship compliance scan (#1139 §8): every write endpoint must have an
# RBAC guard. File-level audit/event gaps are reported as warnings (the
# global auditMiddleware provides baseline coverage) and don't fail the
# build. Route-level exemptions live in scripts/src/audit-stop-ship.mjs.
run_step "audit:stop-ship"    node scripts/src/audit-stop-ship.mjs
run_step "test"               pnpm -s --filter @workspace/api-server run test
# Frontend component tests (jsdom + @testing-library/react). Real behavioural
# verification for sensitive UI (e.g. ProductSelect snap-to-catalog) without a
# live app — the gate the package requires for FE component work.
run_step "test:fe"            pnpm -s --filter @workspace/ghayth-erp run test

END=$(date +%s)
echo
echo -e "${PASS} guard.sh green — all $((END - START))s"
