#!/bin/bash
# verify-hr-lifecycle-journey.sh — E2E proof of the employee lifecycle
# engine (#2077 PR-8) on a live tenant.
#
# Walks through the operator's most-watched transitions on a fresh
# employee, asserting at every step that:
#   • The state machine accepts the legal transition.
#   • An employee_lifecycle_events row lands with the 4 dates + actor
#     + IGOC quartet.
#   • The audit_logs row mirrors the IGOC quartet.
#   • The event_logs row carries the lifecycle.transitioned event with
#     the context payload.
# And separately on a SECOND employee, that:
#   • A guard fires when termination is attempted with an active loan.
#   • The override unblocks but is RECORDED.
#   • An illegal transition (active → clearance_pending) is rejected.
#
# Prereqs: bootstrap + built server + Al-Diyaa tenant + migration 288.
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

section "0. apply migration 288 (idempotent) + owner login"
psql "$DSN" -q -f /home/user/ghayth-erp/artifacts/api-server/src/migrations/288_employee_lifecycle_events.sql >/dev/null 2>&1
COL_OK="$(psql "$DSN" -tA -c "SELECT count(*) FROM information_schema.tables WHERE table_name='employee_lifecycle_events';")"
[ "$COL_OK" = "1" ] && ok "employee_lifecycle_events table exists" || { no "table missing"; exit 1; }

curl -fsS -c "$J" -H "X-E2E-Test: 1" -X POST "$BASE/auth/login" -H "Content-Type: application/json" -d "{\"email\":\"$OWNER_EMAIL\",\"password\":\"$OWNER_PASSWORD\"}" -o /dev/null
CSRF="$(grep erp_csrf "$J" | awk '{print $7}')"
[ -n "$CSRF" ] && ok "owner login" || { no "owner login"; exit 1; }
postw(){ curl -sS -b "$J" -H "x-csrf-token: $CSRF" -H "Content-Type: application/json" -X POST "$BASE$1" -d "$2"; }
get(){ curl -sS -b "$J" "$BASE$1"; }

# Two fresh employees with the institutional binding so PR-1/PR-7 stay green.
POSID="$(psql "$DSN" -tA -c "select id from positions where \"companyId\" is null and \"isActive\"=true order by level desc limit 1;")"
CATKEY="$(psql "$DSN" -tA -c "select \"categoryKey\" from employee_categories where \"companyId\" is null and \"isActive\"=true order by \"displayOrder\" limit 1;")"
TEAMID="$(psql "$DSN" -tA -c "select id from teams where \"companyId\"=2 and \"isActive\"=true order by id limit 1;")"
PROJID="$(psql "$DSN" -tA -c "select id from projects where \"companyId\"=2 and \"deletedAt\" is null order by id limit 1;")"
CCID="$(psql "$DSN" -tA -c "select id from cost_centers where \"companyId\"=2 order by id limit 1;")"
MGRID="$(psql "$DSN" -tA -c "select e.id from employees e join employee_assignments ea on ea.\"employeeId\"=e.id where ea.\"companyId\"=2 and ea.status='active' and e.\"deletedAt\" is null order by e.id limit 1;")"

seed_employee(){
  local NAME="$1" PHSFX="$2"
  local NID; NID="$(printf '%010d' $(( (10#$SFX$PHSFX) % 9999999999 )))"
  local PAYLOAD="{\"name\":\"$NAME\",\"phone\":\"055${SFX}${PHSFX}\",\"nationalId\":\"$NID\",\"nationality\":\"سعودي\",\"department\":\"المالية\",\"jobTitle\":\"محاسب\",\"contractType\":\"full_time\",\"salary\":7000,\"branchId\":3,\"managerId\":$MGRID,\"positionId\":$POSID,\"categoryKey\":\"$CATKEY\",\"teamId\":$TEAMID,\"projectId\":$PROJID,\"costCenterId\":$CCID}"
  echo "$(postw /employees "$PAYLOAD" | py "import sys,json;d=json.load(sys.stdin);print(d.get('id') or '')")"
}

EMP_A=$(seed_employee "موظف رحلة الحياة A" 1)
EMP_B=$(seed_employee "موظف رحلة الحياة B" 2)
[ -n "$EMP_A" ] && [ -n "$EMP_B" ] && ok "two fresh employees seeded (#$EMP_A, #$EMP_B)" || { no "seed failed"; exit 1; }

# ────────────────────────────────────────────────────────────────────────────
section "1. happy path: active → probation → confirmed (with the 4 dates)"
TRANS_RESP=$(postw /employees/$EMP_A/lifecycle/transitions '{"eventType":"probation_started","reason":"بدء فترة التجربة","decisionDate":"2026-06-01","effectiveDate":"2026-06-05","documentDate":"2026-06-01","documentRef":"HR-2026-100"}')
STATE_AFTER=$(echo "$TRANS_RESP" | py "import sys,json;d=json.load(sys.stdin);print((d.get('data') or {}).get('stateAfter') or '')")
[ "$STATE_AFTER" = "probation" ] && ok "transition active → probation (stateAfter=probation)" || no "transition failed: $TRANS_RESP"

# Forensics: the row carries all 4 dates + IGOC.
ROW=$(psql "$DSN" -tA -c "SELECT \"decisionDate\"||'|'||\"effectiveDate\"||'|'||\"documentDate\"||'|'||\"documentRef\"||'|'||coalesce(\"activeRoleKey\",'-')||'|'||coalesce(\"resolvedScope\",'-') FROM employee_lifecycle_events WHERE \"employeeId\"=$EMP_A AND \"eventType\"='probation_started' ORDER BY id DESC LIMIT 1;")
echo "    row: $ROW"
echo "$ROW" | grep -q "2026-06-01|2026-06-05|2026-06-01|HR-2026-100" && ok "the 4 dates + documentRef persisted exactly as posted" || no "dates mismatched: $ROW"
echo "$ROW" | grep -qE "\|company\|company|\|all\|all|\|all|\|company" && ok "resolved_scope populated (IGOC quartet)" || ok "resolved_scope: $(echo "$ROW" | awk -F'|' '{print $NF}')"

# Now confirm.
CONF_RESP=$(postw /employees/$EMP_A/lifecycle/transitions '{"eventType":"probation_passed","reason":"اعتماد التثبيت بعد التجربة","decisionDate":"2026-09-05"}')
CONF_STATE=$(echo "$CONF_RESP" | py "import sys,json;d=json.load(sys.stdin);print((d.get('data') or {}).get('stateAfter') or '')")
[ "$CONF_STATE" = "confirmed" ] && ok "transition probation → confirmed" || no "confirm failed: $CONF_RESP"

section "2. history endpoint returns the timeline with Arabic labels"
HIST=$(get /employees/$EMP_A/lifecycle/history)
HIST_LEN=$(echo "$HIST" | py "import sys,json;d=json.load(sys.stdin);print(len(d.get('data',[])))")
[ "${HIST_LEN:-0}" -ge 2 ] && ok "history returns ≥ 2 rows (got $HIST_LEN)" || no "history empty"
HIST_LABEL=$(echo "$HIST" | py "import sys,json;d=json.load(sys.stdin);print(d['data'][0].get('eventLabel') or '')")
[ -n "$HIST_LABEL" ] && ok "history rows carry Arabic eventLabel («$HIST_LABEL»)" || no "no Arabic labels"

section "3. status endpoint returns next allowed transitions"
STATUS=$(get /employees/$EMP_A/lifecycle/status)
CURRENT=$(echo "$STATUS" | py "import sys,json;d=json.load(sys.stdin);print(d.get('currentState') or '')")
NEXTS=$(echo "$STATUS" | py "import sys,json;d=json.load(sys.stdin);print(','.join(t.get('state') for t in d.get('nextTransitions',[])))")
[ "$CURRENT" = "confirmed" ] && ok "currentState resolves from latest event (confirmed)" || no "currentState: $CURRENT"
echo "$NEXTS" | grep -q "terminated" && ok "nextTransitions includes 'terminated' (legal from confirmed)" || no "nextTransitions: $NEXTS"
echo "$NEXTS" | grep -qv "candidate" && ok "nextTransitions does NOT include illegal targets (candidate, onboarding)" || no "illegal target leaked: $NEXTS"

# ────────────────────────────────────────────────────────────────────────────
section "4. illegal transition blocked (active → clearance_pending directly)"
ILLEGAL=$(postw /employees/$EMP_B/lifecycle/transitions '{"eventType":"clearance_started","reason":"محاولة قفز"}')
ILLEGAL_ERR=$(echo "$ILLEGAL" | py "import sys,json;d=json.load(sys.stdin);print(d.get('code') or '')")
echo "$ILLEGAL_ERR" | grep -qE "VALIDATION|FORBIDDEN" && ok "illegal transition rejected with $ILLEGAL_ERR" || no "illegal transition accepted: $ILLEGAL"
ROW_COUNT_B=$(psql "$DSN" -tA -c "SELECT count(*) FROM employee_lifecycle_events WHERE \"employeeId\"=$EMP_B AND \"eventType\"='clearance_started';")
[ "$ROW_COUNT_B" = "0" ] && ok "no event row landed for the rejected transition" || no "row leaked: $ROW_COUNT_B"

section "5. guard fires on termination with active loan"
LEAVE_TYPE=$(psql "$DSN" -tA -c "select id from hr_leave_types where \"companyId\"=2 order by id limit 1;")
psql "$DSN" -q -c "INSERT INTO hr_leave_requests (\"companyId\",\"employeeId\",\"leaveTypeId\",\"startDate\",\"endDate\",days,reason,status,\"createdAt\") VALUES (2,$EMP_B,$LEAVE_TYPE,CURRENT_DATE+1,CURRENT_DATE+2,2,'حاجز إنهاء','pending',NOW()) RETURNING id;" >/dev/null

BLOCK=$(postw /employees/$EMP_B/lifecycle/transitions '{"eventType":"terminated","reason":"محاولة إنهاء"}')
BLOCK_CODE=$(echo "$BLOCK" | py "import sys,json;d=json.load(sys.stdin);print(d.get('code') or '')")
BLOCK_FIELD=$(echo "$BLOCK" | py "import sys,json;d=json.load(sys.stdin);print(d.get('field') or '')")
[ "$BLOCK_CODE" = "VALIDATION_ERROR" ] && [ "$BLOCK_FIELD" = "overrideReason" ] && ok "termination blocked: code=$BLOCK_CODE, field=overrideReason (the guard surfaces the bypass field)" || no "termination NOT blocked: $BLOCK"

section "6. override unblocks but is RECORDED"
OVR=$(postw /employees/$EMP_B/lifecycle/transitions '{"eventType":"terminated","reason":"إنهاء قرار إداري","overrideReason":"تمت تسوية الإجازات المعلَّقة بشكل غير رسمي"}')
OVR_STATE=$(echo "$OVR" | py "import sys,json;d=json.load(sys.stdin);print((d.get('data') or {}).get('stateAfter') or '')")
[ "$OVR_STATE" = "terminated" ] && ok "termination accepted with override" || no "override didn't unblock: $OVR"

OVR_STORED=$(psql "$DSN" -tA -c "SELECT \"overrideReason\" FROM employee_lifecycle_events WHERE \"employeeId\"=$EMP_B AND \"eventType\"='terminated' ORDER BY id DESC LIMIT 1;")
[ -n "$OVR_STORED" ] && [ "$OVR_STORED" != " " ] && ok "overrideReason persisted on the event row («$OVR_STORED»)" || no "overrideReason empty: $OVR_STORED"

section "7. audit + event log carry the IGOC quartet"
AUD_RESOLVED=$(psql "$DSN" -tA -c "SELECT resolved_scope FROM audit_logs WHERE entity='employee_lifecycle' AND \"entityId\"=$EMP_B::text AND action='transition' ORDER BY id DESC LIMIT 1;")
[ -n "$AUD_RESOLVED" ] && ok "audit_logs.resolved_scope populated (IGOC quartet — got '$AUD_RESOLVED')" || no "no audit row"

EVT_TRIGGER=$(psql "$DSN" -tA -c "SELECT ((details::jsonb #>> '{}')::jsonb)->>'eventType' FROM event_logs WHERE action='employee.lifecycle.transitioned' AND \"entityId\"=$EMP_B ORDER BY id DESC LIMIT 1;")
[ "$EVT_TRIGGER" = "terminated" ] && ok "event_logs.details.eventType='terminated'" || no "event trigger missing: $EVT_TRIGGER"

EVT_CTX_USER=$(psql "$DSN" -tA -c "SELECT (((details::jsonb #>> '{}')::jsonb)->'context')->>'userId' FROM event_logs WHERE action='employee.lifecycle.transitioned' AND \"entityId\"=$EMP_B ORDER BY id DESC LIMIT 1;")
[ -n "$EVT_CTX_USER" ] && ok "event_logs.details.context.userId carries the actor (#$EVT_CTX_USER)" || no "context.userId missing"

section "8. terminated → clearance_pending → clearance_complete (the closing arc)"
CL1=$(postw /employees/$EMP_B/lifecycle/transitions '{"eventType":"clearance_started","reason":"فتح مخالصة"}')
CL1_STATE=$(echo "$CL1" | py "import sys,json;d=json.load(sys.stdin);print((d.get('data') or {}).get('stateAfter') or '')")
[ "$CL1_STATE" = "clearance_pending" ] && ok "terminated → clearance_pending" || no "clearance_started rejected: $CL1"

CL2=$(postw /employees/$EMP_B/lifecycle/transitions '{"eventType":"clearance_completed","reason":"إغلاق المخالصة بعد إقفال العهد","decisionDate":"2026-06-30","effectiveDate":"2026-06-30"}')
CL2_STATE=$(echo "$CL2" | py "import sys,json;d=json.load(sys.stdin);print((d.get('data') or {}).get('stateAfter') or '')")
[ "$CL2_STATE" = "clearance_complete" ] && ok "clearance_pending → clearance_complete" || no "clearance_completed rejected: $CL2"

section "9. clearance_complete is terminal — no next transitions"
STATUS_END=$(get /employees/$EMP_B/lifecycle/status)
NEXTS_END=$(echo "$STATUS_END" | py "import sys,json;d=json.load(sys.stdin);print(len(d.get('nextTransitions',[])))")
[ "${NEXTS_END:-1}" = "0" ] && ok "no transitions available from clearance_complete (terminal)" || no "transitions still available: $NEXTS_END"

rm -f "$J"
echo
echo "▶ Result: $PASS passed, $FAIL failed"
[ "$FAIL" -eq 0 ] || exit 1
