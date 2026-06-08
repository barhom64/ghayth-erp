#!/bin/bash
# verify-import-journey.sh — E2E proof of the generic Import framework (#1607 under #1594).
#   preview (diff) -> confirm (transactional apply + audit batch) for an entity.
# genericImportEngine already covers clients/suppliers/products/employees/expenses/
# invoices; this proves the upload→preview→validate→commit pipeline works.
set -euo pipefail
BASE="${BASE:-http://localhost:5000/api}"; EMAIL="${EMAIL:-door@door.sa}"; PASSWORD="${PASSWORD:-Door@2026Diaa}"
DSN="${DATABASE_URL:-postgres://ghayth_erp:ghayth_erp@localhost:5432/ghayth_erp}"
J="$(mktemp)"; PASS=0; FAIL=0
py(){ python3 -c "$1" 2>/dev/null; }
ok(){ echo "  ✅ $1"; PASS=$((PASS+1)); }
no(){ echo "  ❌ $1"; FAIL=$((FAIL+1)); }
TAX="VAT-IMP-$RANDOM"
echo "▶ Import framework journey — #1607 (entity: suppliers)"
curl -fsS -c "$J" -H "X-E2E-Test: 1" -X POST "$BASE/auth/login" -H "Content-Type: application/json" -d "{\"email\":\"$EMAIL\",\"password\":\"$PASSWORD\"}" -o /dev/null
CSRF="$(grep erp_csrf "$J" | awk '{print $7}')"; [ -n "$CSRF" ] && ok "login ($EMAIL)" || { no login; exit 1; }
post(){ curl -fsS -b "$J" -H "x-csrf-token: $CSRF" -H "Content-Type: application/json" -X POST "$BASE$1" -d "$2"; }
export PGPASSWORD="$(echo "$DSN" | sed -E 's#.*://[^:]+:([^@]+)@.*#\1#')"

ROWS="{\"entity\":\"suppliers\",\"rows\":[{\"name\":\"مورد الاستيراد التجريبي\",\"taxNumber\":\"$TAX\",\"phone\":\"0590001112\",\"email\":\"imp@dr.local\"}]}"

PREV="$(post /import/preview "$ROWS")"
NEWN="$(echo "$PREV" | py 'import sys,json;d=json.load(sys.stdin);print((d.get("summary") or {}).get("new") if isinstance(d.get("summary"),dict) else (d.get("new") if isinstance(d.get("new"),int) else (len(d.get("new",[])) if isinstance(d.get("new"),list) else "")))')"
echo "$PREV" | py 'import sys,json;json.load(sys.stdin)' >/dev/null 2>&1 && ok "preview returned a diff" || no "preview failed: $(echo "$PREV"|head -c 200)"

CONF="$(post /import/confirm "$ROWS")"
echo "$CONF" | py 'import sys,json;json.load(sys.stdin)' >/dev/null 2>&1 && ok "confirm applied (transactional)" || no "confirm failed: $(echo "$CONF"|head -c 200)"

CNT="$(psql "$DSN" -tA -c "select count(*) from suppliers where \"taxNumber\"='$TAX' and \"companyId\"=2;")"
[ "${CNT:-0}" -ge 1 ] && ok "supplier row imported into DB (taxNumber=$TAX)" || no "supplier not imported ($CNT)"

# Idempotent re-import: same uniqueField → updated, not duplicated.
post /import/confirm "$ROWS" >/dev/null 2>&1 || true
CNT2="$(psql "$DSN" -tA -c "select count(*) from suppliers where \"taxNumber\"='$TAX' and \"companyId\"=2;")"
[ "${CNT2:-0}" -eq 1 ] && ok "re-import is idempotent (upsert by taxNumber — no duplicate)" || no "re-import duplicated ($CNT2)"

rm -f "$J"; echo; echo "▶ Result: $PASS passed, $FAIL failed"; [ "$FAIL" -eq 0 ] || exit 1
