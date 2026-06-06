#!/bin/bash
#
# verify-finance-posting-journey.sh — reproducible end-to-end proof of the
# finance posting journey for issue #1594 (Operational Readiness).
#
# Proves, against a LIVE running API + Postgres:
#   client -> invoice -> approve (balanced GL entry) -> post
#           -> close fiscal period -> posting BLOCKED in closed period
#
# This is the regression guard for the two operational blockers fixed in
# migrations 204_repair_serial_id_defaults.sql and
# 251_align_invoice_status_constraint_with_lifecycle.sql.
#
# Prerequisites:
#   1. bash db/bootstrap.sh                      # fresh local DB
#   2. cd artifacts/api-server && pnpm run build && pnpm run start   # API on :5000
#
# Usage:
#   bash scripts/verify-finance-posting-journey.sh
#
# Env overrides: BASE (default http://localhost:5000/api),
#   EMAIL (owner@local.test), PASSWORD (Test1234!),
#   DATABASE_URL (postgres://ghayth_erp:ghayth_erp@localhost:5432/ghayth_erp)

set -euo pipefail

BASE="${BASE:-http://localhost:5000/api}"
EMAIL="${EMAIL:-owner@local.test}"
PASSWORD="${PASSWORD:-Test1234!}"
DSN="${DATABASE_URL:-postgres://ghayth_erp:ghayth_erp@localhost:5432/ghayth_erp}"
J="$(mktemp)"
PASS=0; FAIL=0

py(){ python3 -c "$1" 2>/dev/null; }
ok(){ echo "  ✅ $1"; PASS=$((PASS+1)); }
no(){ echo "  ❌ $1"; FAIL=$((FAIL+1)); }

echo "▶ Finance posting journey — #1594"
echo "  API: $BASE"

# --- auth (HttpOnly cookies + CSRF) ---
curl -fsS -c "$J" -X POST "$BASE/auth/login" \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"$EMAIL\",\"password\":\"$PASSWORD\"}" -o /dev/null
CSRF="$(grep erp_csrf "$J" | awk '{print $7}')"
[ -n "$CSRF" ] && ok "login" || { no "login"; exit 1; }

post(){ curl -fsS -b "$J" -H "x-csrf-token: $CSRF" -H "Content-Type: application/json" -X POST "$BASE$1" -d "$2"; }
postw(){ curl -sS -b "$J" -H "x-csrf-token: $CSRF" -H "Content-Type: application/json" -X POST "$BASE$1" -d "$2"; } # may fail (guard test)
get(){ curl -fsS -b "$J" "$BASE$1"; }

# --- 1. client ---
CID="$(post /clients '{"name":"عميل تحقق الرحلة المالية","classification":"regular"}' | py 'import sys,json;print(json.load(sys.stdin).get("id"))')"
[ -n "$CID" ] && ok "client created (#$CID)" || no "client create"

# --- open period ---
PID="$(get /finance/fiscal-periods-v2 | py 'import sys,json;d=json.load(sys.stdin)["data"];print([p["id"] for p in d if p["status"]=="open" and p["companyId"]==1][0])')"
[ -n "$PID" ] && ok "open fiscal period (#$PID)" || no "no open period"

# --- 2. invoice ---
INV="$(post /finance/invoices "{\"clientId\":$CID,\"date\":\"$(date +%Y-%m-%d)\",\"paymentTermsDays\":30,\"lines\":[{\"description\":\"خدمة\",\"quantity\":2,\"unitPrice\":750}]}")"
IID="$(echo "$INV" | py 'import sys,json;print(json.load(sys.stdin).get("id"))')"
TOTAL="$(echo "$INV" | py 'import sys,json;print(json.load(sys.stdin).get("total"))')"
[ -n "$IID" ] && ok "invoice created (#$IID, total=$TOTAL)" || no "invoice create"

# --- 3. approve -> GL ---
ST="$(post /finance/invoices/$IID/approve '{}' | py 'import sys,json;print(json.load(sys.stdin).get("status"))')"
[ "$ST" = "approved" ] && ok "approved" || no "approve (status=$ST)"
BAL="$(psql "$DSN" -tA -c "select sum(debit)::numeric=sum(credit)::numeric and sum(debit)>0 from journal_lines jl join journal_entries je on je.id=jl.\"journalId\" where je.\"sourceType\"='invoice' and je.\"sourceId\"=$IID;")"
[ "$BAL" = "t" ] && ok "GL entry exists and balanced" || no "GL entry not balanced ($BAL)"

# --- 4. post ---
ST="$(post /finance/invoices/$IID/post '{}' | py 'import sys,json;print(json.load(sys.stdin).get("status"))')"
[ "$ST" = "posted" ] && ok "posted" || no "post (status=$ST)"

# --- 5. close period ---
ST="$(post /finance/fiscal-periods-v2/$PID/close '{"notes":"verify-journey"}' | py 'import sys,json;print(json.load(sys.stdin).get("status"))')"
[ "$ST" = "closed" ] && ok "fiscal period closed" || no "close period (status=$ST)"

# --- 6. posting blocked in closed period ---
# The financial_period guard fires at the earliest GL-affecting action
# (creating an invoice dated inside the now-closed period).
CODE="$(postw /finance/invoices "{\"clientId\":$CID,\"date\":\"$(date +%Y-%m-%d)\",\"paymentTermsDays\":30,\"lines\":[{\"description\":\"بعد الإغلاق\",\"quantity\":1,\"unitPrice\":100}]}" | py 'import sys,json;print(json.load(sys.stdin).get("code"))')"
[ "$CODE" = "SYSTEM_GUARD_BLOCK" ] && ok "GL action blocked in closed period (SYSTEM_GUARD_BLOCK)" || no "closed-period guard not enforced (code=$CODE)"

# --- 7. journey engine wired (#1604): invoice journey tracked + completed ---
JST="$(psql "$DSN" -tA -c "select status from journey_instances where \"journeyType\"='finance_invoice' and \"entityType\"='invoices' and \"entityId\"=$IID;")"
[ "$JST" = "completed" ] && ok "journey_instances tracked finance_invoice → completed" || no "journey not completed (status=$JST)"

rm -f "$J"
echo
echo "▶ Result: $PASS passed, $FAIL failed"
[ "$FAIL" -eq 0 ] || exit 1
