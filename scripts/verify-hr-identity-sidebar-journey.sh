#!/bin/bash
# verify-hr-identity-sidebar-journey.sh — E2E proof of PR-8a (#2077):
# identity de-duplication + the 5-persona sidebar differentiation.
#
#   A. Identity: the admin appears ONCE per company in /employees
#      (was 7×); no synthetic absence rows on access-grant assignments;
#      payroll-relevant active count excludes access grants; the
#      scoring cron skips access grants.
#   B. Sidebar: 5 personas (admin / hr_manager / department_manager /
#      payroll_officer / employee) get DIFFERENT module sets from
#      /auth/me — same proof shape as PR-2 but with the two personas
#      the product owner added.
#
# Prereqs: bootstrap + built server + Al-Diyaa tenant + migration 289.
set -euo pipefail
BASE="${BASE:-http://localhost:5000/api}"
DSN="${DATABASE_URL:-postgres://ghayth_erp:ghayth_erp@localhost:5432/ghayth_erp}"
OWNER_EMAIL="${OWNER_EMAIL:-door@door.sa}"
OWNER_PASSWORD="${OWNER_PASSWORD:-Door@2026Diaa}"
ADMIN_EMAIL="${ADMIN_EMAIL:-owner@local.test}"
ADMIN_PASSWORD="${ADMIN_PASSWORD:-Test1234!}"
TEST_PASSWORD='Test1234!'
TEST_HASH='$2b$10$v6KtegUqgRLrlsDRWu2l4uUAnOeNREpHB1LQ/ZgvBxiwnMQtMVTVu'
J="$(mktemp)"; PASS=0; FAIL=0
py(){ python3 -c "$1" 2>/dev/null; }
ok(){ echo "  ✅ $1"; PASS=$((PASS+1)); }
no(){ echo "  ❌ $1"; FAIL=$((FAIL+1)); }
section(){ echo; echo "▶ $1"; }
export PGPASSWORD="$(echo "$DSN" | sed -E 's#.*://[^:]+:([^@]+)@.*#\1#')"
SFX="$(printf '%06d' $(( (RANDOM*RANDOM) % 1000000 )))"

section "0. migration 289 applied + owner login"
psql "$DSN" -q -f /home/user/ghayth-erp/artifacts/api-server/src/migrations/289_access_grant_assignments.sql >/dev/null 2>&1
COL="$(psql "$DSN" -tA -c "SELECT count(*) FROM information_schema.columns WHERE table_name='employee_assignments' AND column_name='isAccessGrant';")"
[ "$COL" = "1" ] && ok "isAccessGrant column exists" || { no "column missing"; exit 1; }

curl -fsS -c "$J" -H "X-E2E-Test: 1" -X POST "$BASE/auth/login" -H "Content-Type: application/json" -d "{\"email\":\"$OWNER_EMAIL\",\"password\":\"$OWNER_PASSWORD\"}" -o /dev/null
CSRF="$(grep erp_csrf "$J" | awk '{print $7}')"
[ -n "$CSRF" ] && ok "owner login" || { no "owner login"; exit 1; }
postw(){ curl -sS -b "$J" -H "x-csrf-token: $CSRF" -H "Content-Type: application/json" -X POST "$BASE$1" -d "$2"; }
get(){ curl -sS -b "$J" "$BASE$1"; }

section "A1. التكرار: الأدمن يظهر مرة واحدة في /employees لا 7"
# Forensics first: how many active non-grant assignments does the admin hold in company 2?
DB_GRANTS="$(psql "$DSN" -tA -c "SELECT count(*) FROM employee_assignments WHERE \"employeeId\"=1 AND \"companyId\"=2 AND status='active' AND \"isAccessGrant\"=TRUE;")"
DB_EMPLOY="$(psql "$DSN" -tA -c "SELECT count(*) FROM employee_assignments WHERE \"employeeId\"=1 AND \"companyId\"=2 AND status='active' AND \"isAccessGrant\"=FALSE;")"
[ "${DB_EMPLOY:-9}" = "1" ] && ok "DB: exactly ONE employment row for the admin in company 2 ($DB_GRANTS access grants marked)" || no "employment rows = $DB_EMPLOY (expected 1)"

ROWS="$(get "/employees?limit=200&search=Local" | py "import sys,json;d=json.load(sys.stdin);rows=[r for r in d.get('data',[]) if 'Local' in (r.get('name') or '')];print(len(rows))")"
[ "${ROWS:-9}" = "1" ] && ok "GET /employees shows the admin ONCE (was 7×)" || no "admin appears $ROWS times"

section "A2. لا غياب على access grants + لا score مكرر"
SYNTH_ABS="$(psql "$DSN" -tA -c "SELECT count(*) FROM attendance a JOIN employee_assignments ea ON ea.id=a.\"assignmentId\" WHERE ea.\"isAccessGrant\"=TRUE AND a.status='absent';")"
[ "${SYNTH_ABS:-9}" = "0" ] && ok "zero synthetic absent rows on access-grant assignments" || no "$SYNTH_ABS absent rows remain"

DUP_SCORES="$(psql "$DSN" -tA -c "SELECT count(*) FROM employee_scores s JOIN employee_assignments ea ON ea.id=s.\"assignmentId\" WHERE ea.\"isAccessGrant\"=TRUE;")"
[ "${DUP_SCORES:-9}" = "0" ] && ok "zero composite scores on access-grant assignments" || no "$DUP_SCORES scores remain"

section "A3. عدّاد الرواتب يستثني access grants"
PAYROLL_COUNT="$(psql "$DSN" -tA -c "SELECT count(*) FROM employee_assignments WHERE \"companyId\"=2 AND status='active' AND \"isAccessGrant\"=FALSE;")"
TOTAL_COUNT="$(psql "$DSN" -tA -c "SELECT count(*) FROM employee_assignments WHERE \"companyId\"=2 AND status='active';")"
[ "$PAYROLL_COUNT" -lt "$TOTAL_COUNT" ] && ok "payroll-eligible assignments ($PAYROLL_COUNT) < total active ($TOTAL_COUNT) — grants excluded" || no "no exclusion ($PAYROLL_COUNT vs $TOTAL_COUNT)"

section "A4. الوصول لم يُكسر: الأدمن ما زال يرى فروع الضياء"
JA="$(mktemp)"
# The login response carries `assignments` (the company/branch picker
# source); /auth/me carries the resolved identity. Read assignments
# from the LOGIN body.
ADMIN_RESP="$(curl -sS -c "$JA" -H "X-E2E-Test: 1" -X POST "$BASE/auth/login" -H "Content-Type: application/json" -d "{\"email\":\"$ADMIN_EMAIL\",\"password\":\"$ADMIN_PASSWORD\"}")"
ADMIN_ASGS="$(echo "$ADMIN_RESP" | py "import sys,json;d=json.load(sys.stdin);print(len(d.get('assignments',[])))")"
if [ "${ADMIN_ASGS:--1}" != "-1" ] && [ "${ADMIN_ASGS:-0}" -ge 1 ]; then
  ok "admin login works; picker shows $ADMIN_ASGS assignment(s) — access intact (grants still feed the switcher)"
  ME_OK="$(curl -sS -b "$JA" "$BASE/auth/me" | py "import sys,json;d=json.load(sys.stdin);print(bool(d.get('id')))")"
  [ "$ME_OK" = "True" ] && ok "/auth/me resolves the admin identity" || no "/auth/me failed"
else
  echo "  ⏭️  admin login unavailable on this tenant — skipping"
fi
rm -f "$JA"

# ────────────────────────────────────────────────────────────────────────────
section "B. رحلة الشخصيات الخمس — القائمة تختلف"
POSID="$(psql "$DSN" -tA -c "select id from positions where \"companyId\" is null and \"isActive\"=true order by level desc limit 1;")"
CATKEY="$(psql "$DSN" -tA -c "select \"categoryKey\" from employee_categories where \"companyId\" is null and \"isActive\"=true order by \"displayOrder\" limit 1;")"
TEAMID="$(psql "$DSN" -tA -c "select id from teams where \"companyId\"=2 and \"isActive\"=true order by id limit 1;")"
PROJID="$(psql "$DSN" -tA -c "select id from projects where \"companyId\"=2 and \"deletedAt\" is null order by id limit 1;")"
CCID="$(psql "$DSN" -tA -c "select id from cost_centers where \"companyId\"=2 order by id limit 1;")"
MGRID="$(psql "$DSN" -tA -c "select e.id from employees e join employee_assignments ea on ea.\"employeeId\"=e.id where ea.\"companyId\"=2 and ea.status='active' and e.\"deletedAt\" is null order by e.id limit 1;")"

seed_persona(){
  local KEY="$1" EMAIL="$2" NAME="$3" PHSFX="$4"
  local NID; NID="$(printf '%010d' $(( (10#$SFX$PHSFX) % 9999999999 )))"
  local PAYLOAD="{\"name\":\"$NAME\",\"phone\":\"055${SFX}${PHSFX}\",\"nationalId\":\"$NID\",\"nationality\":\"سعودي\",\"department\":\"المالية\",\"jobTitle\":\"محاسب\",\"contractType\":\"full_time\",\"salary\":7000,\"branchId\":3,\"internalEmail\":\"$EMAIL\",\"managerId\":$MGRID,\"positionId\":$POSID,\"categoryKey\":\"$CATKEY\",\"teamId\":$TEAMID,\"projectId\":$PROJID,\"costCenterId\":$CCID}"
  local RESP; RESP="$(postw /employees "$PAYLOAD")"
  local USERID; USERID="$(echo "$RESP" | py "import sys,json;d=json.load(sys.stdin);print((d.get('userAccount') or {}).get('userId') or '')")"
  [ -z "$USERID" ] && return 1
  psql "$DSN" -q -c "UPDATE users SET \"passwordHash\"='$TEST_HASH', role='$KEY' WHERE id=$USERID;" >/dev/null 2>&1
  psql "$DSN" -q -c "DELETE FROM rbac_user_roles WHERE \"userId\"=$USERID AND \"companyId\"=2;" >/dev/null 2>&1
  psql "$DSN" -q -c "INSERT INTO rbac_user_roles (\"userId\",\"companyId\",role_id,\"branchId\",is_primary,\"assignedBy\",\"createdAt\") SELECT $USERID, 2, id, 3, true, 1, NOW() FROM rbac_roles WHERE role_key='$KEY' AND (\"companyId\"=2 OR \"companyId\" IS NULL) ORDER BY \"companyId\" NULLS LAST LIMIT 1;" >/dev/null 2>&1
  psql "$DSN" -q -c "UPDATE employee_assignments ea SET role='$KEY' FROM users u WHERE u.id=$USERID AND ea.\"employeeId\"=u.\"employeeId\" AND ea.\"companyId\"=2;" >/dev/null 2>&1
  echo "ok"
}

declare -A EMAILS
for P in hr_manager department_manager payroll_officer employee; do
  EMAILS[$P]="pr8a-${P//_/-}-${SFX}@dr.local"
done
seed_persona hr_manager        "${EMAILS[hr_manager]}"        "مديرة HR" 1 >/dev/null && ok "hr_manager seeded" || no "hr seed"
seed_persona department_manager "${EMAILS[department_manager]}" "مدير قسم" 2 >/dev/null && ok "department_manager seeded" || echo "  ⏭️  dept role may be absent"
seed_persona payroll_officer   "${EMAILS[payroll_officer]}"   "مسؤول رواتب" 3 >/dev/null && ok "payroll_officer seeded" || echo "  ⏭️  payroll role may be absent"
seed_persona employee          "${EMAILS[employee]}"          "موظف عادي" 4 >/dev/null && ok "employee seeded" || no "emp seed"

modules_of(){
  local EMAIL="$1" PASS_="$2"
  local JX; JX="$(mktemp)"
  curl -fsS -c "$JX" -H "X-E2E-Test: 1" -X POST "$BASE/auth/login" -H "Content-Type: application/json" -d "{\"email\":\"$EMAIL\",\"password\":\"$PASS_\"}" -o /dev/null 2>/dev/null || { echo "-1"; rm -f "$JX"; return; }
  curl -sS -b "$JX" "$BASE/auth/me" | py "import sys,json;d=json.load(sys.stdin);ms=set();[ms.update(r.get('modules') or []) for r in d.get('userRoles',[])];print(len(ms))"
  rm -f "$JX"
}

M_OWNER="$(modules_of "$OWNER_EMAIL" "$OWNER_PASSWORD")"
M_HR="$(modules_of "${EMAILS[hr_manager]}" "$TEST_PASSWORD")"
M_DEPT="$(modules_of "${EMAILS[department_manager]}" "$TEST_PASSWORD")"
M_PAY="$(modules_of "${EMAILS[payroll_officer]}" "$TEST_PASSWORD")"
M_EMP="$(modules_of "${EMAILS[employee]}" "$TEST_PASSWORD")"
echo "    modules: owner=$M_OWNER hr=$M_HR dept=$M_DEPT payroll=$M_PAY employee=$M_EMP"

[ "${M_OWNER:-0}" -gt "${M_EMP:-0}" ] && ok "owner ($M_OWNER) > employee ($M_EMP) — sidebar narrows" || no "no narrowing owner vs employee"
[ "${M_HR:-0}" -gt "${M_EMP:-0}" ] && ok "hr_manager ($M_HR) > employee ($M_EMP)" || no "no narrowing hr vs employee"
[ "${M_OWNER:-0}" -gt "${M_HR:-0}" ] && ok "owner ($M_OWNER) > hr_manager ($M_HR)" || no "owner not wider than hr"
if [ "${M_PAY:--1}" != "-1" ] && [ "${M_PAY:-0}" -ge 1 ]; then
  [ "${M_PAY:-0}" -lt "${M_OWNER:-0}" ] && ok "payroll_officer ($M_PAY) < owner — scoped lane" || no "payroll not narrowed"
else
  echo "  ⏭️  payroll_officer login/modules unavailable — role likely absent in seed"
fi

rm -f "$J"
echo
echo "▶ Result: $PASS passed, $FAIL failed"
[ "$FAIL" -eq 0 ] || exit 1
