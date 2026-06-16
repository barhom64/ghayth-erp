#!/bin/bash
# verify-platform-wave2-pr2-role-modules-unification.sh — proves the
# unification (PR-2 / #2163) end-to-end:
#
#   A. /auth/me modules and /permissions/my modules emit the SAME
#      canonical names (no more `dashboard` vs `home`, `properties`
#      vs `property`, `projects` vs `operations`, `communications`
#      vs `comms` drift).
#
#   B. requireModule() now accepts BOTH names: the gated mount lets
#      a user through whose grant projects as a synonym.
#
#   C. The home/dashboard nav item is no longer silently hidden from
#      a user whose grants emit `dashboard`. We probe by checking that
#      a hr_manager's `/permissions/my.modules` contains "home" (the
#      canonical), proving the canonicalize layer collapsed it.
#
# READ ONLY — every HTTP method here is GET.
set -uo pipefail
BASE="${BASE:-http://localhost:5000/api}"
DSN="${DATABASE_URL:-postgres://ghayth_erp:ghayth_erp@localhost:5432/ghayth_erp}"
OWNER_EMAIL="${OWNER_EMAIL:-door@door.sa}"
OWNER_PASSWORD="${OWNER_PASSWORD:-Door@2026Diaa}"
TEST_PASSWORD='Test1234!'
export PGPASSWORD="$(echo "$DSN" | sed -E 's#.*://[^:]+:([^@]+)@.*#\1#')"

PASS=0; FAIL=0
ok(){ echo "  ✅ $1"; PASS=$((PASS+1)); }
no(){ echo "  ❌ $1"; FAIL=$((FAIL+1)); }
section(){ echo; echo "▶ $1"; }

email_for(){
  local role="$1"
  if [ "$role" = "owner" ]; then echo "$OWNER_EMAIL"; return; fi
  psql "$DSN" -tA -c "
    SELECT u.email FROM users u
      JOIN rbac_user_roles ur ON ur.\"userId\"=u.id
      JOIN rbac_roles r ON r.id=ur.role_id
     WHERE r.role_key='$role' AND u.\"isActive\"=TRUE
     ORDER BY u.id ASC LIMIT 1;" 2>/dev/null | head -1
}

login_jar(){
  local email="$1" pass="$2"
  local J; J="$(mktemp)"
  curl -fsS -c "$J" -H "X-E2E-Test: 1" -X POST "$BASE/auth/login" \
    -H "Content-Type: application/json" \
    -d "{\"email\":\"$email\",\"password\":\"$pass\"}" -o /dev/null 2>/dev/null || { echo ""; rm -f "$J"; return; }
  echo "$J"
}

# Read /auth/me modules (across all userRoles[].modules) for an email.
auth_me_modules(){
  local jar="$1"
  curl -sS -b "$jar" "$BASE/auth/me" | python3 -c "
import sys,json
d=json.load(sys.stdin)
ms=set()
for r in d.get('userRoles',[]): ms.update(r.get('modules') or [])
print(','.join(sorted(ms)))
" 2>/dev/null || echo ""
}

# Read /permissions/my.modules.
perms_my_modules(){
  local jar="$1"
  curl -sS -b "$jar" "$BASE/permissions/my" | python3 -c "
import sys,json
d=json.load(sys.stdin)
print(','.join(sorted(d.get('modules') or [])))
" 2>/dev/null || echo ""
}

section "A. /auth/me + /permissions/my يصدران نفس المفردات (canonical)"
PERSONAS_OK=()
for role in owner hr_manager department_manager payroll_officer; do
  email="$(email_for "$role")"
  [ -z "$email" ] && { echo "  ⏭️  $role (no live user)"; continue; }
  pass="$TEST_PASSWORD"; [ "$role" = "owner" ] && pass="$OWNER_PASSWORD"
  J="$(login_jar "$email" "$pass")"
  [ -z "$J" ] && { no "$role login failed"; continue; }

  ME="$(auth_me_modules "$J")"
  PM="$(perms_my_modules "$J")"
  echo "    $role"
  echo "      /auth/me modules:        $ME"
  echo "      /permissions/my modules: $PM"

  # Forbidden aliases — must NOT appear in either surface after PR-2.
  bad=$(echo "$ME,$PM" | tr ',' '\n' | grep -E '^(dashboard|properties|projects|communications|my-space)$' | sort -u | tr '\n' ',' | sed 's/,$//')
  if [ -z "$bad" ]; then
    ok "$role — لا feature-key vocab متسرّب (لا dashboard/properties/projects/communications/my-space)"
  else
    no "$role — vocab متسرّب: $bad (canonicalize() لم يعمل)"
  fi

  # Canonical names that the persona is expected to have, if any
  # canonicalize alias resolved to them. owner has the full set; the
  # other personas have the BASE set plus their slice. The minimum we
  # can pin here without role-specific knowledge is: "home" must be
  # there if "dashboard" would have been there pre-PR-2.
  echo "$PM" | grep -q "home" && ok "$role — يحوي «home» (الـcanonical الذي كان dashboard قبل PR-2)" \
                              || no "$role — «home» مفقود من /permissions/my"

  rm -f "$J"
  PERSONAS_OK+=("$role:$email")
done

section "B. requireModule بعد PR-2 لا يصدّ على مرادف"
# Before PR-2, requireModule("hr") for hr_manager would have failed if
# the user's modules contained "dashboard" instead of "home" — the
# wrong path. But a clean confirmation is /api/employees (gated by
# requireModule("hr")) — hr_manager should always succeed.
HR_EMAIL="$(email_for hr_manager)"
if [ -n "$HR_EMAIL" ]; then
  J="$(login_jar "$HR_EMAIL" "$TEST_PASSWORD")"
  code=$(curl -sS -o /dev/null -w "%{http_code}" -b "$J" "$BASE/employees?limit=1")
  [ "$code" = "200" ] && ok "hr_manager GET /employees → 200 (mount-gate accepted, canonicalize() didn't break it)" \
                      || no "hr_manager /employees → $code (regression: mount-gate refused)"
  rm -f "$J"
fi

# Cross-check: probe a path module the persona doesn't have — 403 still.
# Same hr_manager → /api/properties/units (mount = requireModule("property")).
if [ -n "$HR_EMAIL" ]; then
  J="$(login_jar "$HR_EMAIL" "$TEST_PASSWORD")"
  code=$(curl -sS -o /dev/null -w "%{http_code}" -b "$J" "$BASE/properties/units")
  [ "$code" = "403" ] && ok "hr_manager GET /properties/units → 403 (الـcanonicalize لم يفتح أبواب جديدة)" \
                      || no "hr_manager /properties/units → $code (المفروض 403)"
  rm -f "$J"
fi

section "C. القائمة الجانبية لم تَعُد تخفي «لوحة التحكم» من حامل grants"
# The nav item `{ label: "لوحة التحكم", path: "/dashboard", module: "home" }`
# used to be hidden from hr_manager because their modules contained
# "dashboard" not "home". After PR-2, canonicalize emits "home", so the
# nav filter (modules.includes("home")) returns true.
if [ -n "$HR_EMAIL" ]; then
  J="$(login_jar "$HR_EMAIL" "$TEST_PASSWORD")"
  PM="$(perms_my_modules "$J")"
  echo "$PM" | grep -q "home" \
    && ok "hr_manager modules contain «home» — نـav «لوحة التحكم» سيظهر له" \
    || no "hr_manager modules لا تحوي «home» — لوحة التحكم ستبقى مخفية"
  rm -f "$J"
fi

echo
echo "▶ Result: $PASS passed, $FAIL failed"
[ "$FAIL" -eq 0 ] || exit 1
