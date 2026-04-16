#!/usr/bin/env bash
#
# scripts/guard.sh — unified pre-commit / CI guard.
#
# Runs the full defensive stack in a fixed order, failing fast on the
# first red check. The goal is to catch every class of bug we have
# shipped to users before (in order of frequency):
#
#   1. Broken imports / missing functions       → typecheck
#   2. Banned legacy patterns                   → lint:patterns
#   3. Pages built but never wired to a route   → audit:routes
#   4. Raw SQL referencing dropped/typo columns → audit:schema
#
# Run directly:
#
#   bash scripts/guard.sh
#
# Or via root package.json:
#
#   pnpm guard
#
# Husky pre-commit hook (.husky/pre-commit) calls this file.
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

run_step "typecheck"      pnpm -s run typecheck
run_step "lint:patterns"  pnpm -s run lint:patterns
run_step "audit:routes"   node scripts/src/audit-routes.mjs
run_step "audit:schema"   node scripts/src/audit-schema-drift.mjs

END=$(date +%s)
echo
echo -e "${PASS} guard.sh green — all $((END - START))s"
