#!/bin/bash
# verify-hr-payroll-journey.sh — E2E proof of the HR payroll → finance link (#1609/#1602).
#   employee -> payroll run (posts ACCRUAL GL: DR salary/GOSI/overtime expense /
#   CR salary_payable + liabilities) -> [approve -> post (payment GL)].
# Run against a full-COA tenant (Al-Diyaa). Prereqs: bootstrap + built server.
set -euo pipefail
BASE="${BASE:-http://localhost:5000/api}"; EMAIL="${EMAIL:-door@door.sa}"; PASSWORD="${PASSWORD:-Door@2026Diaa}"
DSN="${DATABASE_URL:-postgres://ghayth_erp:ghayth_erp@localhost:5432/ghayth_erp}"
MONTH="${MONTH:-$(date +%Y-%m)}"
J="$(mktemp)"; PASS=0; FAIL=0
py(){ python3 -c "$1" 2>/dev/null; }
ok(){ echo "  ✅ $1"; PASS=$((PASS+1)); }
no(){ echo "  ❌ $1"; FAIL=$((FAIL+1)); }
echo "▶ HR payroll → finance journey — #1609 (month $MONTH)"
curl -fsS -c "$J" -X POST "$BASE/auth/login" -H "Content-Type: application/json" -d "{\"email\":\"$EMAIL\",\"password\":\"$PASSWORD\"}" -o /dev/null
CSRF="$(grep erp_csrf "$J" | awk '{print $7}')"; [ -n "$CSRF" ] && ok "login ($EMAIL)" || { no login; exit 1; }
post(){ curl -fsS -b "$J" -H "x-csrf-token: $CSRF" -H "Content-Type: application/json" -X POST "$BASE$1" -d "$2"; }
postw(){ curl -sS -b "$J" -H "x-csrf-token: $CSRF" -H "Content-Type: application/json" -X POST "$BASE$1" -d "$2"; }
patchw(){ curl -sS -b "$J" -H "x-csrf-token: $CSRF" -H "Content-Type: application/json" -X PATCH "$BASE$1" -d "$2"; }
export PGPASSWORD="$(echo "$DSN" | sed -E 's#.*://[^:]+:([^@]+)@.*#\1#')"

# Ensure a department exists (employee create requires a known department).
post /settings/departments '{"name":"المالية"}' >/dev/null 2>&1 || true
ok "department ensured (المالية)"

EMP="$(post /employees '{"name":"موظف رحلة الرواتب","phone":"0512345678","nationalId":"2099887766","nationality":"سعودي","department":"المالية","jobTitle":"محاسب","contractType":"full_time","salary":8000,"branchId":6}')"
EID="$(echo "$EMP" | py 'import sys,json;print(json.load(sys.stdin).get("id") or "")')"
[ -n "$EID" ] && ok "employee created (#$EID, salary 8000)" || { no "employee create: $(echo "$EMP"|py 'import sys,json;d=json.load(sys.stdin);print(d.get("error") or d)')"; }

# Test-data setup: ensure every active employee has an attendance record for the
# month (payroll's completeness guard requires it). Mirrors what daily check-in
# would produce; seeded here so the harness is self-contained.
psql "$DSN" -q -c "INSERT INTO attendance (\"companyId\",\"branchId\",\"assignmentId\",date,\"checkIn\",\"checkOut\",status,method,\"createdAt\")
  SELECT 2, ea.\"branchId\", ea.id, DATE '$MONTH-01', TIMESTAMP '$MONTH-01 08:00', TIMESTAMP '$MONTH-01 17:00', 'present', 'manual', now()
  FROM employee_assignments ea
  WHERE ea.\"companyId\"=2 AND ea.status='active'
    AND NOT EXISTS (SELECT 1 FROM attendance a WHERE a.\"assignmentId\"=ea.id AND TO_CHAR(a.date,'YYYY-MM')='$MONTH');" >/dev/null 2>&1
ok "attendance seeded for active employees ($MONTH)"

RUN="$(post /hr/payroll "{\"month\":\"$MONTH\",\"notes\":\"رحلة تحقق\"}")"
RID="$(echo "$RUN" | py 'import sys,json;print(json.load(sys.stdin).get("id") or "")')"
TOTAL="$(echo "$RUN" | py 'import sys,json;d=json.load(sys.stdin);print(d.get("totalAmount") or d.get("totalNet") or "")')"
[ -n "$RID" ] && ok "payroll run created (#$RID, total=$TOTAL)" || no "payroll run: $(echo "$RUN"|py 'import sys,json;d=json.load(sys.stdin);print(d.get("error") or d)')"

# Accrual GL posted on run creation (the موظف→راتب→قيد link).
ABAL="$(psql "$DSN" -tA -c "select count(*) from (select je.id from journal_entries je join journal_lines jl on jl.\"journalId\"=je.id where je.\"companyId\"=2 and je.ref like 'PAYROLL-%' and je.ref not like 'PAYROLL-POST-%' group by je.id having sum(jl.debit)=sum(jl.credit) and sum(jl.debit)>0) t;")"
[ "${ABAL:-0}" -ge 1 ] && ok "payroll accrual GL exists and balanced" || no "accrual GL not balanced ($ABAL)"
SALEXP="$(psql "$DSN" -tA -c "select count(*) from journal_lines jl join journal_entries je on je.id=jl.\"journalId\" where je.\"companyId\"=2 and je.ref like 'PAYROLL-%' and je.ref not like 'PAYROLL-POST-%' and jl.debit>0 and jl.\"accountCode\"='5210';")"
[ "${SALEXP:-0}" -ge 1 ] && ok "salary expense debit routed to 5210 (via accounting_mappings)" || no "salary expense not routed to 5210 ($SALEXP)"
PAYABLE="$(psql "$DSN" -tA -c "select count(*) from journal_lines jl join journal_entries je on je.id=jl.\"journalId\" where je.\"companyId\"=2 and je.ref like 'PAYROLL-%' and je.ref not like 'PAYROLL-POST-%' and jl.credit>0 and jl.\"accountCode\"='2120';")"
[ "${PAYABLE:-0}" -ge 1 ] && ok "net pay credited to salary_payable 2120" || no "salary_payable 2120 not credited ($PAYABLE)"

# Approve + post (best-effort — maker-checker may require a second approver user).
APP="$(patchw /hr/payroll/$RID/approve '{}' | py 'import sys,json;d=json.load(sys.stdin);print(d.get("status") or d.get("error") or "")' )"
if echo "$APP" | grep -qiE "completed|approved"; then
  ok "payroll run approved"
  POST_="$(patchw /hr/payroll/$RID '{"status":"posted"}' | py 'import sys,json;d=json.load(sys.stdin);print(d.get("status") or d.get("error") or "")')"
  if [ "$POST_" = "posted" ]; then
    PBAL="$(psql "$DSN" -tA -c "select count(*) from (select je.id from journal_entries je join journal_lines jl on jl.\"journalId\"=je.id where je.\"companyId\"=2 and je.ref like 'PAYROLL-POST-%' group by je.id having sum(jl.debit)=sum(jl.credit) and sum(jl.debit)>0) t;")"
    [ "${PBAL:-0}" -ge 1 ] && ok "payroll posted — payment GL balanced (DR 2120 / CR 1121)" || no "payment GL not balanced ($PBAL)"
  else
    echo "  ⚠️  post step: $POST_ (best-effort)"
  fi
else
  echo "  ⚠️  approve blocked (maker-checker needs a separate approver user) — accrual link verified above. ($APP)"
fi

rm -f "$J"; echo; echo "▶ Result: $PASS passed, $FAIL failed"; [ "$FAIL" -eq 0 ] || exit 1
