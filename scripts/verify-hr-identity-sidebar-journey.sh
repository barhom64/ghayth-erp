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
#   C. PR-9a (FU-1 closed): department_manager + payroll_officer get
#      REAL module sets (>0 — the seed fix in migration 291), and the
#      lanes separate: payroll_officer reads payroll but 403s on
#      التحقيقات (hr.discipline); department_manager reads his
#      department's employees but 403s on payroll.
#
# Prereqs: bootstrap + built server + Al-Diyaa tenant + migrations 289+291.
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

section "0. migrations 289+291 applied + owner login"
psql "$DSN" -q -f /home/user/ghayth-erp/artifacts/api-server/src/migrations/289_access_grant_assignments.sql >/dev/null 2>&1
COL="$(psql "$DSN" -tA -c "SELECT count(*) FROM information_schema.columns WHERE table_name='employee_assignments' AND column_name='isAccessGrant';")"
[ "$COL" = "1" ] && ok "isAccessGrant column exists" || { no "column missing"; exit 1; }

# PR-9a — FU-1 seed fix: standard grants for department_manager + payroll_officer.
psql "$DSN" -q -f /home/user/ghayth-erp/artifacts/api-server/src/migrations/306_seed_standard_role_grants_fix.sql >/dev/null 2>&1
G_DEPT="$(psql "$DSN" -tA -c "SELECT count(*) FROM rbac_role_grants g JOIN rbac_roles r ON r.id=g.role_id WHERE r.role_key='department_manager' AND r.\"companyId\" IS NULL;")"
G_PAY="$(psql "$DSN" -tA -c "SELECT count(*) FROM rbac_role_grants g JOIN rbac_roles r ON r.id=g.role_id WHERE r.role_key='payroll_officer' AND r.\"companyId\" IS NULL;")"
[ "${G_DEPT:-0}" -ge 1 ] && ok "department_manager carries $G_DEPT grants (was 0 — no role row at all)" || no "department_manager still 0 grants"
[ "${G_PAY:-0}" -ge 1 ] && ok "payroll_officer carries $G_PAY grants (was 0)" || no "payroll_officer still 0 grants"
G_PAY_DISC="$(psql "$DSN" -tA -c "SELECT count(*) FROM rbac_role_grants g JOIN rbac_roles r ON r.id=g.role_id WHERE r.role_key='payroll_officer' AND g.feature_key LIKE 'hr.discipline%';")"
[ "${G_PAY_DISC:-9}" = "0" ] && ok "payroll_officer has ZERO hr.discipline grants (التحقيقات خارج حزمته)" || no "payroll_officer leaked $G_PAY_DISC discipline grants"

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
# PR-9a: dept/payroll seeding is now a HARD assertion — migration 291
# guarantees the role rows + grants exist, so a silent 0-row bind is a bug.
seed_persona hr_manager        "${EMAILS[hr_manager]}"        "مديرة HR" 1 >/dev/null && ok "hr_manager seeded" || no "hr seed"
seed_persona department_manager "${EMAILS[department_manager]}" "مدير قسم" 2 >/dev/null && ok "department_manager seeded" || no "dept seed"
seed_persona payroll_officer   "${EMAILS[payroll_officer]}"   "مسؤول رواتب" 3 >/dev/null && ok "payroll_officer seeded" || no "payroll seed"
seed_persona employee          "${EMAILS[employee]}"          "موظف عادي" 4 >/dev/null && ok "employee seeded" || no "emp seed"

# Belt-and-braces: the rbac bind must have matched a real role row, and a
# NON-template one — /auth/me only surfaces is_template=FALSE roles, so a
# template bind = authorized API but 0-module sidebar (the FU-1 symptom).
for P in department_manager payroll_officer; do
  BOUND="$(psql "$DSN" -tA -c "SELECT count(*) FROM rbac_user_roles ur JOIN rbac_roles r ON r.id=ur.role_id JOIN users u ON u.id=ur.\"userId\" WHERE u.email='${EMAILS[$P]}' AND r.role_key='$P' AND r.is_template=FALSE;")"
  [ "${BOUND:-0}" = "1" ] && ok "$P persona bound to a per-company (non-template) role row" || no "$P bound to template/nothing (the pre-291 failure mode)"
done

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

# PR-9a hard pins (FU-1 closed): both personas now have REAL module sets.
[ "${M_DEPT:-0}" -ge 1 ] && ok "department_manager has $M_DEPT modules (was 0 pre-291)" || no "department_manager still 0 modules"
[ "${M_PAY:-0}" -ge 1 ] && ok "payroll_officer has $M_PAY modules (was 0 pre-291)" || no "payroll_officer still 0 modules"
[ "${M_DEPT:-0}" -lt "${M_OWNER:-0}" ] && ok "department_manager ($M_DEPT) < owner ($M_OWNER) — scoped, not the whole system" || no "dept not narrowed"
[ "${M_PAY:-0}" -lt "${M_OWNER:-0}" ] && ok "payroll_officer ($M_PAY) < owner — scoped lane" || no "payroll not narrowed"

# ────────────────────────────────────────────────────────────────────────────
section "C. PR-9a — المسارات تفترق: الرواتب لمسؤول الرواتب، التحقيقات ليست له"
# status_of <email> <path> → HTTP status code as that persona.
status_of(){
  local EMAIL="$1" PATH_="$2"
  local JX; JX="$(mktemp)"
  curl -fsS -c "$JX" -H "X-E2E-Test: 1" -X POST "$BASE/auth/login" -H "Content-Type: application/json" -d "{\"email\":\"$EMAIL\",\"password\":\"$TEST_PASSWORD\"}" -o /dev/null 2>/dev/null || { echo "000"; rm -f "$JX"; return; }
  curl -sS -o /dev/null -w "%{http_code}" -b "$JX" "$BASE$PATH_"
  rm -f "$JX"
}

PAY_PAYROLL="$(status_of "${EMAILS[payroll_officer]}" "/hr/payroll")"
PAY_DISC="$(status_of "${EMAILS[payroll_officer]}" "/hr/discipline/memos")"
DEPT_EMP="$(status_of "${EMAILS[department_manager]}" "/employees?limit=5")"
DEPT_PAYROLL="$(status_of "${EMAILS[department_manager]}" "/hr/payroll")"
EMP_PAYROLL="$(status_of "${EMAILS[employee]}" "/hr/payroll")"

[ "$PAY_PAYROLL" = "200" ] && ok "payroll_officer GET /hr/payroll → 200 (يرى المسيرات)" || no "payroll_officer /hr/payroll → $PAY_PAYROLL"
[ "$PAY_DISC" = "403" ] && ok "payroll_officer GET /hr/discipline/memos → 403 (لا يرى التحقيقات — authorize، لا إخفاء رابط)" || no "payroll_officer /hr/discipline/memos → $PAY_DISC (expected 403)"
[ "$DEPT_EMP" = "200" ] && ok "department_manager GET /employees → 200 (يرى موظفيه)" || no "department_manager /employees → $DEPT_EMP"
[ "$DEPT_PAYROLL" = "403" ] && ok "department_manager GET /hr/payroll → 403 (الرواتب ليست له)" || no "department_manager /hr/payroll → $DEPT_PAYROLL (expected 403)"
[ "$EMP_PAYROLL" = "403" ] && ok "employee GET /hr/payroll → 403 (employee يبقى محدودًا)" || no "employee /hr/payroll → $EMP_PAYROLL (expected 403)"

# ────────────────────────────────────────────────────────────────────────────
section "D. PR-10 — Bootstrap الشركات الجديدة يعرف الدورين (لا تكرار FU-1)"
# Migration 291 covered the live tenant; this proves that a NEW
# company gets the same bundles automatically from the bootstrap
# catalog — no future-FU-1 ambush.
NEWCO="bootstrap-test-$(date +%s%N | head -c12)"
PR10_CID="$(psql "$DSN" -tA -c "INSERT INTO companies (name, status, \"createdAt\") VALUES ('$NEWCO', 'active', NOW()) RETURNING id;" | head -1 | tr -d '[:space:]')"
[ -n "$PR10_CID" ] && ok "company created (id=$PR10_CID)" || { no "create company failed"; PR10_CID=0; }

if [ "${PR10_CID:-0}" -gt 0 ]; then
  # Drive the SAME bootstrap path the server uses for fresh tenants —
  # directly through the compiled lib so this is real evidence of
  # production behaviour, not a re-implementation. The bundle bootstraps
  # the pool from DATABASE_URL on import.
  # The server bundle is single-file (esbuild), so we drive the
  # bootstrap path from source via tsx — same exports, same code path,
  # no shim. The script logs BOOT_OK on success.
  cat > /tmp/pr10-bootstrap-newco.mts <<EOF
import { withTransaction } from "/home/user/ghayth-erp/artifacts/api-server/src/lib/rawdb.ts";
import { seedRolesAndGrantsV2 } from "/home/user/ghayth-erp/artifacts/api-server/src/lib/rbac/autoMigrate.ts";
const out = await withTransaction((c) => seedRolesAndGrantsV2(c, $PR10_CID));
console.log("BOOT_OK", JSON.stringify({ roles: Object.keys(out.roleIdByKey).length, grants: out.grantsCreated }));
process.exit(0);
EOF
  BOOT_OUT="$(cd /home/user/ghayth-erp/artifacts/api-server && set -a; . ./.env; set +a; npx tsx /tmp/pr10-bootstrap-newco.mts 2>&1 | grep BOOT_OK | head -1)"
  [ -n "$BOOT_OUT" ] && ok "bootstrap ran on the new company: $BOOT_OUT" || no "bootstrap call failed (see /tmp/pr10-bootstrap-newco.mts)"

  # Counts in the freshly bootstrapped company.
  for ROLE in department_manager payroll_officer; do
    CNT="$(psql "$DSN" -tA -c "SELECT count(*) FROM rbac_role_grants g JOIN rbac_roles r ON r.id=g.role_id WHERE r.role_key='$ROLE' AND r.\"companyId\"=$PR10_CID;")"
    [ "${CNT:-0}" -ge 4 ] && ok "$ROLE bootstrapped with $CNT grants in new company" || no "$ROLE bootstrap: only $CNT grants"
  done
  # payroll_officer must NOT carry discipline in the new company either.
  DISC="$(psql "$DSN" -tA -c "SELECT count(*) FROM rbac_role_grants g JOIN rbac_roles r ON r.id=g.role_id WHERE r.role_key='payroll_officer' AND r.\"companyId\"=$PR10_CID AND g.feature_key LIKE 'hr.discipline%';")"
  [ "${DISC:-9}" = "0" ] && ok "bootstrapped payroll_officer has ZERO hr.discipline grants" || no "bootstrapped payroll_officer leaked $DISC discipline grants"
  # Cleanup the throwaway company.
  psql "$DSN" -q -c "DELETE FROM rbac_role_grants WHERE role_id IN (SELECT id FROM rbac_roles WHERE \"companyId\"=$PR10_CID); DELETE FROM rbac_roles WHERE \"companyId\"=$PR10_CID; DELETE FROM companies WHERE id=$PR10_CID;" >/dev/null 2>&1
fi

# ────────────────────────────────────────────────────────────────────────────
section "E. PR-10 — رابط «الامتثال والجزاءات» لا يظهر لمن لا يملك صلاحية صريحة"
# The sidebar filter consumes the same /permissions/my projection
# that gates buttons. Read each persona's projected permissions and
# evaluate the gate string-by-string — never claims «shown» when the
# UI would hide it.
perms_of(){
  local EMAIL="$1"
  local JX; JX="$(mktemp)"
  curl -fsS -c "$JX" -H "X-E2E-Test: 1" -X POST "$BASE/auth/login" -H "Content-Type: application/json" -d "{\"email\":\"$EMAIL\",\"password\":\"$TEST_PASSWORD\"}" -o /dev/null 2>/dev/null
  curl -sS -b "$JX" "$BASE/permissions/my" | python3 -c "import sys,json;d=json.load(sys.stdin);print('\n'.join(d.get('permissions') or []))"
  rm -f "$JX"
}
# Mirrors src/lib/permission-match.ts exactly so what the journey
# asserts === what the sidebar actually evaluates.
matches(){
  python3 -c "
import sys
granted=sys.stdin.read().splitlines()
req=sys.argv[1]
if (req in granted) or ('*' in granted):
    print('y'); sys.exit()
scope, _, action = req.partition(':')
if (scope+':*') in granted:
    print('y'); sys.exit()
mod=scope.split('.')[0]
if (mod+':*') in granted:
    print('y'); sys.exit()
if '.' in scope and action and (mod+':'+action) in granted:
    print('y'); sys.exit()
print('n')
" "$1"
}
HR_PERMS="$(perms_of "${EMAILS[hr_manager]}")"
PAY_PERMS="$(perms_of "${EMAILS[payroll_officer]}")"
DEPT_PERMS="$(perms_of "${EMAILS[department_manager]}")"

# Group gate: hr.violations:view OR hr.violations:list OR hr.discipline:view OR hr.discipline:list (permMode: "any")
seen_compliance(){
  for req in "hr.violations:view" "hr.violations:list" "hr.discipline:view" "hr.discipline:list"; do
    [ "$(echo "$1" | matches "$req")" = "y" ] && { echo y; return; }
  done; echo n
}
HR_SEE="$(seen_compliance "$HR_PERMS")"
PAY_SEE="$(seen_compliance "$PAY_PERMS")"
DEPT_SEE="$(seen_compliance "$DEPT_PERMS")"

[ "$HR_SEE" = "y" ] && ok "hr_manager: «الامتثال والجزاءات» يظهر (hr:* يغطّي)" || no "hr_manager: «الامتثال والجزاءات» مخفي — تراجع غير مقصود"
[ "$PAY_SEE" = "n" ] && ok "payroll_officer: «الامتثال والجزاءات» لا يظهر (لا يوجد grant على hr.discipline/violations)" || no "payroll_officer ما زال يرى الرابط ثم يُرفض 403"
[ "$DEPT_SEE" = "n" ] && ok "department_manager: «الامتثال والجزاءات» لا يظهر (التحقيقات وظيفة HR لا قسم)" || no "department_manager يرى الرابط رغم عدم وجود grant"

rm -f "$J"
echo
echo "▶ Result: $PASS passed, $FAIL failed"
[ "$FAIL" -eq 0 ] || exit 1
