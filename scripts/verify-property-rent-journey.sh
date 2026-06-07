#!/bin/bash
# verify-property-rent-journey.sh — E2E proof of the Properties rental journey (#1609).
#   building -> unit -> rental contract (auto rent schedule) -> pay rent
#   -> balanced GL (DR rent A/R 1131 / CR rent revenue 4121)
# Run against a full-COA tenant (Al-Diyaa). Prereqs: bootstrap + built server.
set -euo pipefail
BASE="${BASE:-http://localhost:5000/api}"; EMAIL="${EMAIL:-door@door.sa}"; PASSWORD="${PASSWORD:-Door@2026Diaa}"
DSN="${DATABASE_URL:-postgres://ghayth_erp:ghayth_erp@localhost:5432/ghayth_erp}"
J="$(mktemp)"; PASS=0; FAIL=0
py(){ python3 -c "$1" 2>/dev/null; }
ok(){ echo "  ✅ $1"; PASS=$((PASS+1)); }
no(){ echo "  ❌ $1"; FAIL=$((FAIL+1)); }
gid(){ py 'import sys,json;print(json.load(sys.stdin).get("id") or "")'; }
echo "▶ Property rent journey — #1609"
curl -fsS -c "$J" -H "X-E2E-Test: 1" -X POST "$BASE/auth/login" -H "Content-Type: application/json" -d "{\"email\":\"$EMAIL\",\"password\":\"$PASSWORD\"}" -o /dev/null
CSRF="$(grep erp_csrf "$J" | awk '{print $7}')"; [ -n "$CSRF" ] && ok "login ($EMAIL)" || { no login; exit 1; }
post(){ curl -fsS -b "$J" -H "x-csrf-token: $CSRF" -H "Content-Type: application/json" -X POST "$BASE$1" -d "$2"; }
export PGPASSWORD="$(echo "$DSN" | sed -E 's#.*://[^:]+:([^@]+)@.*#\1#')"

BID="$(post /properties/buildings '{"name":"برج التحقق","city":"الرياض","type":"residential"}' | gid)"
[ -n "$BID" ] && ok "building created (#$BID)" || no "building"
UID_="$(post /properties/units "{\"unitNumber\":\"V-101\",\"buildingId\":$BID,\"type\":\"apartment\",\"monthlyRent\":3000,\"status\":\"available\"}" | gid)"
[ -n "$UID_" ] && ok "unit created (#$UID_)" || no "unit"
CON="$(post /properties/contracts "{\"unitId\":$UID_,\"tenantName\":\"مستأجر التحقق\",\"tenantPhone\":\"0500000000\",\"startDate\":\"2026-01-01\",\"endDate\":\"2026-12-31\",\"monthlyRent\":3000,\"paymentFrequency\":\"monthly\",\"status\":\"active\"}")"
CID="$(echo "$CON" | gid)"
[ -n "$CID" ] && ok "rental contract created (#$CID)" || no "contract: $(echo "$CON"|py 'import sys,json;d=json.load(sys.stdin);print(d.get("error") or d)')"

# First scheduled rent payment id (from rent_payments for this contract).
RPID="$(psql "$DSN" -tA -c "select id from rent_payments where \"contractId\"=$CID order by id asc limit 1;")"
[ -n "$RPID" ] && ok "rent schedule generated (first payment #$RPID)" || no "no rent schedule rows"

PAY="$(post /properties/payments/$RPID/pay '{"paidAmount":3000,"method":"bank_transfer"}')"
PST="$(echo "$PAY" | py 'import sys,json;d=json.load(sys.stdin);print(d.get("status") or "")')"
echo "$PST" | grep -qiE "paid|partial" && ok "rent payment recorded (status=$PST)" || no "rent pay (status=$PST | $(echo "$PAY"|py 'import sys,json;d=json.load(sys.stdin);print(d.get("error") or "")'))"

BAL="$(psql "$DSN" -tA -c "select count(*) from (select je.id from journal_entries je join journal_lines jl on jl.\"journalId\"=je.id where je.\"companyId\"=2 and je.\"sourceType\"='rent_payments' and je.\"sourceId\"=$RPID group by je.id having sum(jl.debit)=sum(jl.credit) and sum(jl.debit)>0) t;")"
[ "${BAL:-0}" -ge 1 ] && ok "rent payment GL exists and balanced" || no "rent GL not balanced ($BAL)"
REV="$(psql "$DSN" -tA -c "select count(*) from journal_lines jl join journal_entries je on je.id=jl.\"journalId\" where je.\"companyId\"=2 and je.\"sourceType\"='rent_payments' and je.\"sourceId\"=$RPID and jl.credit>0 and jl.\"accountCode\"='4121';")"
[ "${REV:-0}" -ge 1 ] && ok "rent revenue routed to 4121 (via accounting_mappings)" || no "rent revenue not routed to 4121 ($REV)"

rm -f "$J"; echo; echo "▶ Result: $PASS passed, $FAIL failed"; [ "$FAIL" -eq 0 ] || exit 1
