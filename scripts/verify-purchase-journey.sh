#!/bin/bash
# verify-purchase-journey.sh — E2E proof of the purchasing journey
# (#1594 Phase 3.2 Finance): purchase request → approve → convert to PO →
# approve PO → receive goods (GRN) → balanced GL. Guards three real bugs found
# in the write-path review and fixed:
#   1. PO inserted with status 'pending' (rejected by chk_purchase_orders_status
#      + not a valid lifecycle from-state) → corrected to 'pending_approval'.
#   2. purchase_orders (and 4 sibling lifecycle tables) missing "updatedAt", so
#      every PO transition crashed (migration 279).
#   3. GRNI clearing account unresolved (fallback 2115 absent) → seeded a
#      controllable purchase_grni mapping → postable 2111 (migration 280).
# Uses the EXISTING finance-purchase routes + lifecycleEngine — no new engine.
# Re-runnable (PR/PO carry fresh central numbers each run).
# Prereqs: bootstrap + built server (الضياء tenant).
set -euo pipefail
BASE="${BASE:-http://localhost:5000/api}"; EMAIL="${EMAIL:-door@door.sa}"; PASSWORD="${PASSWORD:-Door@2026Diaa}"
DSN="${DATABASE_URL:-postgres://ghayth_erp:ghayth_erp@localhost:5432/ghayth_erp}"
J="$(mktemp)"; PASS=0; FAIL=0
py(){ python3 -c "$1" 2>/dev/null; }
ok(){ echo "  ✅ $1"; PASS=$((PASS+1)); }
no(){ echo "  ❌ $1"; FAIL=$((FAIL+1)); }
echo "▶ Purchase journey — #1594 (طلب→اعتماد→أمر شراء→اعتماد→استلام→قيد متوازن)"
curl -fsS -c "$J" -H "X-E2E-Test: 1" -X POST "$BASE/auth/login" -H "Content-Type: application/json" -d "{\"email\":\"$EMAIL\",\"password\":\"$PASSWORD\"}" -o /dev/null
CSRF="$(grep erp_csrf "$J" | awk '{print $7}')"; [ -n "$CSRF" ] && ok "login ($EMAIL)" || { no login; exit 1; }
pw(){ curl -sS -b "$J" -H "x-csrf-token: $CSRF" -H "Content-Type: application/json" -X POST "$BASE$1" -d "$2"; }
ptch(){ curl -sS -b "$J" -H "x-csrf-token: $CSRF" -H "Content-Type: application/json" -X PATCH "$BASE$1" -d "$2"; }
gid(){ py "import sys,json;d=json.load(sys.stdin);print(d.get('$1') or '')"; }
export PGPASSWORD="$(echo "$DSN" | sed -E 's#.*://[^:]+:([^@]+)@.*#\1#')"

SUP="$(psql "$DSN" -tA -c "select id from suppliers where \"companyId\"=2 and \"deletedAt\" is null order by id limit 1;")"
[ -n "$SUP" ] && ok "مورد موجود (#$SUP)" || { no "no supplier"; exit 1; }

# 1) Purchase request.
PR="$(pw /finance/purchase-requests "{\"supplierId\":$SUP,\"items\":[{\"description\":\"حبر طابعة\",\"quantity\":4,\"unitPrice\":120}]}")"
PRID="$(echo "$PR" | gid id)"
[ -n "$PRID" ] && ok "طلب شراء أُنشئ (#$PRID)" || no "PR create: $(echo "$PR"|gid error)"

# 2) Approve the request.
PRA="$(ptch /finance/purchase-requests/$PRID/approve '{"approved":true}' | gid status)"
[ "$PRA" = "approved" ] && ok "اعتماد الطلب (approved)" || no "PR approve ($PRA)"

# 3) Convert to a PO — the PO must land in 'pending_approval' (bug #1 guard).
CV="$(pw /finance/purchase-requests/$PRID/convert '{}')"
POID="$(echo "$CV" | py "import sys,json;d=json.load(sys.stdin);print(d.get('poId') or d.get('id') or (d.get('purchaseOrder') or {}).get('id') or '')")"
POST="$(psql "$DSN" -tA -c "select status from purchase_orders where id=${POID:-0};")"
{ [ -n "$POID" ] && [ "$POST" = "pending_approval" ]; } && ok "تحويل إلى أمر شراء (#$POID، pending_approval)" || no "convert→PO (id=$POID st=$POST err=$(echo "$CV"|gid error))"

# 4) Approve the PO — exercises the lifecycle UPDATE that needs updatedAt (bug #2 guard).
POA="$(ptch /finance/purchase-orders/$POID/approve '{}' | gid status)"
HASUPD="$(psql "$DSN" -tA -c "select (\"updatedAt\" is not null)::text from purchase_orders where id=${POID:-0};")"
{ [ "$POA" = "approved" ] && [ "$HASUPD" = "true" ]; } && ok "اعتماد أمر الشراء (approved، updatedAt مكتوب)" || no "PO approve ($POA, updatedAt=$HASUPD)"

# 5) Receive goods (GRN) — posts the GL (bug #3 guard: GRNI account resolves).
RC="$(ptch /finance/purchase-orders/$POID/receive '{"items":[{"received":4}]}')"
RST="$(echo "$RC" | gid status)"
{ [ "$RST" = "received" ] || [ "$RST" = "partially_received" ]; } && ok "استلام البضاعة (GRN، $RST)" || no "receive ($RST / $(echo "$RC"|gid error))"

# 6) The GRN journal is balanced.
GBAL="$(psql "$DSN" -tA -c "select (sum(jl.debit)=sum(jl.credit) and sum(jl.debit)>0)::text from journal_lines jl join journal_entries je on je.id=jl.\"journalId\" where je.\"companyId\"=2 and je.ref like 'GRN-%' and je.\"createdAt\" > now() - interval '2 minutes';")"
[ "$GBAL" = "true" ] && ok "قيد استلام البضاعة (GRN) متوازن (مدين مخزون/مصروف / دائن GRNI 2111)" || no "GRN journal not balanced ($GBAL)"

rm -f "$J"; echo; echo "▶ Result: $PASS passed, $FAIL failed"; [ "$FAIL" -eq 0 ] || exit 1
