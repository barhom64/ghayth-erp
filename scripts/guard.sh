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
#   5. Route identifiers vs live DB columns     → check:schema-drift
#   6. Soft-delete tables read w/o IS NULL      → check:ghost-rows
#   7. Cross-domain SQL writes (boundary leak)  → audit:domain-boundaries
#   8. Domain → routeFile mounting              → audit:domain-routes
#   9. Unit/smoke tests                         → test
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
  # Capture exit + tail of output for diagnostics on CI failure.
  local step_log
  step_log="$(mktemp)"
  if "$@" 2>&1 | tee "$step_log"; then
    local step_end=$(date +%s)
    echo -e "${PASS} [$name] ok (${name} took $((step_end - step_start))s)"
    rm -f "$step_log"
  else
    local rc=${PIPESTATUS[0]}
    echo -e "${FAIL} [$name] FAILED (exit=$rc)"
    # In GitHub Actions, post the failing step name + last 80 lines of its
    # output as a commit comment so we can read the real cause without
    # the actions:read scope.
    if [ -n "${GITHUB_ACTIONS:-}" ] && [ -n "${GITHUB_TOKEN:-}" ] && [ -n "${GITHUB_SHA:-}" ] && [ -n "${GITHUB_REPOSITORY:-}" ]; then
      local tail80
      tail80="$(tail -n 80 "$step_log" | sed 's/\x1b\[[0-9;]*m//g')"
      local body
      body="$(printf '### CI guard failed at step \`%s\` (exit=%s)\n\n<details><summary>Last 80 lines</summary>\n\n```\n%s\n```\n\n</details>' "$name" "$rc" "$tail80")"
      local payload
      payload="$(node -e 'process.stdout.write(JSON.stringify({body: process.argv[1]}))' "$body")"
      curl -sS -X POST \
        -H "Authorization: token ${GITHUB_TOKEN}" \
        -H "Accept: application/vnd.github+json" \
        "https://api.github.com/repos/${GITHUB_REPOSITORY}/commits/${GITHUB_SHA}/comments" \
        -d "$payload" >/dev/null || true
    fi
    rm -f "$step_log"
    exit 1
  fi
}

run_step "typecheck"          pnpm -s run typecheck
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
run_step "test"               pnpm -s --filter @workspace/api-server run test

END=$(date +%s)
echo
echo -e "${PASS} guard.sh green — all $((END - START))s"
