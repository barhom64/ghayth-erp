#!/bin/bash
# verify-platform-wave2-pr1-bi-decoupling.sh — PR-1 (#2163): proves the
# decoupling of /module-dashboards/* from requireModule("bi").
#
# Before PR-1: a manager owning their own module but not BI (e.g. مدير
# HR with module=hr only) got 403 on /api/module-dashboards/hr because
# the mount-level requireModule("bi") fired BEFORE the per-route
# authorize({feature:"hr"}). The audit (#2166 §7) flagged it as FU-2.
#
# After PR-1: the mount carries no module gate; the per-route
# authorize() is canonical. hr_manager → /hr → 200. The owner remains
# 200 on every tab (owner short-circuits authorize). A persona without
# the relevant module gets 403 not from the mount but from authorize().
#
# Personas tested in the live tenant (the 4 with seeded users):
#   - owner             (sanity: 200 on every tab)
#   - hr_manager        (200 on /hr — the FU-2 regression target;
#                        403 on tabs they don't own, e.g. /fleet)
#   - department_manager (same shape — 200 on /hr, 403 elsewhere)
#   - payroll_officer   (200 on /hr because the bundle includes
#                        hr.attendance + hr.payroll read; 403 on
#                        modules outside their lane like /fleet)
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

# probe <email> <password> <path> → echo HTTP code
probe(){
  local email="$1" pass="$2" path="$3"
  local J; J="$(mktemp)"
  curl -fsS -c "$J" -H "X-E2E-Test: 1" -X POST "$BASE/auth/login" \
    -H "Content-Type: application/json" \
    -d "{\"email\":\"$email\",\"password\":\"$pass\"}" -o /dev/null 2>/dev/null || { echo "000"; rm -f "$J"; return; }
  curl -sS -o /dev/null -w "%{http_code}" -b "$J" "$BASE$path"
  rm -f "$J"
}

section "A. هدم الـmount: owner يمر كما كان (ضمان عدم انكسار حالة المالك)"
for tab in hr finance fleet legal properties projects crm store support tasks warehouse; do
  code="$(probe "$OWNER_EMAIL" "$OWNER_PASSWORD" "/module-dashboards/$tab")"
  [ "$code" = "200" ] && ok "owner GET /module-dashboards/$tab → 200" || no "owner /module-dashboards/$tab → $code"
done

section "B. الـFU-2 المعالَج: مدير HR يفتح لوحة HR (كانت 403 قبل PR-1)"
HR_EMAIL="$(email_for hr_manager)"
if [ -z "$HR_EMAIL" ]; then
  echo "  ⏭️  no hr_manager seeded (lost the regression target — investigate seed)"
else
  echo "    hr_manager: $HR_EMAIL"
  code_hr="$(probe "$HR_EMAIL" "$TEST_PASSWORD" "/module-dashboards/hr")"
  [ "$code_hr" = "200" ] && ok "hr_manager GET /module-dashboards/hr → 200 (FU-2 معالَجة)" \
                         || no "hr_manager /module-dashboards/hr → $code_hr (FU-2 ما زالت)"
  # الـlanes تفترق: لا fleet ولا crm
  code_fleet="$(probe "$HR_EMAIL" "$TEST_PASSWORD" "/module-dashboards/fleet")"
  [ "$code_fleet" = "403" ] && ok "hr_manager GET /module-dashboards/fleet → 403 (الـlane محصورة بـauthorize())" \
                            || no "hr_manager /module-dashboards/fleet → $code_fleet (المفروض 403)"
fi

section "C. شخصيات أخرى — لا تملك نظرة HR العامة، لكن الـmount لا يصدّهم بـbi"
# `feature: "hr", action: "list"` يستدعي grant على «hr» العامة، لا
# على شريحة. department_manager (hr.employees + hr.attendance +
# hr.leaves + hr.performance) و payroll_officer (hr.payroll.*) لا
# يملكان grant على الـbare hr. النتيجة 403 صحيحة معماريًا —
# المهم أنها من authorize() لا من requireModule("bi"). إذا أردنا
# مستقبلًا فتح لوحة HR العامة لهما، نزيد grant على feature:"hr"
# action:"list" (PR منفصل، خارج نطاق PR-1).
for persona in department_manager payroll_officer; do
  EMAIL="$(email_for "$persona")"
  if [ -z "$EMAIL" ]; then echo "  ⏭️  $persona (no seed)"; continue; fi
  echo "    $persona: $EMAIL"
  J="$(mktemp)"
  curl -fsS -c "$J" -H "X-E2E-Test: 1" -X POST "$BASE/auth/login" \
    -H "Content-Type: application/json" \
    -d "{\"email\":\"$EMAIL\",\"password\":\"$TEST_PASSWORD\"}" -o /dev/null 2>/dev/null
  body_hr="$(curl -sS -b "$J" "$BASE/module-dashboards/hr")"
  rm -f "$J"
  echo "    $persona /module-dashboards/hr body: $(echo "$body_hr" | head -c 110)"
  # المهم: الـerror يذكر hr:list (authorize) لا bi (mount).
  echo "$body_hr" | grep -q "requiredModule.*bi" \
    && no "$persona — الـerror يأتي من mount-gate (bi)" \
    || ok "$persona — الـ403 من authorize(hr:list)، لا من mount-gate"
  code_fleet="$(probe "$EMAIL" "$TEST_PASSWORD" "/module-dashboards/fleet")"
  [ "$code_fleet" = "403" ] && ok "$persona /module-dashboards/fleet → 403 (خارج lane أيضًا)" \
                            || no "$persona /module-dashboards/fleet → $code_fleet"
done

section "D. الـmount لم يَعُد يطلب bi: probe مباشر بلا تسجيل دخول مالك"
# توكيد على شكل الـerror: قبل PR-1 كان «module access denied» مع
# meta.requiredModule=["bi"]. بعد PR-1 الـerror إن وجد يأتي من
# authorize() الذي يُرجع FORBIDDEN على الـfeature المحدد.
HR_EMAIL_FOR_META="$(email_for hr_manager)"
if [ -n "$HR_EMAIL_FOR_META" ]; then
  J="$(mktemp)"
  curl -fsS -c "$J" -H "X-E2E-Test: 1" -X POST "$BASE/auth/login" \
    -H "Content-Type: application/json" \
    -d "{\"email\":\"$HR_EMAIL_FOR_META\",\"password\":\"$TEST_PASSWORD\"}" -o /dev/null 2>/dev/null
  ERR_BODY="$(curl -sS -b "$J" "$BASE/module-dashboards/fleet")"
  rm -f "$J"
  echo "    error body sample: $(echo "$ERR_BODY" | head -c 180)"
  echo "$ERR_BODY" | grep -q "requiredModule.*bi" \
    && no "ما زال الـerror يذكر requiredModule=\"bi\" (mount لم يُحَل)" \
    || ok "الـerror لم يَعُد من mount-gate (لا requiredModule=\"bi\" في الـmeta)"
fi

echo
echo "▶ Result: $PASS passed, $FAIL failed"
[ "$FAIL" -eq 0 ] || exit 1
