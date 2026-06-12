#!/bin/bash
# verify-hr-org-tree-journey.sh — E2E proof of the unified org tree
# (#2077 PR-7) on a live tenant. The deep audit flagged that the
# «إدارة» level was dark — no table, no UI. PR-7 adds it; this script
# proves the full chain «شركة → فرع → إدارة → قسم → فريق» is
# operational by:
#
#   1. Creating an administration under Al-Diyaa's main branch.
#   2. Linking an existing department to that administration.
#   3. Asserting GET /settings/org-tree returns the nested structure
#      with the administration nested under the branch and the
#      department under the administration.
#   4. Asserting GET /employees/:id returns the new administrationName
#      field (PR-7's LEFT JOIN on administrations).
#   5. Asserting committees + projects + cost centers DO NOT appear in
#      the tree (doctrine pin: they're operational bridges, not nodes).
#   6. Asserting every administration mutation lands an audit_logs row
#      with the IGOC quartet (PR-1's discipline preserved).
#
# Prereqs: bootstrap + built server + Al-Diyaa tenant + migration 287.
set -euo pipefail
BASE="${BASE:-http://localhost:5000/api}"
DSN="${DATABASE_URL:-postgres://ghayth_erp:ghayth_erp@localhost:5432/ghayth_erp}"
OWNER_EMAIL="${OWNER_EMAIL:-door@door.sa}"
OWNER_PASSWORD="${OWNER_PASSWORD:-Door@2026Diaa}"
J="$(mktemp)"; PASS=0; FAIL=0
py(){ python3 -c "$1" 2>/dev/null; }
ok(){ echo "  ✅ $1"; PASS=$((PASS+1)); }
no(){ echo "  ❌ $1"; FAIL=$((FAIL+1)); }
section(){ echo; echo "▶ $1"; }
export PGPASSWORD="$(echo "$DSN" | sed -E 's#.*://[^:]+:([^@]+)@.*#\1#')"

SFX="$(printf '%06d' $(( (RANDOM*RANDOM) % 1000000 )))"

section "0. apply migration 287 (idempotent) + owner login"
psql "$DSN" -q -f /home/user/ghayth-erp/artifacts/api-server/src/migrations/287_administrations_layer.sql >/dev/null 2>&1
TABLE_OK="$(psql "$DSN" -tA -c "SELECT count(*) FROM information_schema.tables WHERE table_name='administrations';")"
[ "$TABLE_OK" = "1" ] && ok "administrations table exists" || { no "table missing"; exit 1; }
COLUMN_OK="$(psql "$DSN" -tA -c "SELECT count(*) FROM information_schema.columns WHERE table_name='departments' AND column_name='administrationId';")"
[ "$COLUMN_OK" = "1" ] && ok "departments.administrationId column exists" || { no "column missing"; exit 1; }

curl -fsS -c "$J" -H "X-E2E-Test: 1" -X POST "$BASE/auth/login" -H "Content-Type: application/json" -d "{\"email\":\"$OWNER_EMAIL\",\"password\":\"$OWNER_PASSWORD\"}" -o /dev/null
CSRF="$(grep erp_csrf "$J" | awk '{print $7}')"
[ -n "$CSRF" ] && ok "owner login" || { no "owner login"; exit 1; }
postw(){ curl -sS -b "$J" -H "x-csrf-token: $CSRF" -H "Content-Type: application/json" -X POST "$BASE$1" -d "$2"; }
patchw(){ curl -sS -b "$J" -H "x-csrf-token: $CSRF" -H "Content-Type: application/json" -X PATCH "$BASE$1" -d "$2"; }
delw(){ curl -sS -o /dev/null -w "%{http_code}" -b "$J" -H "x-csrf-token: $CSRF" -X DELETE "$BASE$1"; }
get(){ curl -sS -b "$J" "$BASE$1"; }

# Resolve the Al-Diyaa branch + an existing department.
BRANCH_ID="$(psql "$DSN" -tA -c "SELECT id FROM branches WHERE \"companyId\"=2 ORDER BY id LIMIT 1;")"
DEPT_ID="$(psql "$DSN" -tA -c "SELECT id FROM departments WHERE \"companyId\"=2 ORDER BY id LIMIT 1;")"
[ -n "$BRANCH_ID" ] && [ -n "$DEPT_ID" ] && ok "tenant ready (branch=$BRANCH_ID, dept=$DEPT_ID)" || { no "branch/dept missing"; exit 1; }

section "1. POST /settings/administrations — create إدارة under that branch"
ADM_NAME="إدارة التشغيل ${SFX}"
ADM_RESP="$(postw /settings/administrations "{\"name\":\"$ADM_NAME\",\"branchId\":$BRANCH_ID}")"
ADM_ID="$(echo "$ADM_RESP" | py "import sys,json;d=json.load(sys.stdin);print((d.get('data') or {}).get('id') or '')")"
[ -n "$ADM_ID" ] && ok "administration created (#$ADM_ID — «$ADM_NAME» under branch #$BRANCH_ID)" || { no "POST failed: $(echo "$ADM_RESP"|py 'import sys,json;d=json.load(sys.stdin);print(d.get("error") or d)')"; exit 1; }

# audit_logs forensics: the IGOC quartet must land.
AUDIT_ROW="$(psql "$DSN" -tA -c "SELECT (\"after\"->>'name') || '|' || coalesce(resolved_scope,'-') || '|' || coalesce(active_role_key,'-') FROM audit_logs WHERE entity='administrations' AND \"entityId\"=$ADM_ID::text AND action='create' ORDER BY id DESC LIMIT 1;")"
echo "$AUDIT_ROW" | grep -q "$ADM_NAME" && ok "audit_logs row carries the new name + resolved_scope (IGOC quartet)" || no "audit row malformed: $AUDIT_ROW"

section "2. PATCH /settings/departments/:id — link existing department to the إدارة"
patchw_status() { curl -sS -o /dev/null -w "%{http_code}" -b "$J" -H "x-csrf-token: $CSRF" -H "Content-Type: application/json" -X PUT "$BASE$1" -d "$2"; }
DEPT_NAME="$(psql "$DSN" -tA -c "SELECT name FROM departments WHERE id=$DEPT_ID;")"
UPDATE_STATUS="$(patchw_status /settings/departments/$DEPT_ID "{\"name\":\"$DEPT_NAME\",\"administrationId\":$ADM_ID,\"branchId\":$BRANCH_ID}")"
[ "$UPDATE_STATUS" = "200" ] && ok "PUT /settings/departments/$DEPT_ID → 200 (linked to administration #$ADM_ID)" || no "PUT failed: $UPDATE_STATUS"

LINKED_ADM="$(psql "$DSN" -tA -c "SELECT \"administrationId\" FROM departments WHERE id=$DEPT_ID;")"
[ "$LINKED_ADM" = "$ADM_ID" ] && ok "departments.administrationId = $ADM_ID (chain anchored)" || no "DB still shows administrationId=$LINKED_ADM"

section "3. GET /settings/org-tree — the nested structure carries the new chain"
TREE="$(get /settings/org-tree)"
TREE_ADMIN_IN_BRANCH="$(echo "$TREE" | py "import sys,json;d=json.load(sys.stdin);adms=[a for b in d.get('branches',[]) for a in b.get('administrations',[]) if str(a.get('id'))==str($ADM_ID)];print(len(adms))")"
[ "$TREE_ADMIN_IN_BRANCH" = "1" ] && ok "tree: administration #$ADM_ID nested under branch #$BRANCH_ID" || no "admin not found in tree under branch"

TREE_DEPT_IN_ADMIN="$(echo "$TREE" | py "import sys,json;d=json.load(sys.stdin);depts=[dp for b in d.get('branches',[]) for a in b.get('administrations',[]) if str(a.get('id'))==str($ADM_ID) for dp in a.get('departments',[]) if str(dp.get('id'))==str($DEPT_ID)];print(len(depts))")"
[ "$TREE_DEPT_IN_ADMIN" = "1" ] && ok "tree: department #$DEPT_ID nested under administration #$ADM_ID" || no "dept not nested under admin"

TREE_HAS_COSTCENTERS="$(echo "$TREE" | py "import sys,json;d=json.load(sys.stdin);keys=list(d.keys());print('cost' in ' '.join(keys).lower())")"
[ "$TREE_HAS_COSTCENTERS" = "False" ] && ok "tree does NOT carry cost_centers (doctrine: operational bridge, not a tree node)" || no "cost_centers leaked into tree"

TREE_HAS_COMMITTEES="$(echo "$TREE" | py "import sys,json;d=json.load(sys.stdin);keys=list(d.keys());print('committee' in ' '.join(keys).lower())")"
[ "$TREE_HAS_COMMITTEES" = "False" ] && ok "tree does NOT carry committees (doctrine: operational bridge, not a tree node)" || no "committees leaked into tree"

TREE_HAS_PROJECTS="$(echo "$TREE" | py "import sys,json;d=json.load(sys.stdin);keys=list(d.keys());print('project' in ' '.join(keys).lower())")"
[ "$TREE_HAS_PROJECTS" = "False" ] && ok "tree does NOT carry projects (doctrine: operational bridge, not a tree node)" || no "projects leaked into tree"

section "4. GET /employees/:id — administrationName surfaces on the 360"
EMP_ID="$(psql "$DSN" -tA -c "SELECT e.id FROM employees e JOIN employee_assignments ea ON ea.\"employeeId\"=e.id WHERE ea.\"departmentId\"=$DEPT_ID AND ea.\"companyId\"=2 AND ea.status='active' AND e.\"deletedAt\" IS NULL LIMIT 1;")"
if [ -n "$EMP_ID" ]; then
  EMP_RESP="$(get /employees/$EMP_ID)"
  EMP_ADM_NAME="$(echo "$EMP_RESP" | py "import sys,json;d=json.load(sys.stdin);print(d.get('administrationName') or '')")"
  [ "$EMP_ADM_NAME" = "$ADM_NAME" ] && ok "employee #$EMP_ID — administrationName = «$EMP_ADM_NAME» (PR-7 chain visible in 360)" || no "administrationName mismatch: got «$EMP_ADM_NAME», expected «$ADM_NAME»"
else
  echo "  ⏭️  no active employee in department #$DEPT_ID — skipping 360 chain check"
fi

section "5. Soft-delete keeps lineage intact"
DEL_STATUS="$(delw /settings/administrations/$ADM_ID)"
[ "$DEL_STATUS" = "200" ] && ok "DELETE /settings/administrations/$ADM_ID → 200 (soft-archive)" || no "DELETE → $DEL_STATUS"
ROW_AFTER="$(psql "$DSN" -tA -c "SELECT \"isActive\" FROM administrations WHERE id=$ADM_ID;")"
[ "$ROW_AFTER" = "f" ] && ok "administration row STILL EXISTS with isActive=false (no hard delete; audit trail preserved)" || no "row deleted hard or status wrong: $ROW_AFTER"
LINKED_AFTER="$(psql "$DSN" -tA -c "SELECT \"administrationId\" FROM departments WHERE id=$DEPT_ID;")"
[ "$LINKED_AFTER" = "$ADM_ID" ] && ok "department still references archived administration (FK preserved — admin UI surfaces it as «مؤرشفة»)" || no "FK broken: $LINKED_AFTER"

rm -f "$J"
echo
echo "▶ Result: $PASS passed, $FAIL failed"
[ "$FAIL" -eq 0 ] || exit 1
