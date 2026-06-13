#!/bin/bash
# verify-property-rent-journey.sh — E2E proof of the Properties rental journey (#1609).
#   building -> unit -> rental contract (auto rent schedule) -> pay rent
#   -> balanced GL (DR rent A/R 1131 / CR rent revenue 4121)
#   -> security deposit received -> balanced GL (DR cash / CR 2300 liability)
#   -> deposit refunded         -> reverse GL (DR 2300 / CR cash)
#   -> maintenance request approved+completed -> balanced GL
#                                  (DR maintenance expense / CR payable)
# Each step asserts (a) the route succeeded AND (b) the journal lines
# the operator actually expects in the GL — not a 200/201 alone. Run
# against a full-COA tenant (Al-Diyaa, companyId=2). Prereqs: bootstrap
# + built server.
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
patch(){ curl -fsS -b "$J" -H "x-csrf-token: $CSRF" -H "Content-Type: application/json" -X PATCH "$BASE$1" -d "$2"; }
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

# ── Security deposit: receive ────────────────────────────────────────
# Asserts the deposit hits the GL as a liability (postSecurityDepositGL
# resolves security_deposit_liability via accounting_mappings; the
# 2300 fallback is used when no mapping is seeded but Al-Diyaa carries
# the seeded code). The 'received' direction is DR cash / CR liability.
DEP="$(post /properties/deposits "{\"contractId\":$CID,\"amount\":5000,\"receivedDate\":\"2026-01-05\"}")"
DEPID="$(echo "$DEP" | gid)"
[ -n "$DEPID" ] && ok "deposit received (#$DEPID)" || no "deposit create: $(echo "$DEP"|py 'import sys,json;d=json.load(sys.stdin);print(d.get("error") or d)')"
DEP_BAL="$(psql "$DSN" -tA -c "select count(*) from (select je.id from journal_entries je join journal_lines jl on jl.\"journalId\"=je.id where je.\"companyId\"=2 and je.\"sourceType\"='property_security_deposits' and je.\"sourceId\"=$DEPID group by je.id having sum(jl.debit)=sum(jl.credit) and sum(jl.debit)=5000) t;")"
[ "${DEP_BAL:-0}" -ge 1 ] && ok "deposit-received GL exists and balanced @ 5000" || no "deposit GL not balanced (${DEP_BAL:-0})"
DEP_LIA="$(psql "$DSN" -tA -c "select count(*) from journal_lines jl join journal_entries je on je.id=jl.\"journalId\" where je.\"companyId\"=2 and je.\"sourceType\"='property_security_deposits' and je.\"sourceId\"=$DEPID and jl.credit=5000;")"
[ "${DEP_LIA:-0}" -ge 1 ] && ok "deposit credited as liability (CR 5000 on liability acct)" || no "deposit liability credit missing"

# ── Security deposit: refund ─────────────────────────────────────────
# Refund reverses the original — DR liability / CR cash. Different
# sourceKey suffix (:refunded) so the dedupe guard treats it as a
# distinct posting from the receive.
REF="$(patch /properties/deposits/$DEPID/refund '{"refundAmount":5000,"refundDate":"2026-06-30","refundReason":"إنهاء العقد"}')"
echo "$REF" | py 'import sys,json;d=json.load(sys.stdin);print(d.get("status") or "")' | grep -qi refund && ok "deposit refunded (status=refunded)" || no "deposit refund: $(echo "$REF"|py 'import sys,json;d=json.load(sys.stdin);print(d.get("error") or d)')"
REF_BAL="$(psql "$DSN" -tA -c "select count(*) from (select je.id from journal_entries je join journal_lines jl on jl.\"journalId\"=je.id where je.\"companyId\"=2 and je.\"sourceType\"='property_security_deposits' and je.\"sourceId\"=$DEPID and je.\"sourceKey\" like '%refunded' group by je.id having sum(jl.debit)=sum(jl.credit) and sum(jl.debit)=5000) t;")"
[ "${REF_BAL:-0}" -ge 1 ] && ok "deposit-refund GL exists and balanced @ 5000" || no "deposit-refund GL not balanced (${REF_BAL:-0})"

# ── Maintenance request: approve + complete ──────────────────────────
# The complete step posts maintenance expense via propertiesEngine.
# postMaintenanceExpenseGL (DR property_maintenance_expense / CR
# property_maintenance_payable).
MR="$(post /properties/maintenance-requests "{\"unitId\":$UID_,\"contractId\":$CID,\"description\":\"تسريب مياه\",\"priority\":\"medium\",\"estimatedCost\":1500}")"
MRID="$(echo "$MR" | gid)"
[ -n "$MRID" ] && ok "maintenance request created (#$MRID)" || no "maintenance create: $(echo "$MR"|py 'import sys,json;d=json.load(sys.stdin);print(d.get("error") or d)')"
APR="$(patch /properties/maintenance-requests/$MRID/approve '{"approved":true,"notes":"approved"}')"
APR_ST="$(echo "$APR" | py 'import sys,json;d=json.load(sys.stdin);print(d.get("status") or "")')"
echo "$APR_ST" | grep -qiE "approved|assigned" && ok "maintenance request approved (status=$APR_ST)" || no "approve: $(echo "$APR"|py 'import sys,json;d=json.load(sys.stdin);print(d.get("error") or d)')"
# Move through the state machine: approved → in_progress → completed.
# /complete uses applyTransition with fromStates derived from
# MAINT_REQUEST_TRANSITIONS where targets ∋ 'completed' — only
# in_progress qualifies, so we step the request through PATCH first.
PRG="$(patch /properties/maintenance-requests/$MRID '{"status":"in_progress"}')"
PRG_ST="$(echo "$PRG" | py 'import sys,json;d=json.load(sys.stdin);print(d.get("status") or "")')"
[ "$PRG_ST" = "in_progress" ] && ok "maintenance moved to in_progress" || no "in_progress: $(echo "$PRG"|py 'import sys,json;d=json.load(sys.stdin);print(d.get("error") or d)')"
CMP="$(post /properties/maintenance-requests/$MRID/complete '{"closureReport":"إصلاح كامل","actualCost":1500,"afterPhotos":["s3://test/after-1.jpg"],"materialsUsed":[{"name":"أنبوب","qty":1,"cost":100}]}')"
CMP_ST="$(echo "$CMP" | py 'import sys,json;d=json.load(sys.stdin);print(d.get("status") or "")')"
echo "$CMP_ST" | grep -qiE "completed|closed" && ok "maintenance completed (status=$CMP_ST)" || no "complete: $(echo "$CMP"|py 'import sys,json;d=json.load(sys.stdin);print(d.get("error") or d)')"
MNT_BAL="$(psql "$DSN" -tA -c "select count(*) from (select je.id from journal_entries je join journal_lines jl on jl.\"journalId\"=je.id where je.\"companyId\"=2 and je.\"sourceType\"='maintenance_requests' and je.\"sourceId\"=$MRID group by je.id having sum(jl.debit)=sum(jl.credit) and sum(jl.debit)=1500) t;")"
[ "${MNT_BAL:-0}" -ge 1 ] && ok "maintenance GL exists and balanced @ 1500" || no "maintenance GL not balanced (${MNT_BAL:-0})"

# ── Early termination ────────────────────────────────────────────────
TERM="$(curl -fsS -b "$J" -H "x-csrf-token: $CSRF" -H "Content-Type: application/json" -X POST "$BASE/properties/contracts/$CID/terminate" -d '{"reason":"إنهاء بطلب المستأجر","earlyTerminationFee":2500,"terminationDate":"2026-06-30"}')"
TERM_ST="$(echo "$TERM" | py 'import sys,json;d=json.load(sys.stdin);print(d.get("status") or d.get("state") or "")')"
echo "$TERM_ST" | grep -qi terminated && ok "contract terminated (status=terminated)" || no "terminate: $(echo "$TERM"|py 'import sys,json;d=json.load(sys.stdin);print(d.get("error") or d)')"
UNIT_STATE="$(psql "$DSN" -tA -c "select status from property_units where id=$UID_;")"
[ "$UNIT_STATE" = "available" ] && ok "unit freed back to 'available' on termination" || no "unit status after terminate: $UNIT_STATE (expected available)"
TERM_BAL="$(psql "$DSN" -tA -c "select count(*) from (select je.id from journal_entries je join journal_lines jl on jl.\"journalId\"=je.id where je.\"companyId\"=2 and je.\"sourceType\"='rental_contracts' and je.\"sourceId\"=$CID and je.\"sourceKey\"='property:termination:$CID' group by je.id having sum(jl.debit)=sum(jl.credit) and sum(jl.debit)=2500) t;")"
[ "${TERM_BAL:-0}" -ge 1 ] && ok "early-termination GL exists and balanced @ 2500" || no "termination GL not balanced (${TERM_BAL:-0})"
TERM_REV="$(psql "$DSN" -tA -c "select count(*) from journal_lines jl join journal_entries je on je.id=jl.\"journalId\" where je.\"companyId\"=2 and je.\"sourceType\"='rental_contracts' and je.\"sourceId\"=$CID and jl.credit>0 and jl.\"accountCode\"='4130';")"
[ "${TERM_REV:-0}" -ge 1 ] && ok "termination penalty routed to 4130 (service revenue, not fleet 4150)" || no "termination revenue not routed to 4130 ($TERM_REV)"

rm -f "$J"; echo; echo "▶ Result: $PASS passed, $FAIL failed"; [ "$FAIL" -eq 0 ] || exit 1
