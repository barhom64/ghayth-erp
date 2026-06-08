#!/bin/bash
# verify-sod-enforcement.sh — proves request-time Separation-of-Duties enforcement
# (#1605 under #1594): granting a role that conflicts with a role the user already
# holds is BLOCKED at POST /admin/user-roles (was audit-only before).
# owner ⊥ bi_manager is an SoD pair; the company owner already holds 'owner'.
set -euo pipefail
BASE="${BASE:-http://localhost:5000/api}"; EMAIL="${EMAIL:-door@door.sa}"; PASSWORD="${PASSWORD:-Door@2026Diaa}"
DSN="${DATABASE_URL:-postgres://ghayth_erp:ghayth_erp@localhost:5432/ghayth_erp}"
J="$(mktemp)"; PASS=0; FAIL=0
py(){ python3 -c "$1" 2>/dev/null; }
ok(){ echo "  ✅ $1"; PASS=$((PASS+1)); }
no(){ echo "  ❌ $1"; FAIL=$((FAIL+1)); }
echo "▶ Separation-of-Duties enforcement — #1605"
curl -fsS -c "$J" -H "X-E2E-Test: 1" -X POST "$BASE/auth/login" -H "Content-Type: application/json" -d "{\"email\":\"$EMAIL\",\"password\":\"$PASSWORD\"}" -o /dev/null
CSRF="$(grep erp_csrf "$J" | awk '{print $7}')"; [ -n "$CSRF" ] && ok "login ($EMAIL)" || { no login; exit 1; }
postw(){ curl -sS -b "$J" -H "x-csrf-token: $CSRF" -H "Content-Type: application/json" -X POST "$BASE$1" -d "$2"; }
export PGPASSWORD="$(echo "$DSN" | sed -E 's#.*://[^:]+:([^@]+)@.*#\1#')"

UID2="$(psql "$DSN" -tA -c "select id from users where email='$EMAIL' limit 1;")"
[ -n "$UID2" ] && ok "owner userId resolved (#$UID2, holds role 'owner')" || no "no owner user"

# Conflicting grant (owner already held → adding bi_manager violates SoD) → must be blocked.
RESP="$(postw /admin/user-roles "{\"userId\":$UID2,\"roleKey\":\"bi_manager\"}")"
CODE="$(echo "$RESP" | py 'import sys,json;d=json.load(sys.stdin);print(d.get("code") or "")')"
ERR="$(echo "$RESP" | py 'import sys,json;d=json.load(sys.stdin);print(d.get("error") or "")')"
echo "$ERR" | grep -q "فصل المهام" && ok "conflicting role (owner+bi_manager) BLOCKED with Arabic SoD message" || no "SoD not enforced (code=$CODE err=$ERR)"
GRANTED="$(psql "$DSN" -tA -c "select count(*) from user_roles where \"userId\"=$UID2 and \"roleKey\"='bi_manager';")"
[ "${GRANTED:-x}" = "0" ] && ok "bi_manager NOT written (block held at the source)" || no "bi_manager was written despite SoD ($GRANTED)"

# Non-conflicting grant (owner has no SoD pair with hr_manager) → allowed.
RESP2="$(postw /admin/user-roles "{\"userId\":$UID2,\"roleKey\":\"hr_manager\"}")"
OKCODE="$(echo "$RESP2" | py 'import sys,json;d=json.load(sys.stdin);print(d.get("code") or d.get("roleKey") or "ok")')"
GRANTED2="$(psql "$DSN" -tA -c "select count(*) from user_roles where \"userId\"=$UID2 and \"roleKey\"='hr_manager';")"
[ "${GRANTED2:-0}" -ge 1 ] && ok "non-conflicting role (hr_manager) granted normally" || no "non-conflicting grant failed ($OKCODE / $GRANTED2)"

# Symmetric coverage: the same block must fire at the RBAC-v2 grant endpoint.
# Owner still holds 'owner'; attempting to grant the v2 'bi_manager' role must
# be refused with the same Arabic SoD message and must not write a row to
# rbac_user_roles. Skip cleanly if the v2 catalogue isn't seeded for the tenant.
CID2="$(psql "$DSN" -tA -c "select ea.\"companyId\" from employee_assignments ea join users u on u.\"employeeId\"=ea.\"employeeId\" where u.id=$UID2 and ea.status='active' limit 1;")"
RBAC_BI_ID="$(psql "$DSN" -tA -c "select id from rbac_roles where role_key='bi_manager' and (\"companyId\"=$CID2 or is_template) limit 1;")"
if [ -n "$RBAC_BI_ID" ]; then
  RESP3="$(postw /rbac/v2/users/$UID2/roles "{\"roleId\":$RBAC_BI_ID}")"
  ERR3="$(echo "$RESP3" | py 'import sys,json;d=json.load(sys.stdin);print(d.get("error") or "")')"
  echo "$ERR3" | grep -q "فصل المهام" && ok "v2: conflicting role (owner+bi_manager) BLOCKED with Arabic SoD message" || no "v2 SoD not enforced (err=$ERR3)"
  GRANTED3="$(psql "$DSN" -tA -c "select count(*) from rbac_user_roles where \"userId\"=$UID2 and role_id=$RBAC_BI_ID;")"
  [ "${GRANTED3:-x}" = "0" ] && ok "v2: rbac_user_roles row NOT written (block held at the source)" || no "v2: row was written despite SoD ($GRANTED3)"
else
  echo "  ⏭  rbac_roles.bi_manager not seeded for company $CID2 — v2 leg skipped"
fi

rm -f "$J"; echo; echo "▶ Result: $PASS passed, $FAIL failed"; [ "$FAIL" -eq 0 ] || exit 1
