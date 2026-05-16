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
#   4b. Event names in present-tense singular   → check:event-name-tense
#   4e. UTC date used where Riyadh wall-clock   → check:utc-time-drift
#   5. Route identifiers vs live DB columns     → check:schema-drift
#   6. Soft-delete tables read w/o IS NULL      → check:ghost-rows
#   7. Cross-domain SQL writes (boundary leak)  → audit:domain-boundaries
#   8. Domain → routeFile mounting              → audit:domain-routes
#   9. Migration basename collisions            → check:duplicate-migrations
#  10. Unit/smoke tests                         → test
#  11. Engine catch blocks must surface errors  → check:observability-coverage
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
run_step "lint:patterns"      pnpm -s run lint:patterns
run_step "lint:as-any"        pnpm -s run lint:as-any
run_step "audit:routes"       node scripts/src/audit-routes.mjs
run_step "audit:schema"       node scripts/src/audit-schema-drift.mjs
run_step "check:event-name-tense" pnpm -s run check:event-name-tense
run_step "check:utc-time-drift:tests" node scripts/src/check-utc-time-drift.test.mjs
run_step "check:utc-time-drift" pnpm -s run check:utc-time-drift
run_step "check:finance-period-drift:tests" node scripts/src/check-finance-period-drift.guard.test.mjs
run_step "check:finance-period-drift" pnpm -s run check:finance-period-drift
run_step "check:where-replace:tests" node scripts/src/check-where-replace.test.mjs
run_step "check:where-replace" pnpm -s run check:where-replace
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
run_step "check:audit-action-vocab:tests" node scripts/src/check-audit-action-vocab.test.mjs
run_step "check:audit-action-vocab" pnpm -s run check:audit-action-vocab
run_step "check:event-orphans" node scripts/src/check-event-orphans.mjs
run_step "audit:boundaries"   node scripts/src/audit-domain-boundaries.mjs
run_step "audit:domain-routes" node scripts/src/audit-domain-routes.mjs
run_step "check:duplicate-migrations" node scripts/src/check-duplicate-migrations.mjs
run_step "check:observability-coverage:tests" node scripts/src/check-observability-coverage.test.mjs
run_step "check:observability-coverage" pnpm -s run check:observability-coverage
run_step "check:prometheus-alerts" node scripts/src/check-prometheus-alerts.mjs
run_step "check:workflow-pnpm-filters:tests" node scripts/src/check-workflow-pnpm-filters.test.mjs
run_step "check:workflow-pnpm-filters" pnpm -s run check:workflow-pnpm-filters
run_step "check:workflow-silent-failures:tests" node scripts/src/check-workflow-silent-failures.test.mjs
run_step "check:workflow-silent-failures" pnpm -s run check:workflow-silent-failures
# Vitest auto-discovers tests/**/*.test.ts in api-server. We pass an
# explicit JSON reporter (in addition to the default human one) so the
# follow-up step can verify Task #384's ZATCA B2C spike-pause suite was
# actually picked up + ran (not silently skipped). See Task #388 +
# scripts/src/check-zatca-spike-pause-test-ran.mjs.
VITEST_JSON_REPORT="/tmp/vitest-api-server.json"
rm -f "$VITEST_JSON_REPORT"
run_step "test"               pnpm -s --filter @workspace/api-server run test -- \
  --reporter=default --reporter=json --outputFile.json="$VITEST_JSON_REPORT"
run_step "check:zatca-spike-pause-test-ran" \
  env VITEST_REPORT_PATH="$VITEST_JSON_REPORT" \
  node scripts/src/check-zatca-spike-pause-test-ran.mjs

END=$(date +%s)
echo
echo -e "${PASS} guard.sh green — all $((END - START))s"
