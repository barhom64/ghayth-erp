#!/bin/bash
# verify-hr-employee-institutional-journey.sh — E2E proof of the PR-1
# (#2077) institutional binding wired into the employee creation
# wizard. From UI → API → DB, the journey is:
#
#   1. Pick a position + category + team + project + cost-center +
#      (optional) committee in the wizard.
#   2. POST /employees inside ONE transaction.
#   3. The assignment row carries positionId + categoryKey.
#   4. Three bridge rows land — team / project / committee.
#   5. The audit row + event log + response body all carry the
#      institutional binding so a forensic question is answerable.
#
# This script reuses the existing canonical journey pattern (logged-in
# CSRF session + psql forensics) the way verify-hr-payroll-journey.sh
# and verify-hr-discipline-journey.sh do.
#
# Prereqs: bootstrap + built server (الضياء tenant).
set -euo pipefail
BASE="${BASE:-http://localhost:5000/api}"; EMAIL="${EMAIL:-door@door.sa}"; PASSWORD="${PASSWORD:-Door@2026Diaa}"
DSN="${DATABASE_URL:-postgres://ghayth_erp:ghayth_erp@localhost:5432/ghayth_erp}"
J="$(mktemp)"; PASS=0; FAIL=0
py(){ python3 -c "$1" 2>/dev/null; }
ok(){ echo "  ✅ $1"; PASS=$((PASS+1)); }
no(){ echo "  ❌ $1"; FAIL=$((FAIL+1)); }
echo "▶ HR employee institutional binding — #2077 PR-1 (موظف ↔ منصب/فئة/فريق/مشروع/مركز تكلفة/لجنة)"
curl -fsS -c "$J" -H "X-E2E-Test: 1" -X POST "$BASE/auth/login" -H "Content-Type: application/json" -d "{\"email\":\"$EMAIL\",\"password\":\"$PASSWORD\"}" -o /dev/null
CSRF="$(grep erp_csrf "$J" | awk '{print $7}')"; [ -n "$CSRF" ] && ok "login ($EMAIL)" || { no login; exit 1; }
pw(){ curl -sS -b "$J" -H "x-csrf-token: $CSRF" -H "Content-Type: application/json" -X POST "$BASE$1" -d "$2"; }
get(){ curl -fsS -b "$J" "$BASE$1"; }
gid(){ py "import sys,json;d=json.load(sys.stdin);print(d.get('$1') or '')"; }
export PGPASSWORD="$(echo "$DSN" | sed -E 's#.*://[^:]+:([^@]+)@.*#\1#')"

# 1) Seed the catalog rows the journey needs (re-runnable; non-fatal
#    when the row already exists for the company).
pw /settings/departments '{"name":"المالية"}' >/dev/null 2>&1 || true

# Pick the first system position (companyId IS NULL) so we don't depend
# on a per-company override row. POSKEY is the literal key the seed
# carries (مدير قسم → "department_manager"); we resolve the id below.
POSID="$(psql "$DSN" -tA -c "select id from positions where \"companyId\" is null and \"isActive\"=true order by level desc limit 1;")"
[ -n "${POSID:-}" ] && ok "نظام المناصب مزروع (المنصب #$POSID)" || no "no system positions seeded"

# Pick the worker category (seeded by migration 270 with companyId NULL).
CATKEY="$(psql "$DSN" -tA -c "select \"categoryKey\" from employee_categories where \"companyId\" is null and \"isActive\"=true order by \"displayOrder\" limit 1;")"
[ -n "${CATKEY:-}" ] && ok "نظام الفئات مزروع (الفئة \"$CATKEY\")" || no "no system employee_categories seeded"

# Ensure a team exists for company 2 (the Al-Diyaa tenant the journey
# uses). Tolerant of a re-run via `OR true`.
TEAMID="$(psql "$DSN" -tA -c "select id from teams where \"companyId\"=2 and \"isActive\"=true order by id limit 1;")"
if [ -z "${TEAMID:-}" ]; then
  TEAMID="$(pw /org/teams '{"name":"فريق المالية الافتراضي"}' | py 'import sys,json;d=json.load(sys.stdin);print((d.get("data") or {}).get("id") or "")')"
fi
[ -n "${TEAMID:-}" ] && ok "فريق متاح (#$TEAMID)" || no "team create/lookup failed"

# Ensure a project exists. The /projects POST is the canonical create.
PROJID="$(psql "$DSN" -tA -c "select id from projects where \"companyId\"=2 and \"deletedAt\" is null order by id limit 1;")"
if [ -z "${PROJID:-}" ]; then
  PROJID="$(pw /projects '{"name":"مشروع التشغيل الافتراضي","code":"OPS-DEFAULT"}' | py 'import sys,json;d=json.load(sys.stdin);print(d.get("id") or (d.get("data") or {}).get("id") or "")')"
fi
[ -n "${PROJID:-}" ] && ok "مشروع متاح (#$PROJID)" || no "project create/lookup failed"

# Ensure a cost center exists.
CCID="$(psql "$DSN" -tA -c "select id from cost_centers where \"companyId\"=2 order by id limit 1;")"
if [ -z "${CCID:-}" ]; then
  CCID="$(pw /finance/cost-centers '{"code":"CC-OPS","name":"مركز تكلفة التشغيل"}' | py 'import sys,json;d=json.load(sys.stdin);print(d.get("id") or (d.get("data") or {}).get("id") or "")')"
fi
[ -n "${CCID:-}" ] && ok "مركز تكلفة متاح (#$CCID)" || no "cost-center create/lookup failed"

# Optional: pick a committee if one exists (we don't fail when missing).
COMID="$(psql "$DSN" -tA -c "select id from committees where \"companyId\"=2 and \"isActive\"=true order by id limit 1;" 2>/dev/null || echo)"

# 2) An existing manager — the new employee MUST report to someone.
MGRID="$(psql "$DSN" -tA -c "select e.id from employees e join employee_assignments ea on ea.\"employeeId\"=e.id where ea.\"companyId\"=2 and ea.status='active' and e.\"deletedAt\" is null order by e.id limit 1;")"
[ -n "${MGRID:-}" ] && ok "مدير مباشر متاح (#$MGRID)" || no "no active employee to act as manager"

# 3) FRESH employee per run (unique nationalId / phone). The route
#    binds them to all 5 mandatory + the optional committee.
SFX="$(printf '%06d' $(( (RANDOM*RANDOM) % 1000000 )))"
PAYLOAD="$(cat <<JSON
{
  "name": "موظف رحلة الربط المؤسسي",
  "phone": "057${SFX}1",
  "nationalId": "23${SFX}$(printf '%02d' $(( RANDOM % 100 )))",
  "nationality": "سعودي",
  "department": "المالية",
  "jobTitle": "محاسب",
  "contractType": "full_time",
  "salary": 9500,
  "branchId": 6,
  "managerId": ${MGRID},
  "positionId": ${POSID},
  "categoryKey": "${CATKEY}",
  "teamId": ${TEAMID},
  "projectId": ${PROJID},
  "costCenterId": ${CCID}${COMID:+,
  "committeeId": ${COMID}}
}
JSON
)"
RESP="$(pw /employees "$PAYLOAD")"
EID="$(echo "$RESP" | gid id)"
ASG="$(echo "$RESP" | gid assignmentId)"
[ -n "$EID" ] && [ -n "$ASG" ] && ok "الموظف أُنشئ (#$EID، تعيين #$ASG)" || { no "employee create: $(echo "$RESP"|py 'import sys,json;d=json.load(sys.stdin);print(d.get("error") or d)')"; exit 1; }

# 4) Forensics — every binding must land in the DB.
ROW_POS="$(psql "$DSN" -tA -c "select \"positionId\" from employee_assignments where id=$ASG;")"
[ "$ROW_POS" = "$POSID" ] && ok "assignment.positionId = $POSID" || no "assignment.positionId mismatch ($ROW_POS ≠ $POSID)"
ROW_CAT="$(psql "$DSN" -tA -c "select \"categoryKey\" from employee_assignments where id=$ASG;")"
[ "$ROW_CAT" = "$CATKEY" ] && ok "assignment.categoryKey = \"$CATKEY\"" || no "assignment.categoryKey mismatch ($ROW_CAT ≠ $CATKEY)"
ROW_MGR="$(psql "$DSN" -tA -c "select \"managerId\" from employee_assignments where id=$ASG;")"
[ "$ROW_MGR" = "$MGRID" ] && ok "assignment.managerId = $MGRID" || no "assignment.managerId mismatch ($ROW_MGR ≠ $MGRID)"

TEAMROW="$(psql "$DSN" -tA -c "select count(*) from employee_team_memberships where \"assignmentId\"=$ASG and \"teamId\"=$TEAMID and (\"endDate\" is null or \"endDate\" >= current_date);")"
[ "${TEAMROW:-0}" -ge 1 ] && ok "team bridge: عضوية فعّالة على فريق #$TEAMID" || no "team bridge row not found"

PROJROW="$(psql "$DSN" -tA -c "select count(*) from employee_project_assignments where \"assignmentId\"=$ASG and \"projectId\"=$PROJID and \"costCenterId\"=$CCID and (\"endDate\" is null or \"endDate\" >= current_date);")"
[ "${PROJROW:-0}" -ge 1 ] && ok "project bridge: تعيين فعّال على مشروع #$PROJID مع مركز تكلفة #$CCID" || no "project bridge row not found (or costCenterId mismatch)"

if [ -n "${COMID:-}" ]; then
  COMROW="$(psql "$DSN" -tA -c "select count(*) from employee_committee_memberships where \"assignmentId\"=$ASG and \"committeeId\"=$COMID and (\"endDate\" is null or \"endDate\" >= current_date);")"
  [ "${COMROW:-0}" -ge 1 ] && ok "committee bridge: عضوية فعّالة على لجنة #$COMID" || no "committee bridge row not found"
else
  echo "  ⏭️  committee bridge skipped (no committee seeded — optional binding)"
fi

# 5) Audit + event must carry the binding so a forensic query
#    («who joined project X this month?») is answerable without
#    self-joining the bridges.
AUDPOS="$(psql "$DSN" -tA -c "select (\"after\"::jsonb->>'positionId') from audit_logs where entity='employees' and \"entityId\"=$EID and action='create' order by id desc limit 1;")"
[ "$AUDPOS" = "$POSID" ] && ok "audit_logs.after.positionId = $POSID" || no "audit positionId missing ($AUDPOS)"

EVTPROJ="$(psql "$DSN" -tA -c "select (details::jsonb->>'projectId') from event_logs where entity='employees' and \"entityId\"=$EID and action='employee.created' order by id desc limit 1;" 2>/dev/null || echo)"
[ "$EVTPROJ" = "$PROJID" ] && ok "event_logs.details.projectId = $PROJID" || no "event projectId missing ($EVTPROJ)"

# 6) Bootstrap carve-out: prove the route rejects with field-tagged
#    ValidationError when a non-bootstrap caller drops a mandatory.
#    We POST without positionId and expect a 4xx with field=positionId.
BAD="$(curl -sS -b "$J" -H "x-csrf-token: $CSRF" -H "Content-Type: application/json" -X POST "$BASE/employees" -d "{\"name\":\"رفض\",\"phone\":\"058${SFX}9\",\"nationalId\":\"99${SFX}$(printf '%02d' $(( RANDOM % 100 )))\",\"nationality\":\"سعودي\",\"department\":\"المالية\",\"jobTitle\":\"محاسب\",\"contractType\":\"full_time\",\"salary\":1000,\"managerId\":${MGRID}}")"
BADFIELD="$(echo "$BAD" | py 'import sys,json;d=json.load(sys.stdin);print(d.get("field") or "")')"
[ "$BADFIELD" = "positionId" ] && ok "non-bootstrap caller without positionId → field-tagged ValidationError" || no "expected field=positionId, got: $BAD"

rm -f "$J"; echo; echo "▶ Result: $PASS passed, $FAIL failed"; [ "$FAIL" -eq 0 ] || exit 1
