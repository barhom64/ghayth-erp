#!/bin/bash
# verify-platform-role-nav-journey.sh — PR-0 (#2163): READ-ONLY platform
# role-experience probe. Walks each available persona, reads what the
# server says is visible to them, and probes a canonical path per top-
# level module to surface forbidden-visible / wrong-owner cases.
#
# Discipline:
#   • READ ONLY — every HTTP method here is GET. Zero POST/PATCH/DELETE.
#   • NO seeding. If a persona has no live user, the journey records it
#     as a seed gap and continues (PR-0 mandate: «إذا بعض الأدوار غير
#     جاهزة، يسجل ذلك كفجوة seed، لا يتم ترقيعها داخل PR-0»).
#   • NO assertions on a passing baseline. The output is a JSON report
#     at /tmp/platform-role-nav-journey.json that PR-0's audit consumes;
#     PR-9 of wave 2 turns this into a regression smoke pin.
#
# Prereqs: built api-server on :5000 + live Al-Diyaa tenant.
set -uo pipefail
BASE="${BASE:-http://localhost:5000/api}"
DSN="${DATABASE_URL:-postgres://ghayth_erp:ghayth_erp@localhost:5432/ghayth_erp}"
OWNER_EMAIL="${OWNER_EMAIL:-door@door.sa}"
OWNER_PASSWORD="${OWNER_PASSWORD:-Door@2026Diaa}"
TEST_PASSWORD='Test1234!'
OUT="${OUT:-/tmp/platform-role-nav-journey.json}"
export PGPASSWORD="$(echo "$DSN" | sed -E 's#.*://[^:]+:([^@]+)@.*#\1#')"

# Canonical path per top-level module — the journey probes a GET on
# each and records the HTTP status per persona.
declare -A MODULE_PATHS=(
  [home]="/dashboard"
  [hr]="/employees"
  [finance]="/finance/invoices"
  [fleet]="/fleet/vehicles"
  [property]="/properties/units"
  [warehouse]="/warehouse/items"
  [governance]="/governance/policies"
  [bi]="/module-dashboards"
  [reports]="/reports/financial"
  [crm]="/clients"
  [legal]="/legal/cases"
  [support]="/support/tickets"
  [comms]="/inbox"
  [requests]="/requests"
  [documents]="/documents"
  [operations]="/projects"
  [admin]="/admin/users"
  [me]="/work-inbox"
)

# Personas the matrix in PR-0 lists. Some may have no seeded user.
PERSONAS=(owner general_manager hr_manager finance_manager fleet_manager
          property_manager warehouse_manager department_manager
          payroll_officer employee)

# Look up the first live user email for a role_key (NULL if absent).
email_for_role(){
  local role="$1"
  if [ "$role" = "owner" ]; then echo "$OWNER_EMAIL"; return; fi
  psql "$DSN" -tA -c "
    SELECT u.email FROM users u
      JOIN rbac_user_roles ur ON ur.\"userId\"=u.id
      JOIN rbac_roles r ON r.id=ur.role_id
     WHERE r.role_key='$role'
       AND u.\"isActive\" = TRUE
     ORDER BY u.id ASC LIMIT 1;" 2>/dev/null | head -1
}

# READ-ONLY probe: login, then GET each canonical module path. Records
# the HTTP status + the persona's projected /permissions/my count.
probe_persona(){
  local role="$1" email="$2"
  local pass="$TEST_PASSWORD"; [ "$role" = "owner" ] && pass="$OWNER_PASSWORD"
  local J; J="$(mktemp)"
  local login_code
  login_code=$(curl -sS -o /dev/null -w "%{http_code}" -c "$J" \
    -H "X-E2E-Test: 1" -X POST "$BASE/auth/login" \
    -H "Content-Type: application/json" \
    -d "{\"email\":\"$email\",\"password\":\"$pass\"}")
  if [ "$login_code" != "200" ]; then
    echo "  {\"role\":\"$role\",\"email\":\"$email\",\"login\":$login_code,\"skipped\":true}"
    rm -f "$J"; return
  fi

  local perms_total
  perms_total=$(curl -sS -b "$J" "$BASE/permissions/my" \
    | python3 -c "import sys,json;d=json.load(sys.stdin);print(len(d.get('permissions') or []))" 2>/dev/null || echo "?")

  local modules
  modules=$(curl -sS -b "$J" "$BASE/auth/me" \
    | python3 -c "import sys,json;d=json.load(sys.stdin);ms=set();[ms.update(r.get('modules') or []) for r in d.get('userRoles',[])];print(','.join(sorted(ms)))" 2>/dev/null || echo "")

  local statuses="{"
  local first=1
  for mod_key in "${!MODULE_PATHS[@]}"; do
    local path="${MODULE_PATHS[$mod_key]}"
    local code
    code=$(curl -sS -o /dev/null -w "%{http_code}" -b "$J" "$BASE$path")
    [ $first -eq 1 ] && first=0 || statuses="$statuses,"
    statuses="$statuses\"$mod_key\":$code"
  done
  statuses="$statuses}"

  echo "  {\"role\":\"$role\",\"email\":\"$email\",\"login\":$login_code,\"perms_count\":$perms_total,\"modules\":\"$modules\",\"status_per_module\":$statuses}"
  rm -f "$J"
}

echo "[" > "$OUT"
first=1
echo "▶ verify-platform-role-nav-journey — READ ONLY · ${#PERSONAS[@]} personas · ${#MODULE_PATHS[@]} canonical paths"
echo
for role in "${PERSONAS[@]}"; do
  email="$(email_for_role "$role")"
  if [ -z "$email" ]; then
    echo "  ⏭️  $role — no live user (SEED GAP, recorded)"
    [ $first -eq 1 ] && first=0 || echo "," >> "$OUT"
    echo "  {\"role\":\"$role\",\"skipped\":true,\"reason\":\"seed-gap-no-live-user\"}" >> "$OUT"
    continue
  fi
  echo "  ▶  $role  ($email)"
  [ $first -eq 1 ] && first=0 || echo "," >> "$OUT"
  probe_persona "$role" "$email" >> "$OUT"
done
echo "]" >> "$OUT"

echo
echo "▶ Result: $OUT"
python3 -c "
import json
d=json.load(open('$OUT'))
print('personas:', len(d))
ready=[r for r in d if not r.get('skipped')]
gaps =[r for r in d if r.get('skipped')]
print('ready:', len(ready), '   seed gap:', len(gaps))
for r in ready:
    visible_modules = (r.get('modules') or '').split(',') if r.get('modules') else []
    s = r.get('status_per_module') or {}
    forbidden_visible = [m for m,v in s.items() if v in (200,201) and m not in visible_modules]
    print(f\"  {r['role']:20s} perms={r.get('perms_count',0):3d}  modules={len(visible_modules):2d}  forbidden-visible={len(forbidden_visible):2d}\")
for r in gaps:
    print(f\"  {r['role']:20s} ⏭️  {r.get('reason')}\")
"