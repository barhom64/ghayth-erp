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
run_step "audit:schema"       node scripts/src/audit-schema-drift.mjs
# Pure-logic fixtures for the ghost-row predicates — no DB needed, so
# this runs in every environment to guard the guard itself.
run_step "check:ghost-rows:tests" node scripts/src/check-ghost-rows.test.mjs
if [ -n "${DATABASE_URL:-}" ]; then
  run_step "check:schema-drift" node scripts/src/check-schema-drift.mjs
  run_step "check:ghost-rows"   node scripts/src/check-ghost-rows.mjs
elif [ -n "${CI:-}" ]; then
  # GitHub Actions doesn't provision a Postgres by default. The local
  # pre-commit hook still enforces these checks against the real DB
  # before any developer can push, so we warn loudly here but don't
  # block CI on the absence of DATABASE_URL.
  echo -e "${INFO} [check:schema-drift] WARN: skipped in CI (no DATABASE_URL secret configured)"
  echo -e "${INFO} [check:ghost-rows]   WARN: skipped in CI (no DATABASE_URL secret configured)"
else
  echo -e "${INFO} [check:schema-drift] skipped (DATABASE_URL not set; allowed outside CI)"
  echo -e "${INFO} [check:ghost-rows] skipped (DATABASE_URL not set; allowed outside CI)"
fi
run_step "audit:boundaries"   node scripts/src/audit-domain-boundaries.mjs
run_step "audit:domain-routes" node scripts/src/audit-domain-routes.mjs
run_step "check:duplicate-migrations" node scripts/src/check-duplicate-migrations.mjs
# Pure-logic fixtures for the breaking-change detection — no DB needed,
# guards the guard itself (same pattern as check:ghost-rows:tests above).
run_step "check:migration-policy:tests" node scripts/src/check-migration-policy.test.mjs
run_step "check:migration-policy" node scripts/src/check-migration-policy.mjs
run_step "test"               pnpm -s --filter @workspace/api-server run test

END=$(date +%s)
echo
echo -e "${PASS} guard.sh green — all $((END - START))s"
