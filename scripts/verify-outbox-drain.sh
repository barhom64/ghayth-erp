#!/bin/bash
# verify-outbox-drain.sh — proves the phase-2 outbox relay/drain (#1603 under #1594):
# captured events sit 'pending' in event_outbox; the drain marks dispatched rows
# 'processed' (bounded growth + replay-ready), without re-dispatching.
set -euo pipefail
BASE="${BASE:-http://localhost:5000/api}"; EMAIL="${EMAIL:-door@door.sa}"; PASSWORD="${PASSWORD:-Door@2026Diaa}"
DSN="${DATABASE_URL:-postgres://ghayth_erp:ghayth_erp@localhost:5432/ghayth_erp}"
J="$(mktemp)"; PASS=0; FAIL=0
py(){ python3 -c "$1" 2>/dev/null; }
ok(){ echo "  ✅ $1"; PASS=$((PASS+1)); }
no(){ echo "  ❌ $1"; FAIL=$((FAIL+1)); }
echo "▶ Outbox drain (phase-2 relay) — #1603"
curl -fsS -c "$J" -X POST "$BASE/auth/login" -H "Content-Type: application/json" -d "{\"email\":\"$EMAIL\",\"password\":\"$PASSWORD\"}" -o /dev/null
CSRF="$(grep erp_csrf "$J" | awk '{print $7}')"; [ -n "$CSRF" ] && ok "login ($EMAIL)" || { no login; exit 1; }
post(){ curl -fsS -b "$J" -H "x-csrf-token: $CSRF" -H "Content-Type: application/json" -X POST "$BASE$1" -d "$2"; }
export PGPASSWORD="$(echo "$DSN" | sed -E 's#.*://[^:]+:([^@]+)@.*#\1#')"

# Generate operational events (each captured to event_outbox as 'pending').
post /clients '{"name":"عميل اختبار المُرحِّل","classification":"regular"}' >/dev/null
sleep 1
PEND="$(psql "$DSN" -tA -c "select count(*) from event_outbox where status='pending';")"
[ "${PEND:-0}" -ge 1 ] && ok "events captured to outbox (pending=$PEND)" || no "no pending outbox rows ($PEND)"

# Drain on demand (graceSeconds=0 → drain all now).
DR="$(post /events/outbox/drain '{"graceSeconds":0}')"
DRAINED="$(echo "$DR" | py 'import sys,json;print(json.load(sys.stdin).get("drained"))')"
PENDAFTER="$(echo "$DR" | py 'import sys,json;print(json.load(sys.stdin).get("pending"))')"
[ "${DRAINED:-0}" -ge 1 ] && ok "drain marked $DRAINED rows processed (via /events/outbox/drain)" || no "drain returned $DRAINED"
[ "${PENDAFTER:-x}" = "0" ] && ok "outbox.pending is 0 after drain (bounded)" || no "pending after drain = $PENDAFTER"

PROC="$(psql "$DSN" -tA -c "select count(*) from event_outbox where status='processed' and \"processedAt\" is not null;")"
[ "${PROC:-0}" -ge 1 ] && ok "rows marked processed with processedAt (replay-ready)" || no "no processed rows ($PROC)"
STILLPEND="$(psql "$DSN" -tA -c "select count(*) from event_outbox where status='pending';")"
[ "${STILLPEND:-x}" = "0" ] && ok "no pending rows remain" || no "pending remain ($STILLPEND)"

rm -f "$J"; echo; echo "▶ Result: $PASS passed, $FAIL failed"; [ "$FAIL" -eq 0 ] || exit 1
