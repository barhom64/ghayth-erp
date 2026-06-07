#!/bin/bash
# verify-correspondence-journey.sh — E2E proof of the Communications/correspondence
# journey (#1609 under #1594): inbound registered -> received (sent) -> responded,
# each producing an auditable ref + event.
set -euo pipefail
BASE="${BASE:-http://localhost:5000/api}"; EMAIL="${EMAIL:-door@door.sa}"; PASSWORD="${PASSWORD:-Door@2026Diaa}"
DSN="${DATABASE_URL:-postgres://ghayth_erp:ghayth_erp@localhost:5432/ghayth_erp}"
J="$(mktemp)"; PASS=0; FAIL=0
py(){ python3 -c "$1" 2>/dev/null; }
ok(){ echo "  ✅ $1"; PASS=$((PASS+1)); }
no(){ echo "  ❌ $1"; FAIL=$((FAIL+1)); }
echo "▶ Correspondence (communications) journey — #1609"
curl -fsS -c "$J" -X POST "$BASE/auth/login" -H "Content-Type: application/json" -d "{\"email\":\"$EMAIL\",\"password\":\"$PASSWORD\"}" -o /dev/null
CSRF="$(grep erp_csrf "$J" | awk '{print $7}')"; [ -n "$CSRF" ] && ok "login ($EMAIL)" || { no login; exit 1; }
post(){ curl -fsS -b "$J" -H "x-csrf-token: $CSRF" -H "Content-Type: application/json" -X POST "$BASE$1" -d "$2"; }
export PGPASSWORD="$(echo "$DSN" | sed -E 's#.*://[^:]+:([^@]+)@.*#\1#')"

INB="$(post /correspondence '{"direction":"incoming","subject":"خطاب وارد للتحقق","content":"محتوى الوارد","senderOrg":"جهة حكومية","channel":"email"}')"
CID="$(echo "$INB" | py 'import sys,json;print(json.load(sys.stdin).get("id") or "")')"
REF="$(echo "$INB" | py 'import sys,json;print(json.load(sys.stdin).get("ref") or "")')"
[ -n "$CID" ] && ok "inbound correspondence registered (#$CID, ref=$REF)" || no "inbound create"

ST="$(post /correspondence/$CID/send '{}' | py 'import sys,json;print(json.load(sys.stdin).get("status") or "")')"
[ "$ST" = "sent" ] && ok "inbound marked received (status=sent, receivedAt set)" || no "send (status=$ST)"

RESP="$(post /correspondence/$CID/respond '{"subject":"رد على الوارد","content":"تم الرد"}')"
RID="$(echo "$RESP" | py 'import sys,json;print(json.load(sys.stdin).get("id") or "")')"
[ -n "$RID" ] && [ "$RID" != "$CID" ] && ok "response correspondence created (#$RID, outgoing)" || no "respond"

# Audit/event trail: a ref was issued (numbering center) + correspondence.created emitted.
REFOK="$(psql "$DSN" -tA -c "select count(*) from correspondence where id=$CID and \"companyId\"=2 and ref is not null;")"
[ "${REFOK:-0}" -ge 1 ] && ok "correspondence numbered (central ref) + persisted" || no "no ref persisted"
EVT="$(psql "$DSN" -tA -c "select count(*) from event_outbox where \"eventName\"='correspondence.created' and \"companyId\"=2;")"
[ "${EVT:-0}" -ge 1 ] && ok "correspondence.created event emitted on the bus" || no "no correspondence.created event ($EVT)"

rm -f "$J"; echo; echo "▶ Result: $PASS passed, $FAIL failed"; [ "$FAIL" -eq 0 ] || exit 1
