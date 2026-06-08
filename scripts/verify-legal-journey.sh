#!/bin/bash
# verify-legal-journey.sh — E2E proof of the Legal journey (#1594 Phase 3.6):
#   case → hearing/session → judgment → cost (accrues to financialRisk) → close,
#   each emitting the canonical legal.* events. Uses the EXISTING legal routes /
#   numbering / event bus — no new engine. Re-runnable (each run opens a fresh
#   auto-numbered case).
# Prereqs: bootstrap + built server.
set -euo pipefail
BASE="${BASE:-http://localhost:5000/api}"; EMAIL="${EMAIL:-door@door.sa}"; PASSWORD="${PASSWORD:-Door@2026Diaa}"
DSN="${DATABASE_URL:-postgres://ghayth_erp:ghayth_erp@localhost:5432/ghayth_erp}"
J="$(mktemp)"; PASS=0; FAIL=0
py(){ python3 -c "$1" 2>/dev/null; }
ok(){ echo "  ✅ $1"; PASS=$((PASS+1)); }
no(){ echo "  ❌ $1"; FAIL=$((FAIL+1)); }
echo "▶ Legal journey — #1594 (قضية→جلسة→حكم→تكلفة→إغلاق)"
curl -fsS -c "$J" -H "X-E2E-Test: 1" -X POST "$BASE/auth/login" -H "Content-Type: application/json" -d "{\"email\":\"$EMAIL\",\"password\":\"$PASSWORD\"}" -o /dev/null
CSRF="$(grep erp_csrf "$J" | awk '{print $7}')"; [ -n "$CSRF" ] && ok "login ($EMAIL)" || { no login; exit 1; }
pw(){ curl -sS -b "$J" -H "x-csrf-token: $CSRF" -H "Content-Type: application/json" -X POST "$BASE$1" -d "$2"; }
gid(){ py "import sys,json;d=json.load(sys.stdin);print(d.get('$1') or '')"; }
export PGPASSWORD="$(echo "$DSN" | sed -E 's#.*://[^:]+:([^@]+)@.*#\1#')"

# 1) Open a case (central numbering issues LGL-YYYY-#####).
CASE="$(pw /legal/cases '{"title":"قضية رحلة التحقق القانونية","caseType":"civil","court":"المحكمة التجارية"}')"
CID="$(echo "$CASE" | gid id)"; CNO="$(echo "$CASE" | gid caseNumber)"; CST="$(echo "$CASE" | gid status)"
{ [ -n "$CID" ] && [ -n "$CNO" ] && [ "$CST" = "open" ]; } && ok "قضية أُنشئت (#$CID، $CNO، open)" || no "case create (id=$CID no=$CNO st=$CST)"

# 2) Schedule a hearing/session.
SID="$(pw /legal/cases/$CID/sessions '{"sessionDate":"2026-07-01","sessionType":"hearing","notes":"الجلسة الأولى"}' | gid id)"
[ -n "$SID" ] && ok "جلسة/مرافعة مجدولة (#$SID)" || no "session create"
SROW="$(psql "$DSN" -tA -c "select count(*) from legal_sessions where \"caseId\"=$CID;")"
[ "${SROW:-0}" -ge 1 ] && ok "الجلسة محفوظة في legal_sessions" || no "session not persisted ($SROW)"

# 3) Record a judgment.
JID="$(pw /legal/cases/$CID/judgments '{"judgmentDate":"2026-08-01","verdict":"حكم لصالح الشركة","amount":50000,"judgmentType":"final"}' | gid id)"
[ -n "$JID" ] && ok "حكم مسجَّل (#$JID)" || no "judgment create"
JAMT="$(psql "$DSN" -tA -c "select amount from legal_judgments where id=${JID:-0};")"
py "exit(0 if float('${JAMT:-0}')>0 else 1)" && ok "قيمة الحكم محفوظة (${JAMT})" || no "judgment amount ($JAMT)"

# 4) Add a cost — accrues to the case financialRisk.
RISK0="$(psql "$DSN" -tA -c "select coalesce(\"financialRisk\",0) from legal_cases where id=$CID;")"
pw /legal/cases/$CID/costs '{"type":"lawyer_fee","amount":5000,"notes":"أتعاب محاماة"}' >/dev/null
RISK1="$(psql "$DSN" -tA -c "select coalesce(\"financialRisk\",0) from legal_cases where id=$CID;")"
py "exit(0 if float('${RISK1:-0}')>float('${RISK0:-0}') else 1)" && ok "التكلفة تراكمت في المخاطر المالية للقضية (${RISK0}→${RISK1})" || no "cost did not accrue ($RISK0→$RISK1)"

# 5) Close the case.
CLST="$(pw /legal/cases/$CID/close '{"closureReason":"settled","outcome":"win"}' | gid status)"
[ "$CLST" = "closed" ] || CLST="$(psql "$DSN" -tA -c "select status from legal_cases where id=$CID;")"
[ "$CLST" = "closed" ] && ok "القضية أُغلقت (closed)" || no "case not closed ($CLST)"

# 6) Canonical events reached the bus/event_logs.
EVS="$(psql "$DSN" -tA -c "select count(distinct action) from event_logs where action in ('legal.case.judgment','legal.case.closed');")"
[ "${EVS:-0}" -ge 2 ] && ok "أحداث legal.case.judgment + legal.case.closed مسجَّلة" || no "legal events missing ($EVS)"

rm -f "$J"; echo; echo "▶ Result: $PASS passed, $FAIL failed"; [ "$FAIL" -eq 0 ] || exit 1
