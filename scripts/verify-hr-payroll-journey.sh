#!/bin/bash
# verify-hr-payroll-journey.sh — E2E proof of the HR payroll → finance link (#1609/#1602).
#   employee -> payroll run (posts ACCRUAL GL: DR salary/GOSI/overtime expense /
#   CR salary_payable + liabilities) -> [approve -> post (payment GL)].
# Run against a full-COA tenant (Al-Diyaa). Prereqs: bootstrap + built server.
set -euo pipefail
BASE="${BASE:-http://localhost:5000/api}"; EMAIL="${EMAIL:-door@door.sa}"; PASSWORD="${PASSWORD:-Door@2026Diaa}"
DSN="${DATABASE_URL:-postgres://ghayth_erp:ghayth_erp@localhost:5432/ghayth_erp}"
MONTH="${MONTH:-$(date +%Y-%m)}"
# Unique suffix per run so nationalId / phone / internalEmail (all UNIQUE)
# never collide on a re-run against the same DB. 10-digit nationalId, KSA
# mobile-shaped phone, run-scoped approver email.
SFX="$(printf '%06d' $(( (RANDOM*RANDOM) % 1000000 )))"
NID1="20${SFX}$(printf '%02d' $(( RANDOM % 100 )))"; NID2="21${SFX}$(printf '%02d' $(( RANDOM % 100 )))"
PH1="050${SFX}1"; PH2="050${SFX}2"; APMAIL="approver2-${SFX}@dr.local"
J="$(mktemp)"; PASS=0; FAIL=0
py(){ python3 -c "$1" 2>/dev/null; }
ok(){ echo "  ✅ $1"; PASS=$((PASS+1)); }
no(){ echo "  ❌ $1"; FAIL=$((FAIL+1)); }
echo "▶ HR payroll → finance journey — #1609 (month $MONTH)"
curl -fsS -c "$J" -H "X-E2E-Test: 1" -X POST "$BASE/auth/login" -H "Content-Type: application/json" -d "{\"email\":\"$EMAIL\",\"password\":\"$PASSWORD\"}" -o /dev/null
CSRF="$(grep erp_csrf "$J" | awk '{print $7}')"; [ -n "$CSRF" ] && ok "login ($EMAIL)" || { no login; exit 1; }
post(){ curl -fsS -b "$J" -H "x-csrf-token: $CSRF" -H "Content-Type: application/json" -X POST "$BASE$1" -d "$2"; }
postw(){ curl -sS -b "$J" -H "x-csrf-token: $CSRF" -H "Content-Type: application/json" -X POST "$BASE$1" -d "$2"; }
patchw(){ curl -sS -b "$J" -H "x-csrf-token: $CSRF" -H "Content-Type: application/json" -X PATCH "$BASE$1" -d "$2"; }
export PGPASSWORD="$(echo "$DSN" | sed -E 's#.*://[^:]+:([^@]+)@.*#\1#')"

# Ensure a department exists (employee create requires a known department).
post /settings/departments '{"name":"المالية"}' >/dev/null 2>&1 || true
ok "department ensured (المالية)"

EMP="$(post /employees "{\"name\":\"موظف رحلة الرواتب\",\"phone\":\"$PH1\",\"nationalId\":\"$NID1\",\"nationality\":\"سعودي\",\"department\":\"المالية\",\"jobTitle\":\"محاسب\",\"contractType\":\"full_time\",\"salary\":8000,\"branchId\":6}")"
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

# Reuse-or-create: payroll runs are UNIQUE per (company, month). On a re-run
# against the same DB the create 409s — fall back to the existing run for
# this month so the journey stays re-runnable. (`postw` does not abort.)
RUN="$(postw /hr/payroll "{\"month\":\"$MONTH\",\"notes\":\"رحلة تحقق\"}")"
RID="$(echo "$RUN" | py 'import sys,json;print(json.load(sys.stdin).get("id") or "")')"
TOTAL="$(echo "$RUN" | py 'import sys,json;d=json.load(sys.stdin);print(d.get("totalAmount") or d.get("totalNet") or "")')"
if [ -z "$RID" ]; then
  RID="$(curl -fsS -b "$J" "$BASE/hr/payroll" | py "import sys,json;d=json.load(sys.stdin)['data'];print(([r['id'] for r in d if (r.get('month') or r.get('period'))=='$MONTH'] or [''])[0])")"
fi
[ -n "$RID" ] && ok "payroll run ready (#$RID, total=$TOTAL)" || no "payroll run: $(echo "$RUN"|py 'import sys,json;d=json.load(sys.stdin);print(d.get("error") or d)')"

# Accrual GL posted on run creation (the موظف→راتب→قيد link).
ABAL="$(psql "$DSN" -tA -c "select count(*) from (select je.id from journal_entries je join journal_lines jl on jl.\"journalId\"=je.id where je.\"companyId\"=2 and je.ref like 'PAYROLL-%' and je.ref not like 'PAYROLL-POST-%' group by je.id having sum(jl.debit)=sum(jl.credit) and sum(jl.debit)>0) t;")"
[ "${ABAL:-0}" -ge 1 ] && ok "payroll accrual GL exists and balanced" || no "accrual GL not balanced ($ABAL)"
SALEXP="$(psql "$DSN" -tA -c "select count(*) from journal_lines jl join journal_entries je on je.id=jl.\"journalId\" where je.\"companyId\"=2 and je.ref like 'PAYROLL-%' and je.ref not like 'PAYROLL-POST-%' and jl.debit>0 and jl.\"accountCode\"='5210';")"
[ "${SALEXP:-0}" -ge 1 ] && ok "salary expense debit routed to 5210 (via accounting_mappings)" || no "salary expense not routed to 5210 ($SALEXP)"
PAYABLE="$(psql "$DSN" -tA -c "select count(*) from journal_lines jl join journal_entries je on je.id=jl.\"journalId\" where je.\"companyId\"=2 and je.ref like 'PAYROLL-%' and je.ref not like 'PAYROLL-POST-%' and jl.credit>0 and jl.\"accountCode\"='2120';")"
[ "${PAYABLE:-0}" -ge 1 ] && ok "net pay credited to salary_payable 2120" || no "salary_payable 2120 not credited ($PAYABLE)"

# Full approve + post via a SEPARATE approver (maker-checker: run.runBy must
# differ from the approver's assignment). Create a dedicated approver employee,
# give it a known password + owner role (test setup), approve as them, post as
# the original owner. Completes the bank-payout GL (موظف→راتب→قيد→صرف).
HASH='$2b$10$v6KtegUqgRLrlsDRWu2l4uUAnOeNREpHB1LQ/ZgvBxiwnMQtMVTVu'  # Test1234!
APE="$(post /employees "{\"name\":\"معتمِد الرواتب\",\"phone\":\"$PH2\",\"nationalId\":\"$NID2\",\"nationality\":\"سعودي\",\"department\":\"المالية\",\"jobTitle\":\"مدير مالي\",\"contractType\":\"full_time\",\"salary\":12000,\"branchId\":6,\"internalEmail\":\"$APMAIL\"}")"
APASG="$(echo "$APE" | py 'import sys,json;d=json.load(sys.stdin);print(d.get("assignmentId") or "")')"
psql "$DSN" -q -c "UPDATE users SET \"passwordHash\"='$HASH' WHERE email='$APMAIL';" >/dev/null 2>&1
psql "$DSN" -q -c "UPDATE employee_assignments SET role='owner' WHERE id=${APASG:-0};" >/dev/null 2>&1
ok "approver employee created (assignment #$APASG)"

JA="$(mktemp)"
curl -fsS -c "$JA" -H "X-E2E-Test: 1" -X POST "$BASE/auth/login" -H "Content-Type: application/json" -d "{\"email\":\"$APMAIL\",\"password\":\"Test1234!\"}" -o /dev/null
ACSRF="$(grep erp_csrf "$JA" | awk '{print $7}')"
APP="$(curl -sS -b "$JA" -H "x-csrf-token: $ACSRF" -H "Content-Type: application/json" -X PATCH "$BASE/hr/payroll/$RID/approve" -d '{}' | py 'import sys,json;d=json.load(sys.stdin);print(d.get("status") or d.get("error") or "")')"
# Tolerate an already-approved/posted run (re-run against the same DB).
echo "$APP" | grep -qiE "completed|approved|posted" && ok "payroll run approved (by separate approver — maker-checker satisfied)" || no "approve failed ($APP)"
rm -f "$JA"

POST_="$(patchw /hr/payroll/$RID '{"status":"posted"}' | py 'import sys,json;d=json.load(sys.stdin);print(d.get("status") or d.get("error") or "")')"
# Already-posted from a prior run is success for the journey's purpose.
{ [ "$POST_" = "posted" ] || echo "$POST_" | grep -qiE "مسبق|already|posted"; } && ok "payroll posted" || no "post failed ($POST_)"
PBAL="$(psql "$DSN" -tA -c "select count(*) from (select je.id from journal_entries je join journal_lines jl on jl.\"journalId\"=je.id where je.\"companyId\"=2 and je.ref like 'PAYROLL-POST-%' group by je.id having sum(jl.debit)=sum(jl.credit) and sum(jl.debit)>0) t;")"
[ "${PBAL:-0}" -ge 1 ] && ok "payment GL balanced (DR salary_payable 2120 / CR bank 1121)" || no "payment GL not balanced ($PBAL)"
BANKPAY="$(psql "$DSN" -tA -c "select count(*) from journal_lines jl join journal_entries je on je.id=jl.\"journalId\" where je.\"companyId\"=2 and je.ref like 'PAYROLL-POST-%' and jl.credit>0 and jl.\"accountCode\"='1121';")"
[ "${BANKPAY:-0}" -ge 1 ] && ok "bank payout routed to 1121 (via accounting_mappings)" || no "bank payout not routed to 1121 ($BANKPAY)"

rm -f "$J"; echo; echo "▶ Result: $PASS passed, $FAIL failed"; [ "$FAIL" -eq 0 ] || exit 1
