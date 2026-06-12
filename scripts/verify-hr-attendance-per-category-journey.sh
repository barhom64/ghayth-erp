#!/bin/bash
# verify-hr-attendance-per-category-journey.sh — E2E proof that the
# per-category attendance policy page actually works for an HR Manager
# now (#2077 PR-3).
#
# The page (pages/admin/attendance-categories.tsx) was built months ago
# (HR-015) but the org.ts endpoints behind it were gated on `admin:*`,
# so an HR Manager hit 403 on every request the page made. PR-3 opens
# the gates to the right HR-domain keys and exposes the route under
# /hr too. The journey proves the full path actually works end-to-end:
#
#   1. As HR Manager (not admin) → GET /org/employee-categories OK.
#   2. As HR Manager → GET /org/attendance-policies-per-category OK.
#   3. As HR Manager → POST /org/attendance-policies-per-category OK.
#   4. As HR Manager → the upserted row is observable via psql.
#   5. As HR Manager → DELETE the override → row gone.
#   6. As an employee (no hr.attendance role) → POST returns 403.
#
# Prereqs: bootstrap + built server + Al-Diyaa tenant.
set -euo pipefail
BASE="${BASE:-http://localhost:5000/api}"
DSN="${DATABASE_URL:-postgres://ghayth_erp:ghayth_erp@localhost:5432/ghayth_erp}"
OWNER_EMAIL="${OWNER_EMAIL:-door@door.sa}"
OWNER_PASSWORD="${OWNER_PASSWORD:-Door@2026Diaa}"
TEST_PASSWORD='Test1234!'
TEST_HASH='$2b$10$v6KtegUqgRLrlsDRWu2l4uUAnOeNREpHB1LQ/ZgvBxiwnMQtMVTVu'
J="$(mktemp)"; PASS=0; FAIL=0
py(){ python3 -c "$1" 2>/dev/null; }
ok(){ echo "  ✅ $1"; PASS=$((PASS+1)); }
no(){ echo "  ❌ $1"; FAIL=$((FAIL+1)); }
export PGPASSWORD="$(echo "$DSN" | sed -E 's#.*://[^:]+:([^@]+)@.*#\1#')"

SFX="$(printf '%06d' $(( (RANDOM*RANDOM) % 1000000 )))"

echo "▶ HR attendance per-category — #2077 PR-3 (HR Manager يفتح ويعدّل سياسة الفئات)"

# 0) Owner login: provisions the HR Manager + Employee personas via the
#    same /employees route the wizard calls.
curl -fsS -c "$J" -H "X-E2E-Test: 1" -X POST "$BASE/auth/login" -H "Content-Type: application/json" -d "{\"email\":\"$OWNER_EMAIL\",\"password\":\"$OWNER_PASSWORD\"}" -o /dev/null
CSRFOWN="$(grep erp_csrf "$J" | awk '{print $7}')"
[ -n "$CSRFOWN" ] && ok "owner login" || { no "owner login"; exit 1; }
postw(){ curl -sS -b "$J" -H "x-csrf-token: $CSRFOWN" -H "Content-Type: application/json" -X POST "$BASE$1" -d "$2"; }

POSID="$(psql "$DSN" -tA -c "select id from positions where \"companyId\" is null and \"isActive\"=true order by level desc limit 1;")"
CATKEY="$(psql "$DSN" -tA -c "select \"categoryKey\" from employee_categories where \"companyId\" is null and \"isActive\"=true order by \"displayOrder\" limit 1;")"
TEAMID="$(psql "$DSN" -tA -c "select id from teams where \"companyId\"=2 and \"isActive\"=true order by id limit 1;")"
PROJID="$(psql "$DSN" -tA -c "select id from projects where \"companyId\"=2 and \"deletedAt\" is null order by id limit 1;")"
CCID="$(psql "$DSN" -tA -c "select id from cost_centers where \"companyId\"=2 order by id limit 1;")"
MGRID="$(psql "$DSN" -tA -c "select e.id from employees e join employee_assignments ea on ea.\"employeeId\"=e.id where ea.\"companyId\"=2 and ea.status='active' and e.\"deletedAt\" is null order by e.id limit 1;")"

HR_EMAIL="pr3-hr-${SFX}@dr.local"
EMP_EMAIL="pr3-emp-${SFX}@dr.local"

seed_persona(){
  local KEY="$1" EMAIL="$2" NAME="$3" PHSFX="$4"
  local NID; NID="$(printf '%010d' $(( (10#$SFX$PHSFX) % 9999999999 )))"
  local PAYLOAD="{\"name\":\"$NAME\",\"phone\":\"056${SFX}${PHSFX}\",\"nationalId\":\"$NID\",\"nationality\":\"سعودي\",\"department\":\"المالية\",\"jobTitle\":\"مسؤول موارد بشرية\",\"contractType\":\"full_time\",\"salary\":7000,\"branchId\":3,\"internalEmail\":\"$EMAIL\",\"managerId\":$MGRID,\"positionId\":$POSID,\"categoryKey\":\"$CATKEY\",\"teamId\":$TEAMID,\"projectId\":$PROJID,\"costCenterId\":$CCID}"
  local RESP; RESP="$(postw /employees "$PAYLOAD")"
  local USERID; USERID="$(echo "$RESP" | py "import sys,json;d=json.load(sys.stdin);print((d.get('userAccount') or {}).get('userId') or '')")"
  [ -z "$USERID" ] && { no "$KEY seed: $(echo "$RESP"|py 'import sys,json;d=json.load(sys.stdin);print(d.get("error") or d)')"; return 1; }
  psql "$DSN" -q -c "UPDATE users SET \"passwordHash\"='$TEST_HASH', role='$KEY' WHERE id=$USERID;" >/dev/null 2>&1
  psql "$DSN" -q -c "DELETE FROM rbac_user_roles WHERE \"userId\"=$USERID AND \"companyId\"=2;" >/dev/null 2>&1
  psql "$DSN" -q -c "INSERT INTO rbac_user_roles (\"userId\",\"companyId\",role_id,\"branchId\",is_primary,\"assignedBy\",\"createdAt\") SELECT $USERID, 2, id, 3, true, 1, NOW() FROM rbac_roles WHERE role_key='$KEY' AND (\"companyId\"=2 OR \"companyId\" IS NULL) ORDER BY \"companyId\" NULLS LAST LIMIT 1;" >/dev/null 2>&1
  echo "$USERID"
}

seed_persona hr_manager "$HR_EMAIL" "مديرة الموارد البشرية" 1 >/dev/null && ok "hr_manager seeded ($HR_EMAIL)" || { no "hr_manager seed"; exit 1; }
seed_persona employee   "$EMP_EMAIL" "موظف عادي"            2 >/dev/null && ok "employee seeded ($EMP_EMAIL)"   || { no "employee seed"; exit 1; }

# Make sure no leftover override row for this category from a previous run.
psql "$DSN" -q -c "DELETE FROM attendance_policies_per_category WHERE \"companyId\"=2 AND \"categoryKey\"='${CATKEY}';" >/dev/null 2>&1

# 1) HR Manager login + the three reads the page makes.
JHR="$(mktemp)"
curl -fsS -c "$JHR" -H "X-E2E-Test: 1" -X POST "$BASE/auth/login" -H "Content-Type: application/json" -d "{\"email\":\"$HR_EMAIL\",\"password\":\"$TEST_PASSWORD\"}" -o /dev/null
CSRFHR="$(grep erp_csrf "$JHR" | awk '{print $7}')"
[ -n "$CSRFHR" ] && ok "hr_manager login" || { no "hr_manager login"; exit 1; }

CAT_STATUS="$(curl -sS -o /dev/null -w "%{http_code}" -b "$JHR" "$BASE/org/employee-categories")"
[ "$CAT_STATUS" = "200" ] && ok "GET /org/employee-categories → 200 (catalog readable by hr.employees:list)" || no "GET /org/employee-categories → $CAT_STATUS"

OVR_STATUS="$(curl -sS -o /dev/null -w "%{http_code}" -b "$JHR" "$BASE/org/attendance-policies-per-category")"
[ "$OVR_STATUS" = "200" ] && ok "GET /org/attendance-policies-per-category → 200 (overrides readable by hr.attendance:list)" || no "GET /org/attendance-policies-per-category → $OVR_STATUS"

# 2) The exact payload the page POSTs when an HR Manager saves an
#    override for the picked category. Sets the late threshold to 7
#    minutes and the autoDeductionEnabled flag — both visible later
#    via psql + via the next GET.
WRITE_BODY="{\"categoryKey\":\"${CATKEY}\",\"lateThresholdMinutes\":7,\"gracePeriodMinutes\":5,\"gpsRadiusMeters\":150,\"penaltyLevel1\":1,\"penaltyLevel2\":2,\"penaltyLevel3\":4,\"penaltyLevel4\":7,\"penaltyLevel5\":12,\"autoDeductionEnabled\":true,\"trackingFrequencySeconds\":120}"
WRITE_RESP="$(curl -sS -b "$JHR" -H "x-csrf-token: $CSRFHR" -H "Content-Type: application/json" -X POST "$BASE/org/attendance-policies-per-category" -d "$WRITE_BODY")"
WRITE_ID="$(echo "$WRITE_RESP" | py "import sys,json;d=json.load(sys.stdin);print((d.get('data') or {}).get('id') or '')")"
[ -n "$WRITE_ID" ] && ok "POST /org/attendance-policies-per-category → 201 (override #${WRITE_ID})" || no "POST failed: $(echo "$WRITE_RESP"|py 'import sys,json;d=json.load(sys.stdin);print(d.get("error") or d)')"

# 3) Forensics — the row landed with all expected columns.
ROW_LATE="$(psql "$DSN" -tA -c "select \"lateThresholdMinutes\" from attendance_policies_per_category where id=$WRITE_ID;")"
ROW_AUTO="$(psql "$DSN" -tA -c "select \"autoDeductionEnabled\" from attendance_policies_per_category where id=$WRITE_ID;")"
ROW_KEY="$(psql "$DSN" -tA -c "select \"categoryKey\" from attendance_policies_per_category where id=$WRITE_ID;")"
[ "$ROW_LATE" = "7" ] && [ "$ROW_AUTO" = "t" ] && [ "$ROW_KEY" = "$CATKEY" ] \
  && ok "override row carries lateThresholdMinutes=7, autoDeductionEnabled=true, categoryKey=${CATKEY}" \
  || no "row mismatch (late=$ROW_LATE, auto=$ROW_AUTO, key=$ROW_KEY)"

# 4) Audit log carries the action with field-shape PR-2 demanded
#    (the org.ts audit() helper writes companyId + userId + role).
AUD_USERID="$(psql "$DSN" -tA -c "select \"userId\" from audit_logs where entity='attendance_policy_per_category' and \"entityId\"=$WRITE_ID::text and action='upsert' order by id desc limit 1;")"
HR_USERID="$(psql "$DSN" -tA -c "select id from users where email='$HR_EMAIL';")"
[ "$AUD_USERID" = "$HR_USERID" ] && ok "audit_logs records the HR Manager as the upsert author (userId=$AUD_USERID)" || no "audit author mismatch ($AUD_USERID ≠ $HR_USERID)"

# 5) DELETE works for HR Manager — the override is removable.
DEL_STATUS="$(curl -sS -o /dev/null -w "%{http_code}" -b "$JHR" -H "x-csrf-token: $CSRFHR" -X DELETE "$BASE/org/attendance-policies-per-category/$WRITE_ID")"
[ "$DEL_STATUS" = "200" ] && ok "DELETE /org/attendance-policies-per-category/$WRITE_ID → 200" || no "DELETE → $DEL_STATUS"
GONE="$(psql "$DSN" -tA -c "select count(*) from attendance_policies_per_category where id=$WRITE_ID;")"
[ "${GONE:-1}" = "0" ] && ok "override row removed from DB" || no "override still present after DELETE ($GONE rows)"

# 6) Employee (no hr.attendance role) — POST is rejected. Proves the
#    gate is NOT wide-open; it's domain-targeted.
JE="$(mktemp)"
curl -fsS -c "$JE" -H "X-E2E-Test: 1" -X POST "$BASE/auth/login" -H "Content-Type: application/json" -d "{\"email\":\"$EMP_EMAIL\",\"password\":\"$TEST_PASSWORD\"}" -o /dev/null
CSRFE="$(grep erp_csrf "$JE" | awk '{print $7}')"
EMP_STATUS="$(curl -sS -o /dev/null -w "%{http_code}" -b "$JE" -H "x-csrf-token: $CSRFE" -H "Content-Type: application/json" -X POST "$BASE/org/attendance-policies-per-category" -d "$WRITE_BODY")"
[ "$EMP_STATUS" = "403" ] && ok "employee POST → 403 (gate is HR-targeted, not wide-open)" || no "employee POST → $EMP_STATUS (expected 403)"

rm -f "$J" "$JHR" "$JE"
echo
echo "▶ Result: $PASS passed, $FAIL failed"
[ "$FAIL" -eq 0 ] || exit 1
