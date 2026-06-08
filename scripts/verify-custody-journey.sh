#!/bin/bash
# verify-custody-journey.sh — E2E proof of the custody (العهد) journey
# (#1594 Phase 3.1 HR/Finance): disbursement → approval → settlement, each
# posting a balanced GL entry through the EXISTING finance-custodies routes
# (custody account 1113/1400 ↔ cash 1111 ↔ expense on settle). No new engine.
# Re-runnable (each custody carries a unique idempotency ref).
# Prereqs: bootstrap + built server (الضياء tenant: postable 1111 + 55xx).
set -euo pipefail
BASE="${BASE:-http://localhost:5000/api}"; EMAIL="${EMAIL:-door@door.sa}"; PASSWORD="${PASSWORD:-Door@2026Diaa}"
DSN="${DATABASE_URL:-postgres://ghayth_erp:ghayth_erp@localhost:5432/ghayth_erp}"
J="$(mktemp)"; PASS=0; FAIL=0
py(){ python3 -c "$1" 2>/dev/null; }
ok(){ echo "  ✅ $1"; PASS=$((PASS+1)); }
no(){ echo "  ❌ $1"; FAIL=$((FAIL+1)); }
echo "▶ Custody journey — #1594 (عهدة→اعتماد→تسوية، قيود متوازنة)"
curl -fsS -c "$J" -H "X-E2E-Test: 1" -X POST "$BASE/auth/login" -H "Content-Type: application/json" -d "{\"email\":\"$EMAIL\",\"password\":\"$PASSWORD\"}" -o /dev/null
CSRF="$(grep erp_csrf "$J" | awk '{print $7}')"; [ -n "$CSRF" ] && ok "login ($EMAIL)" || { no login; exit 1; }
pw(){ curl -sS -b "$J" -H "x-csrf-token: $CSRF" -H "Content-Type: application/json" -X POST "$BASE$1" -d "$2"; }
ptch(){ curl -sS -b "$J" -H "x-csrf-token: $CSRF" -H "Content-Type: application/json" -X PATCH "$BASE$1" -d "$2"; }
gid(){ py "import sys,json;d=json.load(sys.stdin);print(d.get('$1') or '')"; }
export PGPASSWORD="$(echo "$DSN" | sed -E 's#.*://[^:]+:([^@]+)@.*#\1#')"

ASG="$(psql "$DSN" -tA -c "select id from employee_assignments where \"companyId\"=2 and status='active' and salary>0 order by id limit 1;")"
[ -n "$ASG" ] && ok "تعيين موظف موجود (#$ASG)" || { no "no assignment"; exit 1; }

# 1) Disburse a custody from the postable cash leaf (1111) — posts the GL.
C="$(pw /finance/custodies "{\"assignmentId\":$ASG,\"amount\":1500,\"description\":\"عهدة نثرية\",\"sourceAccountCode\":\"1111\",\"paymentMethod\":\"cash\"}")"
CID="$(echo "$C" | gid id)"; CST="$(echo "$C" | gid status)"
{ [ -n "$CID" ] && [ "$CST" = "pending_approval" ]; } && ok "عهدة صُرفت (JE #$CID، pending_approval)" || no "custody create (id=$CID st=$CST err=$(echo "$C"|gid error))"
DBAL="$(psql "$DSN" -tA -c "select (sum(debit)=sum(credit) and sum(debit)>0)::text from journal_lines where \"journalId\"=${CID:-0};")"
[ "$DBAL" = "true" ] && ok "قيد الصرف متوازن (مدين عهدة / دائن نقدية)" || no "disbursement JE not balanced ($DBAL)"

# 2) Approve.
AST="$(ptch /finance/custodies/$CID/approve '{"approved":true}' | gid status)"
[ "$AST" = "approved" ] && ok "العهدة معتمدة (approved)" || no "approve ($AST)"

# 3) Settle against a postable expense (consumes the custody).
S="$(pw /finance/custodies/$CID/settle '{"amount":1500,"sourceAccountCode":"5520","description":"تسوية كاملة"}')"
SID="$(echo "$S" | gid id)"; SREF="$(echo "$S" | gid ref)"
[ -n "$SID" ] && ok "تسوية مُرحَّلة (JE #$SID، $SREF)" || no "settle (id=$SID err=$(echo "$S"|gid error))"
SBAL="$(psql "$DSN" -tA -c "select (sum(debit)=sum(credit) and sum(debit)>0)::text from journal_lines where \"journalId\"=${SID:-0};")"
[ "$SBAL" = "true" ] && ok "قيد التسوية متوازن (مدين مصروف / دائن عهدة)" || no "settlement JE not balanced ($SBAL)"

rm -f "$J"; echo; echo "▶ Result: $PASS passed, $FAIL failed"; [ "$FAIL" -eq 0 ] || exit 1
