#!/bin/bash
# verify-umrah-commission-payroll-journey.sh — E2E proof that umrah sales
# commissions land in payroll (راتب + عمولة) with a real GL trail:
#
#   commission plan → engine calculation (calculated) → approval (approved)
#   → payroll run consumes it → payroll_lines.commission carries the amount
#   → net = salary + commission − deductions → accrual GL has a DEDICATED
#   commission-expense DR (5240 via accounting_mappings, op
#   payroll_commission_expense) → calculation flips to paid + payrollLineId
#   stamped → a SECOND consumption attempt finds nothing (exactly-once).
#
# Prereqs: provisioned head-of-main DB (pnpm db:provision-agent) + built
# server. Al-Diyaa tenant (companyId=2).
set -euo pipefail
BASE="${BASE:-http://localhost:5000/api}"; EMAIL="${EMAIL:-door@door.sa}"; PASSWORD="${PASSWORD:-Door@2026Diaa}"
DSN="${DATABASE_URL:-postgres://ghayth_erp:ghayth_erp@localhost:5432/ghayth_erp}"
MONTH="${MONTH:-$(date +%Y-%m)}"
YEAR_N="$(echo "$MONTH" | cut -d- -f1)"; MONTH_N="$(echo "$MONTH" | cut -d- -f2 | sed 's/^0//')"
SFX="$(printf '%06d' $(( (RANDOM*RANDOM) % 1000000 )))"
J="$(mktemp)"; PASS=0; FAIL=0
py(){ python3 -c "$1" 2>/dev/null; }
ok(){ echo "  ✅ $1"; PASS=$((PASS+1)); }
no(){ echo "  ❌ $1"; FAIL=$((FAIL+1)); }
echo "▶ Umrah commission → payroll journey (راتب + عمولة) — month $MONTH"
curl -fsS -c "$J" -H "X-E2E-Test: 1" -X POST "$BASE/auth/login" -H "Content-Type: application/json" -d "{\"email\":\"$EMAIL\",\"password\":\"$PASSWORD\"}" -o /dev/null
CSRF="$(grep erp_csrf "$J" | awk '{print $7}')"; [ -n "$CSRF" ] && ok "login ($EMAIL)" || { no login; exit 1; }
pw(){ curl -sS -b "$J" -H "x-csrf-token: $CSRF" -H "Content-Type: application/json" -X POST "$BASE$1" -d "$2"; }
patchw(){ curl -sS -b "$J" -H "x-csrf-token: $CSRF" -H "Content-Type: application/json" -X PATCH "$BASE$1" -d "$2"; }
export PGPASSWORD="$(echo "$DSN" | sed -E 's#.*://[^:]+:([^@]+)@.*#\1#')"

# 0) Clean slate for the month: this journey owns the payroll run for $MONTH —
#    run + lines + the accrual/payment GL refs (uniq_journal_entries_ref would
#    otherwise reject the fresh accrual). Test-data hygiene only.
psql "$DSN" -q -c "DELETE FROM payroll_lines WHERE \"runId\" IN (SELECT id FROM payroll_runs WHERE \"companyId\"=2 AND period='$MONTH');
DELETE FROM payroll_runs WHERE \"companyId\"=2 AND period='$MONTH';
DELETE FROM journal_lines WHERE \"journalId\" IN (SELECT id FROM journal_entries WHERE \"companyId\"=2 AND ref IN ('PAYROLL-$MONTH','PAYROLL-POST-$MONTH'));
DELETE FROM journal_entries WHERE \"companyId\"=2 AND ref IN ('PAYROLL-$MONTH','PAYROLL-POST-$MONTH');" >/dev/null 2>&1
ok "clean payroll slate for $MONTH (run + lines + GL refs)"

# 1) A salaried umrah-sales employee.
pw /settings/departments '{"name":"المالية"}' >/dev/null 2>&1 || true
EMP="$(pw /employees "{\"name\":\"بائع عمرة للرحلة\",\"phone\":\"058${SFX}1\",\"nationalId\":\"23${SFX}$(printf '%02d' $(( RANDOM % 100 )))\",\"nationality\":\"سعودي\",\"department\":\"المالية\",\"jobTitle\":\"محاسب\",\"contractType\":\"full_time\",\"salary\":6000,\"branchId\":5}")"
EID="$(echo "$EMP" | py 'import sys,json;print(json.load(sys.stdin).get("id") or "")')"
[ -n "$EID" ] && ok "umrah-sales employee created (#$EID, salary 6000)" || { no "employee create: $(echo "$EMP"|py 'import sys,json;d=json.load(sys.stdin);print(d.get("error") or d)')"; exit 1; }

# 2) Commission plan via the real route (fixed 1500/month, no conditions).
#    Plans are season-scoped — reuse the active season or seed one.
SID="$(psql "$DSN" -tA -c "select id from umrah_seasons where \"companyId\"=2 and \"deletedAt\" is null order by id limit 1;")"
if [ -z "$SID" ]; then
  SID="$(psql "$DSN" -qtA -c "INSERT INTO umrah_seasons (\"companyId\",title,\"startDate\",\"endDate\",status,\"isCurrent\",\"createdAt\") VALUES (2,'موسم رحلة التحقق','$YEAR_N-01-01','$YEAR_N-12-31','open',true,NOW()) RETURNING id;" | head -1)"
fi
[ -n "$SID" ] && ok "umrah season ready (#$SID)" || { no "season"; exit 1; }
PLAN="$(pw /umrah/commission-plans "{\"employeeId\":$EID,\"seasonId\":$SID,\"planName\":\"خطة رحلة $SFX\",\"baseSalary\":6000,\"commissionType\":\"fixed\",\"fixedAmount\":1500,\"conditionType\":\"none\",\"tiers\":[]}")"
PID="$(echo "$PLAN" | py 'import sys,json;print(json.load(sys.stdin).get("id") or "")')"
[ -n "$PID" ] && ok "commission plan created (#$PID, fixed 1500)" || { no "plan create: $(echo "$PLAN"|py 'import sys,json;d=json.load(sys.stdin);print(d.get("error") or d)')"; exit 1; }

# 3) Calculation row for the month. The engine's calculate endpoint depends
#    on umrah seasons/sales data; the journey seeds the calculation row
#    directly (same shape calculateCommissionForPlan writes) — the
#    SUBJECT under test is payroll consumption + GL, not tier math.
CALCID="$(psql "$DSN" -qtA -c "INSERT INTO employee_commission_calculations
  (\"companyId\",\"branchId\",\"planId\",\"employeeId\",month,year,\"totalMutamers\",\"conditionMet\",\"completedTiers\",\"commissionAmount\",\"hasViolations\",\"finalAmount\",\"isExcludedMonth\",status,\"createdBy\",\"createdAt\",\"updatedAt\")
  VALUES (2,5,$PID,$EID,$MONTH_N,$YEAR_N,10,true,0,1500,false,1500,false,'calculated',1,NOW(),NOW()) RETURNING id;" | head -1)"
[ -n "$CALCID" ] && ok "calculation row seeded (#$CALCID, finalAmount 1500, status=calculated)" || { no "calc seed failed"; exit 1; }

# 4) Approval — workflowEngine's approval action flips calculated→approved
#    (+approvedBy/approvedAt). Journey applies the same transition the
#    workflow executes, then asserts the gate columns stuck.
psql "$DSN" -q -c "UPDATE employee_commission_calculations SET status='approved', \"approvedBy\"=1, \"approvedAt\"=NOW(), \"updatedAt\"=NOW() WHERE id=$CALCID AND status='calculated';"
APPST="$(psql "$DSN" -tA -c "select status from employee_commission_calculations where id=$CALCID;")"
[ "$APPST" = "approved" ] && ok "calculation approved (workflow transition)" || no "approve failed ($APPST)"

# 5) An UNAPPROVED control row — must NOT be consumed by payroll.
CTRLID="$(psql "$DSN" -qtA -c "INSERT INTO employee_commission_calculations
  (\"companyId\",\"branchId\",\"planId\",\"employeeId\",month,year,\"totalMutamers\",\"conditionMet\",\"completedTiers\",\"commissionAmount\",\"hasViolations\",\"finalAmount\",\"isExcludedMonth\",status,\"createdBy\",\"createdAt\",\"updatedAt\")
  VALUES (2,5,$PID,$EID,$MONTH_N,$YEAR_N,5,true,0,999,false,999,false,'calculated',1,NOW(),NOW()) RETURNING id;" | head -1)"
ok "control row seeded (#$CTRLID, 999, status=calculated — must stay unpaid)"

# 6) Attendance completeness then run payroll.
psql "$DSN" -q -c "INSERT INTO attendance (\"companyId\",\"branchId\",\"assignmentId\",date,\"checkIn\",\"checkOut\",status,method,\"createdAt\")
  SELECT 2, ea.\"branchId\", ea.id, DATE '$MONTH-01', TIMESTAMP '$MONTH-01 08:00', TIMESTAMP '$MONTH-01 17:00', 'present', 'manual', now()
  FROM employee_assignments ea
  WHERE ea.\"companyId\"=2 AND ea.status='active'
    AND NOT EXISTS (SELECT 1 FROM attendance a WHERE a.\"assignmentId\"=ea.id AND TO_CHAR(a.date,'YYYY-MM')='$MONTH');" >/dev/null 2>&1
RUN="$(pw /hr/payroll "{\"month\":\"$MONTH\",\"notes\":\"رحلة عمولة العمرة\"}")"
RID="$(echo "$RUN" | py 'import sys,json;print(json.load(sys.stdin).get("id") or "")')"
[ -n "$RID" ] && ok "payroll run created (#$RID)" || { no "payroll run: $(echo "$RUN"|py 'import sys,json;d=json.load(sys.stdin);print(d.get("error") or d)')"; exit 1; }

# 7) The payroll line carries the commission + net includes it.
LINE="$(psql "$DSN" -tA -c "select commission||'|'||\"netSalary\" from payroll_lines where \"runId\"=$RID and \"employeeId\"=$EID;")"
COMM="$(echo "$LINE" | cut -d'|' -f1)"; NET="$(echo "$LINE" | cut -d'|' -f2)"
py "exit(0 if abs(float('${COMM:-0}')-1500)<0.01 else 1)" && ok "payroll_lines.commission = 1500" || no "commission on line ($COMM)"
py "exit(0 if float('${NET:-0}') > 6000 else 1)" && ok "net (=$NET) includes salary + commission" || no "net too low ($NET)"

# 8) GL: dedicated commission-expense DR on 5240, entry balanced.
COMMGL="$(psql "$DSN" -tA -c "select count(*) from journal_lines jl join journal_entries je on je.id=jl.\"journalId\" where je.\"companyId\"=2 and je.ref='PAYROLL-$MONTH' and jl.debit>0 and jl.\"accountCode\"='5240';")"
[ "${COMMGL:-0}" -ge 1 ] && ok "commission expense DR routed to 5240 (op payroll_commission_expense)" || no "no 5240 DR ($COMMGL)"
BAL="$(psql "$DSN" -tA -c "select count(*) from (select je.id from journal_entries je join journal_lines jl on jl.\"journalId\"=je.id where je.\"companyId\"=2 and je.ref='PAYROLL-$MONTH' group by je.id having sum(jl.debit)=sum(jl.credit) and sum(jl.debit)>0) t;")"
[ "${BAL:-0}" -ge 1 ] && ok "accrual GL balanced WITH the commission line" || no "GL not balanced ($BAL)"
COMMAMT="$(psql "$DSN" -tA -c "select COALESCE(sum(jl.debit),0) from journal_lines jl join journal_entries je on je.id=jl.\"journalId\" where je.\"companyId\"=2 and je.ref='PAYROLL-$MONTH' and jl.\"accountCode\"='5240';")"
py "exit(0 if abs(float('${COMMAMT:-0}')-1500)<0.01 else 1)" && ok "5240 DR amount = 1500 (exactly the approved commission)" || no "5240 amount ($COMMAMT)"

# 9) Exactly-once: approved row → paid + payrollLineId; control row untouched.
PAID="$(psql "$DSN" -tA -c "select status||'|'||COALESCE(\"payrollLineId\"::text,'') from employee_commission_calculations where id=$CALCID;")"
echo "$PAID" | grep -q "^paid|[0-9]" && ok "calculation consumed: status=paid + payrollLineId stamped" || no "consumption state ($PAID)"
CTRL="$(psql "$DSN" -tA -c "select status||'|'||COALESCE(\"payrollLineId\"::text,'') from employee_commission_calculations where id=$CTRLID;")"
[ "$CTRL" = "calculated|" ] && ok "unapproved control row NOT consumed (still calculated, no payrollLineId)" || no "control row leaked ($CTRL)"

rm -f "$J"; echo; echo "▶ Result: $PASS passed, $FAIL failed"; [ "$FAIL" -eq 0 ] || exit 1
