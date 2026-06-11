#!/bin/bash
# verify-warehouse-journey.sh — live E2E proof of the warehouse journey on a
# real DB (pnpm db:provision-agent), driven through the HTTP API by the tenant
# operator (door@door.sa — a non-platform-admin), exercising real RBAC
# (warehouse.inventory / warehouse.transfers). Proves the full chain that the
# warehouse PRs landed:
#   1. product create → receipt movement → on-hand up           (#warehouse)
#   2. issue movement → on-hand down + COGS GL (DR 5110/CR 1151) (#2020)
#   3. impact-preview returns a forecast WITHOUT posting          (#2040)
#   4. inventory count → record variance → approve → adjustment   (lifecycle)
#      movement + balanced variance JE (quantity changes ONLY on approve)
#   5. controllable policy: turn ON warehouse.require_movement_reference →
#      a movement with no reference is REJECTED; reset the policy            (#2040)
# Re-runnable (SKU carries a fresh suffix each run). The warehouse never posts
# a JE itself — it requests the financial engine; this only proves the effects.
# Prereqs: bootstrap (الضياء tenant) + built+running server.
set -euo pipefail
BASE="${BASE:-http://localhost:5000/api}"; EMAIL="${EMAIL:-door@door.sa}"; PASSWORD="${PASSWORD:-Door@2026Diaa}"
DSN="${DATABASE_URL:-postgres://ghayth_erp:ghayth_erp@localhost:5432/ghayth_erp}"
CID="${CID:-2}"
J="$(mktemp)"; PASS=0; FAIL=0
py(){ python3 -c "$1" 2>/dev/null; }
ok(){ echo "  ✅ $1"; PASS=$((PASS+1)); }
no(){ echo "  ❌ $1"; FAIL=$((FAIL+1)); }
export PGPASSWORD="$(echo "$DSN" | sed -E 's#.*://[^:]+:([^@]+)@.*#\1#')"
q(){ psql "$DSN" -tA -c "$1"; }
echo "▶ Warehouse journey (إنشاء→استلام→صرف+COGS→معاينة→جرد→اعتماد→تسوية→سياسة المرجع)"

curl -fsS -c "$J" -H "X-E2E-Test: 1" -X POST "$BASE/auth/login" -H "Content-Type: application/json" -d "{\"email\":\"$EMAIL\",\"password\":\"$PASSWORD\"}" -o /dev/null
CSRF="$(grep erp_csrf "$J" | awk '{print $7}')"; [ -n "$CSRF" ] && ok "login ($EMAIL)" || { no login; exit 1; }
pw(){ curl -sS -b "$J" -H "x-csrf-token: $CSRF" -H "Content-Type: application/json" -X POST "$BASE$1" -d "$2"; }
put(){ curl -sS -b "$J" -H "x-csrf-token: $CSRF" -H "Content-Type: application/json" -X PUT "$BASE$1" -d "$2"; }
code(){ curl -sS -o /dev/null -w "%{http_code}" -b "$J" -H "x-csrf-token: $CSRF" -H "Content-Type: application/json" -X POST "$BASE$1" -d "$2"; }
gid(){ py "import sys,json;d=json.load(sys.stdin);print(d.get('$1') or '')"; }

SKU="WJ-$(date +%s)"

# 1) Create a stockable product (starts at 0, min 2).
P="$(pw /warehouse/products "{\"name\":\"صنف رحلة المستودع\",\"sku\":\"$SKU\",\"unit\":\"piece\",\"costPrice\":5,\"sellPrice\":8,\"currentStock\":0,\"minStock\":2}")"
PID="$(echo "$P" | gid id)"
[ -n "$PID" ] && ok "إنشاء صنف (#$PID, $SKU)" || { no "product create: $(echo "$P"|gid error)"; rm -f "$J"; echo "▶ Result: $PASS passed, $((FAIL+1)) failed"; exit 1; }

# 2) Receipt — on-hand 0 → 10.
pw /warehouse/movements "{\"productId\":$PID,\"type\":\"in\",\"quantity\":10,\"unitCost\":5,\"reference\":\"GRN-$SKU\"}" >/dev/null
ST="$(q "select \"currentStock\"::int from warehouse_products where id=$PID;")"
[ "$ST" = "10" ] && ok "استلام: الرصيد 0 ← 10" || no "receipt stock=$ST (expected 10)"

# 3) Issue — on-hand 10 → 7 + COGS GL (DR 5110 / CR 1151 = 15).
ISS="$(pw /warehouse/movements "{\"productId\":$PID,\"type\":\"out\",\"quantity\":3,\"reference\":\"ISSUE-$SKU\"}")"
MID="$(echo "$ISS" | gid id)"
ST="$(q "select \"currentStock\"::int from warehouse_products where id=$PID;")"
[ "$ST" = "7" ] && ok "صرف: الرصيد 10 ← 7" || no "issue stock=$ST (expected 7)"
JBAL="$(q "select (sum(jl.debit)=sum(jl.credit) and sum(jl.debit)>0)::text from journal_lines jl join journal_entries je on je.id=jl.\"journalId\" where je.\"companyId\"=$CID and je.\"sourceKey\"='warehouse:movement:${MID:-0}';")"
[ "$JBAL" = "true" ] && ok "قيد COGS متوازن للحركة #$MID (DR تكلفة / CR مخزون)" || no "COGS JE not balanced ($JBAL)"
DRC="$(q "select string_agg(distinct \"accountCode\",',' order by \"accountCode\") from journal_lines where \"journalId\" in (select id from journal_entries where \"sourceKey\"='warehouse:movement:${MID:-0}');")"
echo "$DRC" | grep -q "5110" && echo "$DRC" | grep -q "1151" && ok "حسابا القيد متمايزان (5110 تكلفة / 1151 مخزون)" || no "JE accounts unexpected ($DRC)"

# 3b) Non-stock guard is REAL (migration 298): a service item gets rejected.
SVC="$(pw /warehouse/products "{\"name\":\"خدمة استشارة\",\"sku\":\"SVC-$SKU\",\"unit\":\"piece\"}")"
SVCID="$(echo "$SVC" | gid id)"
q "update warehouse_products set \"itemType\"='service' where id=${SVCID:-0};" >/dev/null
RCSVC="$(code /warehouse/movements "{\"productId\":$SVCID,\"type\":\"in\",\"quantity\":1,\"reference\":\"X\"}")"
{ [ "$RCSVC" -ge 400 ] && [ "$RCSVC" -lt 500 ]; } && ok "حارس غير-المخزني فعلي: حركة على خدمة مرفوضة (HTTP $RCSVC)" || no "non-stock guard inert (HTTP $RCSVC, expected 4xx)"

# 4) Impact preview — forecasts WITHOUT posting (movement count unchanged).
MC1="$(q "select count(*)::int from warehouse_movements where \"productId\"=$PID;")"
IMP="$(pw /warehouse/movements/impact-preview "{\"productId\":$PID,\"type\":\"out\",\"quantity\":2}")"
NITEMS="$(echo "$IMP" | py "import sys,json;print(len((json.load(sys.stdin) or {}).get('items') or []))")"
MC2="$(q "select count(*)::int from warehouse_movements where \"productId\"=$PID;")"
{ [ "${NITEMS:-0}" -gt 0 ] && [ "$MC1" = "$MC2" ]; } && ok "معاينة الأثر ($NITEMS بنود) بلا أي ترحيل (الحركات $MC1=$MC2)" || no "impact-preview items=$NITEMS movements $MC1→$MC2"

# 5) Inventory count → variance → approve → adjustment (qty changes ONLY on approve).
CNT="$(pw /warehouse/inventory-counts "{\"countDate\":\"$(date +%F)\",\"notes\":\"رحلة اختبار\"}")"
CNTID="$(echo "$CNT" | gid id)"
[ -n "$CNTID" ] && ok "فتح جرد (#$CNTID)" || no "count create: $(echo "$CNT"|gid error)"
# Record physical 5 vs system 7 → variance -2. Stock must NOT move yet.
pw /warehouse/inventory-counts/$CNTID/items "{\"productId\":$PID,\"physicalCount\":5}" >/dev/null
ST_PRE="$(q "select \"currentStock\"::int from warehouse_products where id=$PID;")"
[ "$ST_PRE" = "7" ] && ok "تسجيل الفرق لا يحرّك الكمية (ما زال 7)" || no "stock moved before approval ($ST_PRE)"
# Approve → adjustment applied.
pw /warehouse/inventory-counts/$CNTID/approve "{}" >/dev/null
ST_POST="$(q "select \"currentStock\"::int from warehouse_products where id=$PID;")"
CSTAT="$(q "select status from inventory_counts where id=${CNTID:-0};")"
{ [ "$ST_POST" = "5" ] && [ "$CSTAT" = "approved" ]; } && ok "اعتماد الجرد: تسوية 7 ← 5 (status=approved)" || no "count approve stock=$ST_POST status=$CSTAT (expected 5/approved)"

# 6) Cycle count (الجرد الدوري): create → record → submit → approve → post →
#    variance movement + stock change + variance JE stamped (idempotent).
CC="$(pw /warehouse/cycle-counts "{}")"
CCID="$(echo "$CC" | gid id)"
[ -n "$CCID" ] && ok "جرد دوري أُنشئ (#$CCID، snapshot أسطر)" || no "cycle-count create: $(echo "$CC"|gid error)"
# Current stock is 5 (post inventory-count). Count 4 → variance -1.
pw /warehouse/cycle-counts/$CCID/record "{\"items\":[{\"productId\":$PID,\"countedQuantity\":4}]}" >/dev/null
CCST="$(q "select status from warehouse_cycle_counts where id=${CCID:-0};")"
[ "$CCST" = "in_progress" ] && ok "تسجيل العدّ (status=in_progress)" || no "record status=$CCST"
# Any other snapshot lines must be counted before submit — count them at system qty.
q "update warehouse_cycle_count_lines set \"countedQuantity\"=\"systemQuantity\" where \"cycleCountId\"=${CCID:-0} and \"countedQuantity\" is null;" >/dev/null
pw /warehouse/cycle-counts/$CCID/submit "{}" >/dev/null
pw /warehouse/cycle-counts/$CCID/approve "{}" >/dev/null
CCST="$(q "select status from warehouse_cycle_counts where id=${CCID:-0};")"
[ "$CCST" = "approved" ] && ok "تقديم ← اعتماد (status=approved)" || no "submit/approve status=$CCST"
ST_BEFORE="$(q "select \"currentStock\"::int from warehouse_products where id=$PID;")"
pw /warehouse/cycle-counts/$CCID/post "{}" >/dev/null
ST_AFTER="$(q "select \"currentStock\"::int from warehouse_products where id=$PID;")"
JESTAMP="$(q "select (\"adjustmentJournalEntryId\" is not null)::text from warehouse_cycle_count_lines where \"cycleCountId\"=${CCID:-0} and \"productId\"=$PID;")"
{ [ "$ST_BEFORE" = "5" ] && [ "$ST_AFTER" = "4" ] && [ "$JESTAMP" = "true" ]; } && ok "ترحيل الفروق: 5 ← 4 + قيد تسوية مختوم" || no "post stock $ST_BEFORE→$ST_AFTER je=$JESTAMP (expected 5→4,true)"
# Idempotency: a re-post must not double-apply.
pw /warehouse/cycle-counts/$CCID/post "{}" >/dev/null
ST_AGAIN="$(q "select \"currentStock\"::int from warehouse_products where id=$PID;")"
[ "$ST_AGAIN" = "4" ] && ok "إعادة الترحيل لا تكرّر الأثر (ما زال 4)" || no "re-post double-applied ($ST_AGAIN)"

# 6b) F1 — lot-tracked consumption (FEFO + expiry/recall guard + trace).
put /settings/system-controls "{\"warehouse.enforce_lot_fefo\":true}" >/dev/null
LP="$(pw /warehouse/products "{\"name\":\"دواء متتبَّع\",\"sku\":\"LOT-$SKU\",\"unit\":\"piece\",\"costPrice\":7,\"currentStock\":0,\"minStock\":0}")"
LPID="$(echo "$LP" | gid id)"
q "update warehouse_products set \"tracksLots\"=true where id=${LPID:-0};" >/dev/null
[ -n "$LPID" ] && ok "صنف متتبَّع للدفعات أُنشئ (#$LPID)" || no "lot product create: $(echo "$LP"|gid error)"
# Receipt without a lot number must be rejected for a tracksLots product.
RCNOLOT="$(code /warehouse/movements "{\"productId\":$LPID,\"type\":\"in\",\"quantity\":5,\"reference\":\"R\"}")"
{ [ "$RCNOLOT" -ge 400 ] && [ "$RCNOLOT" -lt 500 ]; } && ok "استلام بلا رقم دفعة مرفوض (HTTP $RCNOLOT)" || no "lot-receipt-without-lot allowed ($RCNOLOT)"
# Receive two lots: A expires soon (FEFO first), B later.
pw /warehouse/movements "{\"productId\":$LPID,\"type\":\"in\",\"quantity\":5,\"unitCost\":7,\"reference\":\"R-A\",\"lotNumber\":\"A-$SKU\",\"expiryDate\":\"$(date -d '+20 days' +%F 2>/dev/null || date -v+20d +%F)\"}" >/dev/null
pw /warehouse/movements "{\"productId\":$LPID,\"type\":\"in\",\"quantity\":5,\"unitCost\":7,\"reference\":\"R-B\",\"lotNumber\":\"B-$SKU\",\"expiryDate\":\"$(date -d '+200 days' +%F 2>/dev/null || date -v+200d +%F)\"}" >/dev/null
LOTA="$(q "select id from warehouse_stock_lots where \"productId\"=$LPID and \"lotNumber\"='A-$SKU';")"
LOTB="$(q "select id from warehouse_stock_lots where \"productId\"=$LPID and \"lotNumber\"='B-$SKU';")"
QA="$(q "select quantity::int from warehouse_stock_lots where id=${LOTA:-0};")"
[ "$QA" = "5" ] && ok "استلام دفعتين بصلاحيتين (A=5)" || no "lot receipt A qty=$QA"
# FEFO issue of 3 (no lotId) must drain lot A (soonest expiry) first.
ISSL="$(pw /warehouse/movements "{\"productId\":$LPID,\"type\":\"out\",\"quantity\":3,\"reference\":\"ISS-LOT\"}")"
MIDL="$(echo "$ISSL" | gid id)"
QA2="$(q "select quantity::int from warehouse_stock_lots where id=${LOTA:-0};")"
QB2="$(q "select quantity::int from warehouse_stock_lots where id=${LOTB:-0};")"
MLOT="$(q "select \"lotId\" from warehouse_movements where id=${MIDL:-0};")"
{ [ "$QA2" = "2" ] && [ "$QB2" = "5" ] && [ "$MLOT" = "$LOTA" ]; } && ok "صرف FEFO خصم الدفعة الأقرب انتهاءً (A:5←2، B=5) + ختم lotId على الحركة (trace)" || no "FEFO wrong: A=$QA2 B=$QB2 movLot=$MLOT (expect 2/5/$LOTA)"
# COGS posted for the lot issue (DR 5110 / CR 1151).
JLOT="$(q "select (sum(jl.debit)=sum(jl.credit) and sum(jl.debit)>0)::text from journal_lines jl join journal_entries je on je.id=jl.\"journalId\" where je.\"sourceKey\"='warehouse:movement:${MIDL:-0}';")"
[ "$JLOT" = "true" ] && ok "COGS صرف الدفعة مُرحّل ومتوازن" || no "lot issue COGS not balanced ($JLOT)"
# Recall lot B, then an explicit issue from B must be rejected (policy guard).
pw /warehouse/lots/$LOTB/recall "{\"reason\":\"اختبار\"}" >/dev/null
RCREC="$(code /warehouse/movements "{\"productId\":$LPID,\"type\":\"out\",\"quantity\":1,\"reference\":\"X\",\"lotId\":$LOTB}")"
{ [ "$RCREC" -ge 400 ] && [ "$RCREC" -lt 500 ]; } && ok "صرف من دفعة مستدعاة مرفوض (HTTP $RCREC)" || no "issue from recalled lot allowed ($RCREC)"
# Recall trace: lot → movements via warehouse_movements.lotId.
TRACE="$(q "select count(*)::int from warehouse_movements where \"lotId\"=${LOTA:-0};")"
[ "${TRACE:-0}" -ge 1 ] && ok "تتبّع الاستدعاء من الدفعة إلى الحركة يعمل (lot→$TRACE حركة)" || no "recall trace empty"
# Non-lot product still issues via batches (no regression).
 STN="$(q "select \"currentStock\"::int from warehouse_products where id=$PID;")"
pw /warehouse/movements "{\"productId\":$PID,\"type\":\"out\",\"quantity\":1,\"reference\":\"NOLOT\"}" >/dev/null
STN2="$(q "select \"currentStock\"::int from warehouse_products where id=$PID;")"
[ "$STN2" = "$((STN-1))" ] && ok "صنف غير متتبَّع يصرف عبر الدفعات كالمعتاد (لا كسر)" || no "non-lot regression $STN→$STN2"
put /settings/system-controls "{\"warehouse.enforce_lot_fefo\":false}" >/dev/null

# 7) Advanced slice: lot QC lifecycle + recall + ABC + reports.
LOT="$(pw /warehouse/lots "{\"productId\":$PID,\"lotNumber\":\"LOT-$SKU\",\"quantity\":5,\"expiryDate\":\"$(date -d '+10 days' +%F 2>/dev/null || date -v+10d +%F)\"}")"
LOTID="$(echo "$LOT" | gid id)"
LOTQC="$(echo "$LOT" | gid qcStatus)"
{ [ -n "$LOTID" ] && [ "$LOTQC" = "pending" ]; } && ok "دفعة أُنشئت (#$LOTID، QC=pending)" || no "lot create id=$LOTID qc=$LOTQC: $(echo "$LOT"|gid error)"
pw /warehouse/lots/$LOTID/qc-approve "{}" >/dev/null
LQC="$(q "select \"qualityControlStatus\" from warehouse_stock_lots where id=${LOTID:-0};")"
[ "$LQC" = "approved" ] && ok "اعتماد QC للدفعة" || no "lot qc=$LQC"
# Double QC decision must be rejected (one-shot gate).
RCQC="$(code /warehouse/lots/$LOTID/qc-reject "{}")"
{ [ "$RCQC" -ge 400 ] && [ "$RCQC" -lt 500 ]; } && ok "قرار QC مزدوج مرفوض (HTTP $RCQC)" || no "double QC allowed ($RCQC)"
# Expiring report sees the lot (expiry in 10 days < 90-day horizon).
EXPN="$(curl -sS -b "$J" -H "x-csrf-token: $CSRF" "$BASE/warehouse/reports/expiring" | py "import sys,json;print(len((json.load(sys.stdin) or {}).get('data') or []))")"
[ "${EXPN:-0}" -ge 1 ] && ok "تقرير قرب الانتهاء يلتقط الدفعة ($EXPN)" || no "expiring report empty"
# ABC: computed lazily from the issue movements of this run (product has value).
ABCN="$(curl -sS -b "$J" -H "x-csrf-token: $CSRF" "$BASE/warehouse/abc-classification" | py "import sys,json;d=json.load(sys.stdin);rows=d.get('data') or [];print(sum(1 for r in rows if r.get('abcClass')=='A'))")"
[ "${ABCN:-0}" -ge 1 ] && ok "تصنيف ABC حُسب (صنف A واحد على الأقل)" || no "abc empty"
# Accuracy report reflects the approved cycle count.
ACC="$(curl -sS -b "$J" -H "x-csrf-token: $CSRF" "$BASE/warehouse/reports/cycle-count-accuracy" | py "import sys,json;d=json.load(sys.stdin);print(d.get('approvedCounts') or 0)")"
[ "${ACC:-0}" -ge 1 ] && ok "تقرير دقّة الجرد يعكس الجرد المعتمد ($ACC)" || no "accuracy empty"
# Recall flips the lot out of active.
pw /warehouse/lots/$LOTID/recall "{\"reason\":\"اختبار استدعاء\"}" >/dev/null
LST="$(q "select status from warehouse_stock_lots where id=${LOTID:-0};")"
[ "$LST" = "recalled" ] && ok "استدعاء الدفعة (status=recalled)" || no "recall status=$LST"

# 8) Controllable policy: require reference ON → movement without reference rejected.
put /settings/system-controls "{\"warehouse.require_movement_reference\":true}" >/dev/null
RC="$(code /warehouse/movements "{\"productId\":$PID,\"type\":\"in\",\"quantity\":1}")"
{ [ "$RC" -ge 400 ] && [ "$RC" -lt 500 ]; } && ok "سياسة «إلزام المرجع» مفعّلة: حركة بلا مرجع مرفوضة (HTTP $RC)" || no "policy not enforced (HTTP $RC, expected 4xx)"
# Reset the policy so the run is idempotent.
put /settings/system-controls "{\"warehouse.require_movement_reference\":false}" >/dev/null
ok "إعادة ضبط السياسة (idempotent)"

rm -f "$J"; echo; echo "▶ Result: $PASS passed, $FAIL failed"; [ "$FAIL" -eq 0 ] || exit 1
