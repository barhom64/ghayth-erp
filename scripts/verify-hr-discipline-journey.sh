#!/bin/bash
# verify-hr-discipline-journey.sh — E2E proof of the HR disciplinary journey
# (#1594 Phase 7 HR: غياب → محضر استفسار → تبرير → توصية المدير → قرار الإدارة
# العليا → جزاء مُطبَّق → أثر في الرواتب) using the EXISTING disciplineEngine /
# autoViolationEngine + hr-discipline routes — no new engine.
#
# Self-contained: seeds the one regulation article the resolver needs
# (work_time / article 11 = absence 1 day) then walks the full maker-checker
# chain and asserts a real penalty deduction lands in attendance_deductions
# (status pending_payroll = the payroll effect).
#
# Prereqs: bootstrap + built server (الضياء tenant, salaried employees seeded).
set -euo pipefail
BASE="${BASE:-http://localhost:5000/api}"; EMAIL="${EMAIL:-door@door.sa}"; PASSWORD="${PASSWORD:-Door@2026Diaa}"
DSN="${DATABASE_URL:-postgres://ghayth_erp:ghayth_erp@localhost:5432/ghayth_erp}"
J="$(mktemp)"; PASS=0; FAIL=0
py(){ python3 -c "$1" 2>/dev/null; }
ok(){ echo "  ✅ $1"; PASS=$((PASS+1)); }
no(){ echo "  ❌ $1"; FAIL=$((FAIL+1)); }
echo "▶ HR disciplinary journey — #1594 (غياب→محضر→قرار→جزاء→أثر بالراتب)"
curl -fsS -c "$J" -H "X-E2E-Test: 1" -X POST "$BASE/auth/login" -H "Content-Type: application/json" -d "{\"email\":\"$EMAIL\",\"password\":\"$PASSWORD\"}" -o /dev/null
CSRF="$(grep erp_csrf "$J" | awk '{print $7}')"; [ -n "$CSRF" ] && ok "login ($EMAIL)" || { no login; exit 1; }
pw(){ curl -sS -b "$J" -H "x-csrf-token: $CSRF" -H "Content-Type: application/json" -X POST "$BASE$1" -d "$2"; }
gid(){ py "import sys,json;d=json.load(sys.stdin);print(d.get('$1') or '')"; }
export PGPASSWORD="$(echo "$DSN" | sed -E 's#.*://[^:]+:([^@]+)@.*#\1#')"

# 1) Seed the absence article (resolver maps absence-1-day → work_time art.11).
#    Tolerant of a re-run (the article already exists → non-fatal).
pw /hr/discipline/regulation '{"section":"work_time","articleNumber":11,"title":"غياب يوم واحد بدون إذن","penalty1":"خصم يوم","penalty2":"خصم يوم","penalty3":"خصم يوم","penalty4":"خصم يوم","severity":"medium"}' >/dev/null 2>&1 || true
REGOK="$(psql "$DSN" -tA -c "select count(*) from hr_discipline_regulation where \"companyId\"=2 and section='work_time' and \"articleNumber\"=11 and \"deletedAt\" is null;")"
[ "${REGOK:-0}" -ge 1 ] && ok "لائحة الانضباط مزروعة (مادة الغياب 11)" || no "regulation article missing ($REGOK)"

# 2) A FRESH salaried employee per run, so the offence is always occurrence #1
#    (the resolver escalates penalty1→4 by prior-occurrence count; a re-used
#    employee would exhaust the tiers and stop resolving an amount).
pw /settings/departments '{"name":"المالية"}' >/dev/null 2>&1 || true
SFX="$(printf '%06d' $(( (RANDOM*RANDOM) % 1000000 )))"
EMP="$(pw /employees "{\"name\":\"موظف رحلة الانضباط\",\"phone\":\"059${SFX}1\",\"nationalId\":\"22${SFX}$(printf '%02d' $(( RANDOM % 100 )))\",\"nationality\":\"سعودي\",\"department\":\"المالية\",\"jobTitle\":\"محاسب\",\"contractType\":\"full_time\",\"salary\":9000,\"branchId\":6}")"
ASG="$(echo "$EMP" | gid assignmentId)"
[ -n "$ASG" ] && ok "موظف براتب أُنشئ للرحلة (تعيين #$ASG)" || { no "employee create: $(echo "$EMP"|py 'import sys,json;d=json.load(sys.stdin);print(d.get("error") or d)')"; exit 1; }
BEFORE="$(psql "$DSN" -tA -c "select count(*) from attendance_deductions where \"assignmentId\"=$ASG and type='penalty' and status='pending_payroll';")"

# 3) Penalty preview must resolve a real amount.
PREV="$(pw /hr/discipline/penalty-preview "{\"assignmentId\":$ASG,\"incidentType\":\"absence\",\"incidentDate\":\"2026-06-05\",\"absenceDays\":1}")"
BASEAMT="$(echo "$PREV" | py "import sys,json;d=json.load(sys.stdin);r=d.get('resolution') or {};print(r.get('baseDeductionAmount') or 0)")"
py "exit(0 if float('${BASEAMT:-0}')>0 else 1)" && ok "حساب الجزاء يحلّ مبلغًا فعليًا (${BASEAMT})" || no "penalty preview did not resolve (${BASEAMT})"

# 4) Create the inquiry memo (absence 1 day) — auto-resolves the article.
MEMO="$(pw /hr/discipline/memos "{\"assignmentId\":$ASG,\"incidentType\":\"absence\",\"incidentDate\":\"2026-06-05\",\"absenceDays\":1,\"incidentDescription\":\"غياب بدون إذن\"}")"
MID="$(echo "$MEMO" | gid id)"; MST="$(echo "$MEMO" | gid status)"; MREG="$(echo "$MEMO" | gid regulationId)"
{ [ -n "$MID" ] && [ "$MST" = "pending_employee" ] && [ -n "$MREG" ]; } && ok "محضر استفسار أُنشئ (#$MID، pending_employee، مادة #$MREG)" || no "memo create (id=$MID status=$MST reg=$MREG)"

# 5) Maker-checker chain: employee justifies → manager rejects the excuse →
#    GM approves → penalty applied.
J1="$(pw /hr/discipline/memos/$MID/justify '{"justification":"لا يوجد عذر","declined":false}' | gid status)"
[ "$J1" = "pending_manager" ] && ok "تبرير الموظف → pending_manager" || no "justify ($J1)"
J2="$(pw /hr/discipline/memos/$MID/manager-recommendation '{"recommendation":"reject_excuse","comment":"يُطبّق الجزاء"}' | gid status)"
[ "$J2" = "pending_gm" ] && ok "توصية المدير (رفض العذر) → pending_gm" || no "manager-recommendation ($J2)"
J3="$(pw /hr/discipline/memos/$MID/gm-decision '{"decision":"approved","comment":"معتمد"}' | gid status)"
[ "$J3" = "approved" ] && ok "قرار الإدارة العليا → approved (الجزاء مُطبَّق)" || no "gm-decision ($J3)"

# 6) The memo carries the applied penalty.
APPLIED="$(psql "$DSN" -tA -c "select \"appliedDeductionAmount\" from hr_inquiry_memos where id=$MID;")"
py "exit(0 if float('${APPLIED:-0}')>0 else 1)" && ok "المحضر يحمل جزاءً مُطبَّقًا (${APPLIED})" || no "memo applied amount ($APPLIED)"

# 7) Payroll effect — a pending_payroll penalty deduction was created.
AFTER="$(psql "$DSN" -tA -c "select count(*) from attendance_deductions where \"assignmentId\"=$ASG and type='penalty' and status='pending_payroll';")"
[ "${AFTER:-0}" -gt "${BEFORE:-0}" ] && ok "أثر بالراتب: خصم جزاء (pending_payroll) أُضيف إلى attendance_deductions" || no "no new pending_payroll deduction ($BEFORE→$AFTER)"

rm -f "$J"; echo; echo "▶ Result: $PASS passed, $FAIL failed"; [ "$FAIL" -eq 0 ] || exit 1
