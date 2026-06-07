#!/bin/bash
# verify-umrah-journey.sh — E2E proof of the Umrah journey (#1609 under #1594).
#   season -> agent -> pilgrim -> group -> sub-agent(+client) -> sales invoice
#   (balanced GL: DR AR / CR revenue / CR VAT) -> payment (DR cash / CR AR)
# Run against a full-COA tenant (Al-Diyaa). Prereqs: bootstrap + built server.
set -euo pipefail
BASE="${BASE:-http://localhost:5000/api}"; EMAIL="${EMAIL:-door@door.sa}"; PASSWORD="${PASSWORD:-Door@2026Diaa}"
DSN="${DATABASE_URL:-postgres://ghayth_erp:ghayth_erp@localhost:5432/ghayth_erp}"
J="$(mktemp)"; PASS=0; FAIL=0
py(){ python3 -c "$1" 2>/dev/null; }
ok(){ echo "  ✅ $1"; PASS=$((PASS+1)); }
no(){ echo "  ❌ $1"; FAIL=$((FAIL+1)); }
gid(){ py 'import sys,json;d=json.load(sys.stdin);print(d.get("id") or d.get("invoiceId") or d.get("paymentId") or d.get("subAgentId") or "")'; }
echo "▶ Umrah journey — #1609"
curl -fsS -c "$J" -H "X-E2E-Test: 1" -X POST "$BASE/auth/login" -H "Content-Type: application/json" -d "{\"email\":\"$EMAIL\",\"password\":\"$PASSWORD\"}" -o /dev/null
CSRF="$(grep erp_csrf "$J" | awk '{print $7}')"; [ -n "$CSRF" ] && ok "login ($EMAIL)" || { no login; exit 1; }
post(){ curl -fsS -b "$J" -H "x-csrf-token: $CSRF" -H "Content-Type: application/json" -X POST "$BASE$1" -d "$2"; }
put(){ curl -fsS -b "$J" -H "x-csrf-token: $CSRF" -H "Content-Type: application/json" -X PUT "$BASE$1" -d "$2"; }
export PGPASSWORD="$(echo "$DSN" | sed -E 's#.*://[^:]+:([^@]+)@.*#\1#')"

SID="$(post /umrah/seasons '{"title":"موسم تحقق 1447","startDate":"2026-01-01","endDate":"2026-12-31"}' | gid)"
[ -n "$SID" ] && ok "season created (#$SID)" || no "season"
AID="$(post /umrah/agents '{"name":"وكيل التحقق","phone":"0500000000","country":"SA"}' | gid)"
[ -n "$AID" ] && ok "agent created (#$AID)" || no "agent"
PID="$(post /umrah/pilgrims "{\"fullName\":\"معتمر التحقق\",\"passportNumber\":\"P-VERIFY-1\",\"seasonId\":$SID,\"agentId\":$AID}" | gid)"
[ -n "$PID" ] && ok "pilgrim created (#$PID)" || no "pilgrim"
GID="$(post /umrah/groups "{\"nuskGroupNumber\":\"NUSK-V1\",\"seasonId\":$SID,\"agentId\":$AID,\"mutamerCount\":1}" | gid)"
[ -n "$GID" ] && ok "group created (#$GID)" || no "group"
SAID="$(post /umrah/sub-agents "{\"nuskCode\":\"NUSK-SUB-V1\",\"name\":\"وكيل فرعي\",\"agentId\":$AID}" | gid)"
[ -n "$SAID" ] && ok "sub-agent created (#$SAID)" || no "sub-agent"
put /umrah/sub-agents/$SAID/link '{"createNew":true,"clientName":"عميل وكيل التحقق"}' >/dev/null && ok "sub-agent linked to client" || no "link"

INV="$(post /umrah/invoices/generate "{\"subAgentId\":$SAID,\"groupIds\":[$GID],\"seasonId\":$SID,\"manualPrices\":{\"$GID\":5000}}")"
IID="$(echo "$INV" | gid)"; TOT="$(echo "$INV" | py 'import sys,json;print(json.load(sys.stdin).get("total"))')"
[ -n "$IID" ] && ok "sales invoice generated (#$IID, total=$TOT)" || no "invoice generate"

BAL="$(psql "$DSN" -tA -c "select count(*) from (select je.id from journal_entries je join journal_lines jl on jl.\"journalId\"=je.id where je.\"sourceType\"='umrah_sales_invoices' and je.\"sourceId\"=$IID group by je.id having sum(jl.debit)=sum(jl.credit) and sum(jl.debit)>0) t;")"
[ "${BAL:-0}" -ge 1 ] && ok "umrah invoice GL entry exists and balanced" || no "umrah invoice GL not balanced ($BAL)"
# Per-agent routing (#1594): revenue posts to THIS agent's own subsidiary
# revenue account (a 4130-child), via resolveRevenueAccount.
REV="$(psql "$DSN" -tA -c "select count(*) from journal_lines jl join journal_entries je on je.id=jl.\"journalId\" join subsidiary_accounts sa on sa.\"accountId\"=(select id from chart_of_accounts where code=jl.\"accountCode\" and \"companyId\"=2) where je.\"sourceType\"='umrah_sales_invoices' and je.\"sourceId\"=$IID and jl.credit>0 and sa.\"entityType\"='umrah_agent' and sa.\"entityId\"=$AID and sa.\"accountType\"='revenue';")"
[ "${REV:-0}" -ge 1 ] && ok "revenue routed to the AGENT's own subsidiary revenue account (per-agent)" || no "revenue not routed to agent account ($REV)"

PAY="$(post /umrah/payments "{\"subAgentId\":$SAID,\"sarAmount\":${TOT:-5000},\"method\":\"bank_transfer\",\"invoiceIds\":[$IID]}")"
PYID="$(echo "$PAY" | gid)"
[ -n "$PYID" ] && ok "payment recorded (#$PYID)" || no "payment"
PBAL="$(psql "$DSN" -tA -c "select count(*) from (select je.id from journal_entries je join journal_lines jl on jl.\"journalId\"=je.id where je.\"sourceType\"='umrah_payments' group by je.id having sum(jl.debit)=sum(jl.credit) and sum(jl.debit)>0) t;")"
[ "${PBAL:-0}" -ge 1 ] && ok "payment GL entry exists and balanced" || no "payment GL not balanced ($PBAL)"

rm -f "$J"; echo; echo "▶ Result: $PASS passed, $FAIL failed"; [ "$FAIL" -eq 0 ] || exit 1
