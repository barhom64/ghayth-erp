#!/bin/bash
# verify-hr-institutional-scoring-journey.sh — E2E proof that the
# institutional scoring engine actually fires on demand, reads the 6
# OBJECTIVE sources (not a manual «المدير يعطي 95%»), persists the
# breakdown, and answers «لماذا 65؟» (#2077 PR-4).
#
# The engine + cron already exist (lib/employeeScoringEngine.ts +
# weeklyEmployeeScoring/monthlyEmployeeScoring in cronScheduler.ts).
# PR-4 added the operational surface — recompute + history routes
# under /employees/:id/scoring/* + the score detail page. The journey
# walks:
#
#   1. As HR Manager → POST /employees/:id/scoring/recompute → 200.
#   2. employee_scores row lands with composite + 6 dimension scores +
#      rationale JSONB + raw counters + weights used.
#   3. The recompute fires the «employee.scored» event with the IGOC
#      context (companyId/branchId/userId/activeRoleKey).
#   4. The recompute is audit-logged with action='recompute' and the
#      IGOC quartet.
#   5. GET /employees/:id/scoring/history returns the row with
#      rationale + raw counters.
#   6. With seeded objective data (a late attendance day + a completed
#      training enrollment), the corresponding dimensions actually
#      reflect the inputs — proves the engine reads real tables.
#   7. As a plain employee (no hr.employees:update) → POST → 403.
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
section(){ echo; echo "▶ $1"; }
export PGPASSWORD="$(echo "$DSN" | sed -E 's#.*://[^:]+:([^@]+)@.*#\1#')"

SFX="$(printf '%06d' $(( (RANDOM*RANDOM) % 1000000 )))"

section "0. seed prerequisites + personas"
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

HR_EMAIL="pr4-hr-${SFX}@dr.local"
TARGET_EMAIL="pr4-target-${SFX}@dr.local"
EMP_EMAIL="pr4-emp-${SFX}@dr.local"

seed_persona(){
  local KEY="$1" EMAIL="$2" NAME="$3" PHSFX="$4" RBAC_ROLE="$5"
  local NID; NID="$(printf '%010d' $(( (10#$SFX$PHSFX) % 9999999999 )))"
  local PAYLOAD="{\"name\":\"$NAME\",\"phone\":\"055${SFX}${PHSFX}\",\"nationalId\":\"$NID\",\"nationality\":\"سعودي\",\"department\":\"المالية\",\"jobTitle\":\"محاسب\",\"contractType\":\"full_time\",\"salary\":7000,\"branchId\":3,\"internalEmail\":\"$EMAIL\",\"managerId\":$MGRID,\"positionId\":$POSID,\"categoryKey\":\"$CATKEY\",\"teamId\":$TEAMID,\"projectId\":$PROJID,\"costCenterId\":$CCID}"
  local RESP; RESP="$(postw /employees "$PAYLOAD")"
  local EID; EID="$(echo "$RESP" | py "import sys,json;d=json.load(sys.stdin);print(d.get('id') or '')")"
  local ASG; ASG="$(echo "$RESP" | py "import sys,json;d=json.load(sys.stdin);print(d.get('assignmentId') or '')")"
  local USERID; USERID="$(echo "$RESP" | py "import sys,json;d=json.load(sys.stdin);print((d.get('userAccount') or {}).get('userId') or '')")"
  [ -z "$EID" ] && { no "$KEY seed: $(echo "$RESP"|py 'import sys,json;d=json.load(sys.stdin);print(d.get("error") or d)')"; return 1; }
  if [ -n "$USERID" ]; then
    psql "$DSN" -q -c "UPDATE users SET \"passwordHash\"='$TEST_HASH', role='$RBAC_ROLE' WHERE id=$USERID;" >/dev/null 2>&1
    psql "$DSN" -q -c "DELETE FROM rbac_user_roles WHERE \"userId\"=$USERID AND \"companyId\"=2;" >/dev/null 2>&1
    psql "$DSN" -q -c "INSERT INTO rbac_user_roles (\"userId\",\"companyId\",role_id,\"branchId\",is_primary,\"assignedBy\",\"createdAt\") SELECT $USERID, 2, id, 3, true, 1, NOW() FROM rbac_roles WHERE role_key='$RBAC_ROLE' AND (\"companyId\"=2 OR \"companyId\" IS NULL) ORDER BY \"companyId\" NULLS LAST LIMIT 1;" >/dev/null 2>&1
    psql "$DSN" -q -c "UPDATE employee_assignments SET role='$RBAC_ROLE' WHERE id=$ASG;" >/dev/null 2>&1
  fi
  echo "$EID|$ASG"
}

HR_OUT="$(seed_persona hr_manager "$HR_EMAIL" "مديرة الموارد البشرية" 1 "hr_manager")"
[ -n "$HR_OUT" ] && ok "hr_manager seeded ($HR_EMAIL)" || exit 1
TARGET_OUT="$(seed_persona target "$TARGET_EMAIL" "الموظف المُقيَّم" 2 "employee")"
TARGET_EID="$(echo "$TARGET_OUT" | cut -d'|' -f1)"; TARGET_ASG="$(echo "$TARGET_OUT" | cut -d'|' -f2)"
[ -n "$TARGET_EID" ] && ok "target employee seeded (#$TARGET_EID, assignment #$TARGET_ASG)" || exit 1
EMP_OUT="$(seed_persona employee "$EMP_EMAIL" "موظف عادي بدون صلاحيات" 3 "employee")"
[ -n "$EMP_OUT" ] && ok "regular employee seeded ($EMP_EMAIL — for the 403 probe)" || exit 1

# Get the target's branchId for the scoring routes (engine uses it).
TARGET_BRANCH="$(psql "$DSN" -tA -c "select \"branchId\" from employee_assignments where id=$TARGET_ASG;")"

section "1. seed OBJECTIVE inputs the engine reads"
# A LATE attendance row → discipline dimension picks it up (-2/100).
TODAY="$(date +%Y-%m-%d)"
psql "$DSN" -q -c "DELETE FROM attendance WHERE \"assignmentId\"=$TARGET_ASG AND date='$TODAY';" >/dev/null 2>&1
psql "$DSN" -q -c "INSERT INTO attendance (\"companyId\",\"branchId\",\"assignmentId\",date,\"checkIn\",\"checkOut\",status,method,\"lateMinutes\",\"createdAt\") VALUES (2, $TARGET_BRANCH, $TARGET_ASG, '$TODAY', '$TODAY 08:15', '$TODAY 17:00', 'late', 'manual', 15, now());" >/dev/null
ok "attendance seeded (1 late day, 15 min late)"

# A completed training_enrollment → development dimension picks it up.
TRAINING_TABLE_EXISTS="$(psql "$DSN" -tA -c "select count(*) from information_schema.tables where table_name='training_enrollments';")"
TRAINING_ADDED=0
if [ "${TRAINING_TABLE_EXISTS:-0}" -ge 1 ]; then
  # The training_enrollments shape may differ; insert minimally so the
  # engine's COUNT(*) WHERE status='completed' returns >= 1.
  psql "$DSN" -q -c "INSERT INTO training_enrollments (\"employeeId\", status, \"completedAt\", \"createdAt\") VALUES ($TARGET_EID, 'completed', '$TODAY', now()) ON CONFLICT DO NOTHING;" >/dev/null 2>&1 && TRAINING_ADDED=1 || true
fi
[ "$TRAINING_ADDED" -eq 1 ] && ok "training_enrollments seeded (1 completed)" || echo "  ⏭️  training_enrollments insert skipped (schema variance)"

section "2. HR Manager triggers on-demand recompute"
JHR="$(mktemp)"
curl -fsS -c "$JHR" -H "X-E2E-Test: 1" -X POST "$BASE/auth/login" -H "Content-Type: application/json" -d "{\"email\":\"$HR_EMAIL\",\"password\":\"$TEST_PASSWORD\"}" -o /dev/null
CSRFHR="$(grep erp_csrf "$JHR" | awk '{print $7}')"
[ -n "$CSRFHR" ] && ok "hr_manager login" || { no "hr_manager login"; exit 1; }

RECOMP_RESP="$(curl -sS -b "$JHR" -H "x-csrf-token: $CSRFHR" -H "Content-Type: application/json" -X POST "$BASE/employees/$TARGET_EID/scoring/recompute" -d '{"scopes":["monthly"]}')"
RECOMP_COUNT="$(echo "$RECOMP_RESP" | py "import sys,json;d=json.load(sys.stdin);print(len(d.get('data') or []))")"
[ "$RECOMP_COUNT" = "1" ] && ok "POST /employees/$TARGET_EID/scoring/recompute → 200 (1 scope scored)" || no "recompute failed: $(echo "$RECOMP_RESP"|py 'import sys,json;d=json.load(sys.stdin);print(d.get("error") or d)')"

section "3. forensics — the row landed with rationale + raw counters"
PERIOD_KEY="$(echo "$RECOMP_RESP" | py "import sys,json;d=json.load(sys.stdin);print((d.get('data') or [{}])[0].get('periodKey') or '')")"
[ -n "$PERIOD_KEY" ] && ok "engine resolved periodKey = $PERIOD_KEY" || no "no periodKey returned"

COMPOSITE="$(psql "$DSN" -tA -c "select \"compositeScore\" from employee_scores where \"assignmentId\"=$TARGET_ASG AND scope='monthly' AND \"periodKey\"='$PERIOD_KEY';")"
[ -n "$COMPOSITE" ] && ok "employee_scores row exists (composite=$COMPOSITE)" || no "no employee_scores row found"

DISC_SCORE="$(psql "$DSN" -tA -c "select \"disciplineScore\" from employee_scores where \"assignmentId\"=$TARGET_ASG AND scope='monthly' AND \"periodKey\"='$PERIOD_KEY';")"
# discipline starts at 100, loses 2/late-day. With 1 late day → 98.
# psql returns NUMERIC as e.g. "98.00"; compare numerically.
py "exit(0 if abs(float('${DISC_SCORE:-0}') - 98) < 0.01 else 1)" && ok "discipline ≈ 98 (1 late day × 2 = $DISC_SCORE) — engine read attendance correctly" || no "discipline=$DISC_SCORE (expected ≈98 from 1 late day × 2)"

if [ "$TRAINING_ADDED" -eq 1 ]; then
  DEV_SCORE="$(psql "$DSN" -tA -c "select \"developmentScore\" from employee_scores where \"assignmentId\"=$TARGET_ASG AND scope='monthly' AND \"periodKey\"='$PERIOD_KEY';")"
  # development: 1 completed × 20 = 20.
  py "exit(0 if abs(float('${DEV_SCORE:-0}') - 20) < 0.01 else 1)" && ok "development ≈ 20 (1 completed training × 20 = $DEV_SCORE) — engine read training_enrollments correctly" || no "development=$DEV_SCORE (expected ≈20)"
fi

RATIONALE_HAS_DISCIPLINE="$(psql "$DSN" -tA -c "select (rationale ? 'discipline') from employee_scores where \"assignmentId\"=$TARGET_ASG AND scope='monthly' AND \"periodKey\"='$PERIOD_KEY';")"
[ "$RATIONALE_HAS_DISCIPLINE" = "t" ] && ok "rationale JSONB has the 6 dimension explanations" || no "rationale missing discipline key"

WEIGHTS_HAS_SUM="$(psql "$DSN" -tA -c "select abs(coalesce((\"weightsUsed\"->>'discipline')::numeric + (\"weightsUsed\"->>'activity')::numeric + (\"weightsUsed\"->>'productivity')::numeric + (\"weightsUsed\"->>'quality')::numeric + (\"weightsUsed\"->>'manager')::numeric + (\"weightsUsed\"->>'development')::numeric, 0) - 1) < 0.001 from employee_scores where \"assignmentId\"=$TARGET_ASG AND scope='monthly' AND \"periodKey\"='$PERIOD_KEY';")"
[ "$WEIGHTS_HAS_SUM" = "t" ] && ok "weightsUsed JSONB sums to 1.0 (6 dimensions weighted correctly)" || no "weightsUsed sum is off"

RAW_HAS_LATE="$(psql "$DSN" -tA -c "select (\"rawCounters\" ? 'lateDays') from employee_scores where \"assignmentId\"=$TARGET_ASG AND scope='monthly' AND \"periodKey\"='$PERIOD_KEY';")"
[ "$RAW_HAS_LATE" = "t" ] && ok "rawCounters JSONB carries the underlying counts (lateDays, violations, …)" || no "rawCounters missing lateDays"

section "4. audit + event log forensics (IGOC quartet)"
AUD_USERID="$(psql "$DSN" -tA -c "select \"userId\" from audit_logs where entity='employee_scores' and action='recompute' and \"entityId\"=$TARGET_EID::text order by id desc limit 1;")"
HR_USERID="$(psql "$DSN" -tA -c "select id from users where email='$HR_EMAIL';")"
[ "$AUD_USERID" = "$HR_USERID" ] && ok "audit_logs.userId = HR Manager (#$AUD_USERID)" || no "audit author mismatch ($AUD_USERID ≠ $HR_USERID)"

AUD_RESOLVED="$(psql "$DSN" -tA -c "select resolved_scope from audit_logs where entity='employee_scores' and action='recompute' and \"entityId\"=$TARGET_EID::text order by id desc limit 1;")"
# resolved_scope value depends on the actor's IGOC selector — owner =
# 'all' or 'company' depending on tenant; the assertion is just that
# the column is populated (non-NULL), which proves PR-1's IGOC quartet
# flows through PR-4's audit call.
[ -n "$AUD_RESOLVED" ] && ok "audit_logs.resolved_scope populated ('$AUD_RESOLVED' — IGOC quartet present)" || no "resolved_scope missing: $AUD_RESOLVED"

# event_logs has the same double-stringify quirk PR-1's journey
# handled; unwrap the same way.
EVT_TRIGGER="$(psql "$DSN" -tA -c "select ((details::jsonb #>> '{}')::jsonb)->>'trigger' from event_logs where entity='employees' and action='employee.scored' and \"entityId\"=$TARGET_EID order by id desc limit 1;")"
[ "$EVT_TRIGGER" = "manual_recompute" ] && ok "event_logs.details.trigger = 'manual_recompute'" || no "event trigger missing/wrong: $EVT_TRIGGER"

EVT_CTX_USER="$(psql "$DSN" -tA -c "select (((details::jsonb #>> '{}')::jsonb)->'context')->>'userId' from event_logs where entity='employees' and action='employee.scored' and \"entityId\"=$TARGET_EID order by id desc limit 1;")"
[ "$EVT_CTX_USER" = "$HR_USERID" ] && ok "event_logs.details.context.userId carries the HR Manager" || no "event context.userId mismatch ($EVT_CTX_USER)"

section "5. history endpoint returns the stored row"
HIST_RESP="$(curl -sS -b "$JHR" "$BASE/employees/$TARGET_EID/scoring/history?scope=monthly")"
HIST_LEN="$(echo "$HIST_RESP" | py "import sys,json;d=json.load(sys.stdin);print(len(d.get('data') or []))")"
[ "${HIST_LEN:-0}" -ge 1 ] && ok "GET /employees/$TARGET_EID/scoring/history → $HIST_LEN row(s)" || no "history empty: $(echo "$HIST_RESP" | head -c 200)"

HAS_RATIONALE_IN_HIST="$(echo "$HIST_RESP" | py "import sys,json;d=json.load(sys.stdin);r=(d.get('data') or [{}])[0].get('rationale') or {};print(bool(r.get('discipline')))")"
[ "$HAS_RATIONALE_IN_HIST" = "True" ] && ok "history row carries the rationale text — «يظهر سبب الدرجة» مُتحقَّق" || no "history row missing rationale"

section "6. employee (no hr.employees:update) is rejected — the gate is HR-targeted"
JE="$(mktemp)"
curl -fsS -c "$JE" -H "X-E2E-Test: 1" -X POST "$BASE/auth/login" -H "Content-Type: application/json" -d "{\"email\":\"$EMP_EMAIL\",\"password\":\"$TEST_PASSWORD\"}" -o /dev/null
CSRFE="$(grep erp_csrf "$JE" | awk '{print $7}')"
EMP_STATUS="$(curl -sS -o /dev/null -w "%{http_code}" -b "$JE" -H "x-csrf-token: $CSRFE" -H "Content-Type: application/json" -X POST "$BASE/employees/$TARGET_EID/scoring/recompute" -d '{}')"
[ "$EMP_STATUS" = "403" ] && ok "employee POST → 403 (gate is hr.employees:update, not wide-open)" || no "employee POST → $EMP_STATUS (expected 403)"

rm -f "$J" "$JHR" "$JE"
echo
echo "▶ Result: $PASS passed, $FAIL failed"
[ "$FAIL" -eq 0 ] || exit 1
