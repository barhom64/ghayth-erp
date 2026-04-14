# Warehouse — Phase C.8 Verification Pack

> **Purpose:** End-to-end verification for the Warehouse audit
> (commit `b7c0eb3` on branch `claude/phase-c8-warehouse`).
> **Author:** Claude (code) — to be executed by the programmer on the
> Replit environment where the live schema lives.
> **Goal:** produce a ✅/⚠️/❌ verdict for **Phase C.8 Warehouse**
> before merging to `main`.
>
> **🎯 This is the FINAL Phase C domain.** After this lands, all 8
> core domains will share the unified audit methodology (typed errors,
> state machines, audit/event coverage, delete guards).

---

## 0. Overview

Two independent verification signals, same pattern as previous domains:

1. **Execution Pack (A)** — Parts 1–5. curl + DB queries.
2. **Static Review (C)** — Part 6. Code walkthrough.

### Scenario index — 14 tests

| # | Surface | Scenario | Expected |
|---|---|---|---|
| 1 | POST /warehouse/products | missing `name` | 422 `VALIDATION_ERROR` |
| 2 | POST /warehouse/products | missing `sku` | 422 `VALIDATION_ERROR` |
| 3 | POST /warehouse/products | duplicate `sku` | 409 `CONFLICT` |
| 4 | POST /warehouse/products | invalid `categoryId` (FK fail) | 422 `VALIDATION_ERROR` |
| 5 | POST /warehouse/products | negative `costPrice` | 422 `VALIDATION_ERROR` |
| 6 | POST /warehouse/products | happy path | 201 + `warehouse.product.created` event |
| 7 | PATCH /warehouse/products/:id | invalid status transition (discontinued → active) | 409 `CONFLICT` |
| 8 | DELETE /warehouse/products/:id | product with `currentStock > 0` | 409 `CONFLICT` |
| 9 | POST /warehouse/movements | missing `productId` | 422 `VALIDATION_ERROR` |
| 10 | POST /warehouse/movements | invalid `type` (not in enum) | 422 `VALIDATION_ERROR` |
| 11 | POST /warehouse/movements | `out` overdraw (qty > currentStock) | 409 `CONFLICT` |
| 12 | POST /warehouse/transfers | `out` overdraw on transfer | 409 `CONFLICT` |
| 13 | POST /warehouse/categories | missing `name` | 422 `VALIDATION_ERROR` |
| 14 | DELETE /warehouse/categories/:id | category with child products | 409 `CONFLICT` |

---

## 1. Setup

### 1.1 Environment requirements

Prerequisites:

- Live Postgres with `warehouse_products`, `warehouse_categories`,
  `warehouse_movements`, `warehouse_stock_batches`, `suppliers`,
  `inventory_counts`, `inventory_count_items`, `event_logs`,
  `audit_logs`.
- A user with permission for the `warehouse` module.
- At least one `warehouse_categories` row to use as FK for new products.
- `psql`, `curl`, `jq`.

### 1.2 Schema drift pre-check

Phase C.5 caught `employees.companyId` / `deletedAt` drift. Phase
C.7a caught the `lifecycleEngine.quoteIdent` cross-cutting bug plus
`purchase_requests.expectedDate → expectedDelivery` and `purchase_request_items`
column rename. Run the same `\d` checks on warehouse:

```sql
\d warehouse_products
\d warehouse_categories
\d warehouse_movements
\d warehouse_stock_batches
\d inventory_counts
\d inventory_count_items
\d suppliers
```

Compare columns with what the INSERTs in `warehouse.ts` use:

- `warehouse_products`: companyId, sku, name, description, categoryId,
  unit, minStock, maxStock, currentStock, costPrice, sellPrice,
  location, branchId, status, deletedAt
- `warehouse_categories`: companyId, name, parentId, deletedAt
- `warehouse_movements`: companyId, productId, type, quantity, unitCost,
  reference, fromLocation, toLocation, notes, createdBy
- `warehouse_stock_batches`: productId, batchNumber, quantity, unitCost,
  receivedDate
- `inventory_counts`: companyId, countDate, conductedBy, status, notes,
  warehouseLocation, approvedAt, approvedBy

If any column is missing, trim the INSERT and log the fix in the
verdict (same pattern as `b70ac81` Property building fix and
`b7030e5` Finance purchase fix).

**Known watchlist:**
- `warehouse_products.lastWaCost` — added for weighted-average
  tracking. May not exist on older staging DBs.
- `warehouse_movements.fromLocation` / `toLocation` — used by
  /transfers but not /movements. Confirm both exist.

### 1.3 Auth / token

```bash
BASE_URL="http://127.0.0.1:5000"
ADMIN_EMAIL="warehouse@example.com"
ADMIN_PASSWORD="your-admin-password"

LOGIN_RES=$(curl -sS -X POST "$BASE_URL/api/auth/login" \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"$ADMIN_EMAIL\",\"password\":\"$ADMIN_PASSWORD\"}")

TOKEN=$(echo "$LOGIN_RES" | jq -r .token)
echo "$TOKEN" > /tmp/warehouse_token.txt
```

The user needs `warehouse:read`, `warehouse:create`, `warehouse:update`,
and `warehouse:delete` permissions. Most admin/manager roles have all
four. If any test returns 403, switch users.

### 1.4 Conventions

- `TOKEN` from `/tmp/warehouse_token.txt`, ids in
  `/tmp/warehouse_ids.txt`.
- Products use `sku` prefixed `TEST-C8-`.
- Categories use `name` prefixed `TEST-C8-CAT-`.

### 1.5 Safety rails

- Test 8 (delete with stock > 0) needs a product with currentStock > 0.
  We'll create a product, then run a movement to bring stock up,
  before attempting the delete.
- Tests 11/12 (overdraw) use the product from Tests 6/8. Run them
  in order.
- No JE posting is on the critical path for any of the 14 tests
  (they all fire BEFORE the GL block), so a missing CoA on the
  staging DB does NOT block the pack.

---

## 2. Products scenarios (Tests 1–8)

```bash
TOKEN=$(cat /tmp/warehouse_token.txt)
BASE_URL="http://127.0.0.1:5000"
AUTH="Authorization: Bearer $TOKEN"

# Pick a category id for the FK-validating tests
CAT_ID=$(curl -sS "$BASE_URL/api/warehouse/categories" -H "$AUTH" \
  | jq -r '.data[0].id // empty')
if [ -z "$CAT_ID" ]; then
  CAT_RES=$(curl -sS -X POST "$BASE_URL/api/warehouse/categories" \
    -H "$AUTH" -H "Content-Type: application/json" \
    -d '{"name":"TEST-C8-CAT-base"}')
  CAT_ID=$(echo "$CAT_RES" | jq -r .id)
fi
echo "CAT_ID=$CAT_ID" > /tmp/warehouse_ids.txt
echo "Using CAT_ID=$CAT_ID"
```

---

### Test 1 — POST /products missing `name` → 422

```bash
curl -sS -i -X POST "$BASE_URL/api/warehouse/products" \
  -H "$AUTH" -H "Content-Type: application/json" \
  -d "{\"sku\":\"TEST-C8-001\",\"categoryId\":$CAT_ID,\"costPrice\":50,\"sellPrice\":100}"
```

**Expected status:** `422`

**Expected body:**
```json
{
  "error": "اسم المنتج مطلوب",
  "code": "VALIDATION_ERROR",
  "field": "name",
  "fix": "أدخل اسم المنتج"
}
```

**Notes:** warehouse.ts — first check after the role guard.

---

### Test 2 — POST /products missing `sku` → 422

```bash
curl -sS -i -X POST "$BASE_URL/api/warehouse/products" \
  -H "$AUTH" -H "Content-Type: application/json" \
  -d "{\"name\":\"Test Product C8 #002\",\"categoryId\":$CAT_ID,\"costPrice\":50}"
```

**Expected status:** `422`

**Expected body:**
```json
{
  "error": "رمز المنتج (SKU) مطلوب",
  "code": "VALIDATION_ERROR",
  "field": "sku",
  "fix": "أدخل رمز تعريف فريد للمنتج"
}
```

---

### Test 3 — POST /products duplicate `sku` → 409

Create a baseline:

```bash
P_RES=$(curl -sS -X POST "$BASE_URL/api/warehouse/products" \
  -H "$AUTH" -H "Content-Type: application/json" \
  -d "{
    \"sku\":\"TEST-C8-100\",
    \"name\":\"Test Product C8\",
    \"categoryId\":$CAT_ID,
    \"costPrice\":50,
    \"sellPrice\":100,
    \"unit\":\"piece\",
    \"minStock\":5,
    \"maxStock\":1000,
    \"currentStock\":0
  }")
echo "$P_RES" | jq '{id, sku, name, status, currentStock}'
PRODUCT_ID=$(echo "$P_RES" | jq -r .id)
echo "PRODUCT_ID=$PRODUCT_ID" >> /tmp/warehouse_ids.txt

# Retry with same SKU
curl -sS -i -X POST "$BASE_URL/api/warehouse/products" \
  -H "$AUTH" -H "Content-Type: application/json" \
  -d "{
    \"sku\":\"TEST-C8-100\",
    \"name\":\"Different name\",
    \"categoryId\":$CAT_ID,
    \"costPrice\":60
  }"
```

**Expected status on retry:** `409`

**Expected body:**
```json
{
  "error": "رمز المنتج (SKU) مستخدم مسبقاً",
  "code": "CONFLICT",
  "field": "sku",
  "fix": "اختر رمزاً فريداً لهذا المنتج"
}
```

**Notes:** The duplicate check filters on `"deletedAt" IS NULL`, so
soft-deleted SKUs don't block.

---

### Test 4 — POST /products invalid `categoryId` → 422

```bash
curl -sS -i -X POST "$BASE_URL/api/warehouse/products" \
  -H "$AUTH" -H "Content-Type: application/json" \
  -d '{
    "sku":"TEST-C8-002",
    "name":"Test Product",
    "categoryId":999999,
    "costPrice":50
  }'
```

**Expected status:** `422`

**Expected body:**
```json
{
  "error": "الفئة غير موجودة",
  "code": "VALIDATION_ERROR",
  "field": "categoryId",
  "fix": "اختر فئة مسجلة"
}
```

---

### Test 5 — POST /products negative `costPrice` → 422

```bash
curl -sS -i -X POST "$BASE_URL/api/warehouse/products" \
  -H "$AUTH" -H "Content-Type: application/json" \
  -d "{
    \"sku\":\"TEST-C8-003\",
    \"name\":\"Test Product\",
    \"categoryId\":$CAT_ID,
    \"costPrice\":-10
  }"
```

**Expected status:** `422`

**Expected body:**
```json
{
  "error": "سعر التكلفة غير صالح",
  "code": "VALIDATION_ERROR",
  "field": "costPrice",
  "fix": "أدخل قيمة غير سالبة"
}
```

**Notes:** Same check applies to `sellPrice` with
`field: "sellPrice"`.

---

### Test 6 — POST /products happy path → 201 + event

Already done in Test 3's baseline. Verify the side effects via §5.1:
- One `audit_logs` row with `action='create' entity='warehouse_products' entityId=$PRODUCT_ID`
- One `event_logs` row with `action='warehouse.product.created' entityId=$PRODUCT_ID`
- `sellPriceWarning: null` (since 100 > 50)

---

### Test 7 — PATCH /products/:id invalid status transition → 409

`PRODUCT_ID` is currently `active`. Move it to `discontinued` first
(allowed), then try to go back to `active` (not in the allowlist
because `discontinued` is terminal):

```bash
source /tmp/warehouse_ids.txt

# active → discontinued (allowed)
curl -sS -X PATCH "$BASE_URL/api/warehouse/products/$PRODUCT_ID" \
  -H "$AUTH" -H "Content-Type: application/json" \
  -d '{"status":"discontinued"}' | jq .status
# → "discontinued"

# discontinued → active (not allowed, terminal)
curl -sS -i -X PATCH "$BASE_URL/api/warehouse/products/$PRODUCT_ID" \
  -H "$AUTH" -H "Content-Type: application/json" \
  -d '{"status":"active"}'
```

**Expected status on second call:** `409`

**Expected body:**
```json
{
  "error": "لا يمكن نقل المنتج من \"discontinued\" إلى \"active\"",
  "code": "CONFLICT",
  "field": "status",
  "fix": "الانتقالات المسموحة: لا يوجد (حالة نهائية)"
}
```

**Notes:** `PRODUCT_TRANSITIONS["discontinued"] = []` (terminal). The
`fix` string echoes the empty allowed-list dynamically.

Reset the product to `active` for Test 8 — actually, since
`discontinued` is terminal, we can't reverse it. Use a fresh product
for Test 8:

```bash
P2_RES=$(curl -sS -X POST "$BASE_URL/api/warehouse/products" \
  -H "$AUTH" -H "Content-Type: application/json" \
  -d "{
    \"sku\":\"TEST-C8-200\",
    \"name\":\"Test Product 2\",
    \"categoryId\":$CAT_ID,
    \"costPrice\":50,
    \"sellPrice\":100,
    \"currentStock\":0
  }")
PRODUCT2_ID=$(echo "$P2_RES" | jq -r .id)
echo "PRODUCT2_ID=$PRODUCT2_ID" >> /tmp/warehouse_ids.txt
```

---

### Test 8 — DELETE /products/:id with `currentStock > 0` → 409

First add stock via a movement (use PRODUCT2_ID from Test 7 cleanup):

```bash
curl -sS -X POST "$BASE_URL/api/warehouse/movements" \
  -H "$AUTH" -H "Content-Type: application/json" \
  -d "{
    \"productId\":$PRODUCT2_ID,
    \"type\":\"in\",
    \"quantity\":10,
    \"unitCost\":50,
    \"reference\":\"TEST-C8-IN\"
  }" | jq '{id, type, quantity}'

# Now try to delete — should 409
curl -sS -i -X DELETE "$BASE_URL/api/warehouse/products/$PRODUCT2_ID" \
  -H "$AUTH"
```

**Expected status:** `409`

**Expected body:**
```json
{
  "error": "لا يمكن حذف المنتج — يحتوي على 10 وحدة في المخزون",
  "code": "CONFLICT",
  "field": "currentStock",
  "fix": "قم بصرف أو تعديل المخزون لصفر قبل الحذف"
}
```

**Notes:** warehouse.ts DELETE guard. Prevents orphaning inventory
movements. The error message dynamically echoes `currentStock`.

---

## 3. Movements + Categories (Tests 9–14)

```bash
source /tmp/warehouse_ids.txt
TOKEN=$(cat /tmp/warehouse_token.txt)
BASE_URL="http://127.0.0.1:5000"
AUTH="Authorization: Bearer $TOKEN"
```

---

### Test 9 — POST /movements missing `productId` → 422

```bash
curl -sS -i -X POST "$BASE_URL/api/warehouse/movements" \
  -H "$AUTH" -H "Content-Type: application/json" \
  -d '{"type":"in","quantity":5,"unitCost":50}'
```

**Expected status:** `422`

**Expected body:**
```json
{
  "error": "المنتج مطلوب",
  "code": "VALIDATION_ERROR",
  "field": "productId",
  "fix": "اختر المنتج المراد تحريكه"
}
```

---

### Test 10 — POST /movements invalid `type` (not in enum) → 422

```bash
curl -sS -i -X POST "$BASE_URL/api/warehouse/movements" \
  -H "$AUTH" -H "Content-Type: application/json" \
  -d "{\"productId\":$PRODUCT2_ID,\"type\":\"teleport\",\"quantity\":5}"
```

**Expected status:** `422`

**Expected body:**
```json
{
  "error": "نوع الحركة غير صالح",
  "code": "VALIDATION_ERROR",
  "field": "type",
  "fix": "اختر من: in, out, return, transfer_in, transfer_out, adjustment"
}
```

**Notes:** `MOVEMENT_TYPES` enum is at warehouse.ts:29.

---

### Test 11 — POST /movements `out` overdraw → 409

`PRODUCT2_ID` currently has `currentStock=10` (from Test 8 setup).
Try to issue 999:

```bash
curl -sS -i -X POST "$BASE_URL/api/warehouse/movements" \
  -H "$AUTH" -H "Content-Type: application/json" \
  -d "{
    \"productId\":$PRODUCT2_ID,
    \"type\":\"out\",
    \"quantity\":999,
    \"reference\":\"TEST-C8-OUT-overdraw\"
  }"
```

**Expected status:** `409`

**Expected body:**
```json
{
  "error": "الكمية المطلوبة (999) تتجاوز المخزون الحالي (10)",
  "code": "CONFLICT",
  "field": "quantity",
  "fix": "المخزون المتاح: 10"
}
```

**Notes:** The overdraw guard runs INSIDE the `withTransaction` block,
so the row lock + check + insertion are atomic. Even with concurrent
movements, the FOR UPDATE lock prevents over-issuing.

---

### Test 12 — POST /transfers `out` overdraw → 409

Same product, different surface:

```bash
curl -sS -i -X POST "$BASE_URL/api/warehouse/transfers" \
  -H "$AUTH" -H "Content-Type: application/json" \
  -d "{
    \"productId\":$PRODUCT2_ID,
    \"quantity\":999,
    \"fromWarehouseId\":1,
    \"toWarehouseId\":2
  }"
```

**Expected status:** `409`

**Expected body:**
```json
{
  "error": "الكمية المطلوبة (999) تتجاوز المخزون الحالي (10)",
  "code": "CONFLICT",
  "field": "quantity",
  "fix": "المخزون المتاح: 10"
}
```

**Notes:** Same guard, second handler. Both /movements and /transfers
share the overdraw protection.

---

### Test 13 — POST /categories missing `name` → 422

```bash
curl -sS -i -X POST "$BASE_URL/api/warehouse/categories" \
  -H "$AUTH" -H "Content-Type: application/json" \
  -d '{"parentId":null}'
```

**Expected status:** `422`

**Expected body:**
```json
{
  "error": "اسم الفئة مطلوب",
  "code": "VALIDATION_ERROR",
  "field": "name",
  "fix": "أدخل اسم الفئة"
}
```

---

### Test 14 — DELETE /categories/:id with child products → 409

`CAT_ID` has `PRODUCT_ID` (from Test 3) attached. Try to delete:

```bash
curl -sS -i -X DELETE "$BASE_URL/api/warehouse/categories/$CAT_ID" \
  -H "$AUTH"
```

**Expected status:** `409`

**Expected body (the dynamic count comes from a COUNT query):**
```json
{
  "error": "لا يمكن حذف الفئة \"<name>\" لأنها تحتوي على N منتج",
  "code": "CONFLICT",
  "field": "categoryId",
  "fix": "انقل المنتجات لفئة أخرى أو احذفها أولاً"
}
```

**Notes:** The check uses `WHERE "categoryId"=$1 AND "deletedAt" IS NULL`,
so soft-deleted products don't block. There's also a sibling guard for
**child categories** — you can also test by creating a sub-category
and trying to delete the parent:

```bash
# Create child
CHILD_RES=$(curl -sS -X POST "$BASE_URL/api/warehouse/categories" \
  -H "$AUTH" -H "Content-Type: application/json" \
  -d "{\"name\":\"TEST-C8-CAT-child\",\"parentId\":$CAT_ID}")
CHILD_ID=$(echo "$CHILD_RES" | jq -r .id)

# Try to delete the parent — should 409 with "child categories" message
curl -sS -i -X DELETE "$BASE_URL/api/warehouse/categories/$CAT_ID" \
  -H "$AUTH"
```

If the products guard fires first (it runs first in the DELETE
handler), the child-categories guard won't trigger. To test it
in isolation, delete the products first then retry the DELETE.

---

### Cleanup (run after §5 queries)

```bash
source /tmp/warehouse_ids.txt
psql "$DATABASE_URL" <<SQL
BEGIN;
DELETE FROM warehouse_movements      WHERE "productId" IN (SELECT id FROM warehouse_products WHERE sku LIKE 'TEST-C8-%');
DELETE FROM warehouse_stock_batches  WHERE "productId" IN (SELECT id FROM warehouse_products WHERE sku LIKE 'TEST-C8-%');
UPDATE warehouse_products SET "deletedAt"=NOW(), status='inactive'
  WHERE sku LIKE 'TEST-C8-%' AND "deletedAt" IS NULL;
UPDATE warehouse_categories SET "deletedAt"=NOW()
  WHERE name LIKE 'TEST-C8-CAT-%' AND "deletedAt" IS NULL;
COMMIT;
SQL
```

---

## 4. Event + Audit verification queries

Run after Parts 2–3 complete, before the cleanup block.

### 4.1 Product lifecycle events

```sql
SELECT action, "entityId", "createdAt"
  FROM event_logs
 WHERE action LIKE 'warehouse.product.%'
   AND "createdAt" > NOW() - INTERVAL '20 minutes'
 ORDER BY id DESC LIMIT 20;
```

**Pass criteria:**
- Two `warehouse.product.created` events (Test 3 baseline + Test 7
  PRODUCT2_ID setup)
- One `warehouse.product.status_changed` (Test 7 active → discontinued)
- Zero `warehouse.product.deleted` (Test 8 was refused)

---

### 4.2 Movement events

```sql
SELECT action, "entityId", "createdAt"
  FROM event_logs
 WHERE action = 'warehouse.movement.created'
   AND "createdAt" > NOW() - INTERVAL '20 minutes'
 ORDER BY id DESC LIMIT 10;
```

**Pass criteria:** one `warehouse.movement.created` event for the
Test 8 setup (`type=in qty=10`). Tests 11/12 were refused (overdraw
guard) so no extra movement events.

---

### 4.3 Movement DB rows match events

```sql
SELECT id, "productId", type, quantity, "unitCost", reference, "createdAt"
  FROM warehouse_movements
 WHERE "createdAt" > NOW() - INTERVAL '20 minutes'
 ORDER BY id DESC LIMIT 10;
```

**Pass criteria:** ONE row with `type='in' quantity=10 reference='TEST-C8-IN'`.
**No rows for `type='out' quantity=999`** (Test 11 was refused).
**No rows for `type='transfer_out' quantity=999`** (Test 12 was refused).

---

### 4.4 Stock balance after the test 8 setup

```sql
SELECT id, sku, name, "currentStock", "costPrice", "lastWaCost", status
  FROM warehouse_products
 WHERE sku LIKE 'TEST-C8-%'
 ORDER BY id;
```

**Pass criteria:**
- `TEST-C8-100` (PRODUCT_ID): currentStock=0, status='discontinued'
- `TEST-C8-200` (PRODUCT2_ID): currentStock=10, status='active',
  lastWaCost=50 (the unit cost from Test 8 setup)

---

### 4.5 No orphan rows from validation failures

```sql
-- Products: no row with empty name/sku or negative prices
SELECT id, sku, name, "costPrice", "sellPrice", "createdAt"
  FROM warehouse_products
 WHERE "createdAt" > NOW() - INTERVAL '20 minutes'
   AND ((name IS NULL OR name = '')
        OR (sku IS NULL OR sku = '')
        OR "costPrice" < 0 OR "sellPrice" < 0);
-- Expected: 0 rows
```

```sql
-- Movements: no row with type outside the enum
SELECT id, type, "createdAt"
  FROM warehouse_movements
 WHERE "createdAt" > NOW() - INTERVAL '20 minutes'
   AND type NOT IN ('in','out','return','transfer_in','transfer_out','adjustment');
-- Expected: 0 rows
```

```sql
-- Categories: no row with empty name
SELECT id, name, "createdAt"
  FROM warehouse_categories
 WHERE "createdAt" > NOW() - INTERVAL '20 minutes'
   AND (name IS NULL OR name = '');
-- Expected: 0 rows
```

**Pass criteria:** all three return zero rows.

---

### 4.6 Final scoreboard

```sql
WITH counts AS (
  SELECT
    COUNT(*) FILTER (WHERE action = 'warehouse.product.created')        AS product_created,
    COUNT(*) FILTER (WHERE action = 'warehouse.product.status_changed') AS product_status_changed,
    COUNT(*) FILTER (WHERE action = 'warehouse.product.updated')        AS product_updated,
    COUNT(*) FILTER (WHERE action = 'warehouse.product.deleted')        AS product_deleted,
    COUNT(*) FILTER (WHERE action = 'warehouse.movement.created')       AS movement_created
  FROM event_logs
  WHERE "createdAt" > NOW() - INTERVAL '20 minutes'
)
SELECT * FROM counts;
```

**Expected counts:**

| Event | Expected |
|---|---|
| `warehouse.product.created` | 2 |
| `warehouse.product.status_changed` | 1 (Test 7 active → discontinued) |
| `warehouse.product.updated` | 0 |
| `warehouse.product.deleted` | 0 (Test 8 refused) |
| `warehouse.movement.created` | 1 (Test 8 setup `in` movement) |

---

### 4.7 Verdict template

```
Warehouse Phase C.8 Verification — <date>

Execution environment: Replit / claude/phase-c8-warehouse
Token user: <email> / role=<role>

Test results (14 scenarios):
  1. POST /products missing name           [ ] 422 ✅  [ ] other ❌
  2. POST /products missing sku            [ ] 422 ✅  [ ] other ❌
  3. POST /products duplicate sku          [ ] 409 ✅  [ ] other ❌
  4. POST /products invalid categoryId     [ ] 422 ✅  [ ] other ❌
  5. POST /products negative costPrice     [ ] 422 ✅  [ ] other ❌
  6. POST /products happy path             [ ] 201 ✅  [ ] other ❌
  7. PATCH product invalid transition      [ ] 409 ✅  [ ] other ❌
  8. DELETE product with stock > 0         [ ] 409 ✅  [ ] other ❌
  9. POST /movements missing productId     [ ] 422 ✅  [ ] other ❌
 10. POST /movements invalid type enum     [ ] 422 ✅  [ ] other ❌
 11. POST /movements out overdraw          [ ] 409 ✅  [ ] other ❌
 12. POST /transfers out overdraw          [ ] 409 ✅  [ ] other ❌
 13. POST /categories missing name         [ ] 422 ✅  [ ] other ❌
 14. DELETE category with child products   [ ] 409 ✅  [ ] other ❌

Event listener scoreboard (§4.6):
  warehouse.product.created        = _ (expected 2)
  warehouse.product.status_changed = _ (expected 1)
  warehouse.product.deleted        = _ (expected 0)
  warehouse.movement.created       = _ (expected 1)

Stock balance correct (§4.4): [ ] ✅  [ ] ❌
No ReferenceError in logs:    [ ] ✅  [ ] ❌

Schema drift found: [ ] none  [ ] list: ___
Fix committed:      [ ] not needed  [ ] commit: ___

Verdict: [ ] ✅ Verified  [ ] ⚠️ Partial  [ ] ❌ Failed

Ready for merge to main: [ ] yes  [ ] no
```

---

## 5. Static Review (Part C)

Walkthrough against `warehouse.ts` at commit `b7c0eb3`.

### State machines

```
PRODUCT_TRANSITIONS (warehouse.ts:31)
  active       → [inactive, discontinued]
  inactive     → [active, discontinued]
  discontinued → [] (terminal)

COUNT_TRANSITIONS (warehouse.ts:37)
  draft        → [in_progress, approved, cancelled]
  in_progress  → [approved, cancelled]
  approved     → [] (terminal)
  cancelled    → [] (terminal)

MOVEMENT_TYPES enum (warehouse.ts:29)
  [in, out, return, transfer_in, transfer_out, adjustment]
```

Note: there is **no state machine on movements** — they're append-only
records. The MOVEMENT_TYPES enum only validates the type field on
insert.

### Test 1-6 — Product validation + happy path

- **Check order:** name → sku → costPrice → sellPrice → SKU duplicate
  → categoryId FK.
- **Error class:** `ValidationError` for missing/invalid fields,
  `ConflictError` for duplicate SKU.
- **Happy path side effects:** createAuditLog + emitEvent
  (`warehouse.product.created`).

### Test 7 — Status machine refuses discontinued → active

- **Route:** warehouse.ts PATCH /products/:id → state machine at line ~389.
- **Lookup:** `PRODUCT_TRANSITIONS["discontinued"]` = `[]` (terminal).
- **Error class:** `ConflictError` with `fix: "الانتقالات المسموحة: لا يوجد"`.
- **Risks:** none — the allowlist is enforced cleanly.

### Test 8 — Delete guard

- **Route:** warehouse.ts DELETE /products/:id.
- **Check:** `Number(existing.currentStock) > 0` throws.
- **Error class:** `ConflictError` with the actual stock count
  echoed in the message.
- **Risks:** the check uses `currentStock` from the SELECT row;
  there's no FOR UPDATE lock, so a concurrent decrement could race.
  Acceptable because the worst case is a rare false-positive on a
  delete attempt — no data corruption.

### Test 9 — Movement missing productId

- **Route:** warehouse.ts POST /movements → first guard.
- **Error class:** `ValidationError`.

### Test 10 — Movement invalid type

- **Check:** `!MOVEMENT_TYPES.includes(b.type)`.
- **Error class:** `ValidationError`.
- **Risks:** the enum is strict — uppercase/lowercase mismatches
  fail. Frontend should send lowercase exactly.

### Test 11/12 — Overdraw guards

- **Both /movements and /transfers** check `currentStock < quantity`
  inside `withTransaction` with a `FOR UPDATE` lock on the product
  row. This is the strongest guard in the entire warehouse domain
  — even concurrent issuance can't cause oversold.
- **Error class:** `ConflictError` with the exact stock count in
  the message.
- **Risks:** none. The lock prevents races.

### Test 13 — Category missing name

- **Route:** warehouse.ts POST /categories → first guard.
- **Error class:** `ValidationError`.

### Test 14 — Delete category with children

- **Route:** warehouse.ts DELETE /categories/:id.
- **Two guards:**
  1. Child products: `SELECT COUNT(*) FROM warehouse_products WHERE
     "categoryId"=$1 AND "deletedAt" IS NULL` — throws if > 0
  2. Child categories: `SELECT COUNT(*) FROM warehouse_categories
     WHERE "parentId"=$1 AND "deletedAt" IS NULL` — throws if > 0
- **Error class:** `ConflictError` with `meta` carrying the count
  (`linkedEntries` or `childAccounts`).
- **Risks:** the guards run in order — products first, then
  categories. If both have children, the products error fires.

---

### Static Review verdict

| Category | Count |
|---|---|
| Tests expected to pass cleanly | 14 / 14 |
| Tests flagged as ⚠️ Partial | 0 |
| Tests expected to fail | 0 |

**Recommendation:** Warehouse is predicted 14/14 ✅. The state
machine on products is simple (3 states), the movement validation
relies on an enum + a lock-protected overdraw guard, and the
category delete guards are explicit. **No applyTransition usage** —
warehouse.ts doesn't depend on the lifecycleEngine, so the recent
`b7030e5` quoteIdent fix has no impact here.

**Comparison across all 8 Phase C domains:**

| Domain | Files | Test count | Test 11-style gap | Defence-in-depth from day one? |
|---|---|---|---|---|
| Fleet | 1 | 15 | ⚠️ Had gap (hotfix needed) | ❌ → ✅ |
| Property | 1 + listeners | 18 | None | ✅ |
| Projects | 1 | 16 | None | ✅ |
| Legal | 1 | 14 | None | ✅ |
| Finance C.7a | 3 | 14 | None | ✅ |
| **Warehouse** | **1** | **14** | **None (predicted)** | **✅** |

---

## 6. Merge procedure (after ✅)

1. Verification report ✅ 14/14 on Replit
2. Local fast-forward:
   ```bash
   git fetch origin
   git checkout main
   git pull --ff-only
   git merge --ff-only origin/claude/phase-c8-warehouse
   git push origin main
   ```
3. Delete branch:
   ```bash
   git branch -d claude/phase-c8-warehouse
   git push origin --delete claude/phase-c8-warehouse
   ```

---

## 7. 🎯 Final Phase C status (after Warehouse merges)

After this merge, **all 8 core Phase C domains** share the unified
audit methodology:

| # | Domain | Status |
|---|---|---|
| A | HR (reference) | ✅ Verified (foundational) |
| C.1 | Support | ✅ 10/10 |
| C.2 | CRM | ✅ 14/14 |
| C.3 | Fleet | ✅ 15/15 (post-hotfix Test 11) |
| C.4 | Property | ✅ 18/18 (+ building INSERT trim) |
| C.5 | Projects | ✅ 16/16 (+ employees FK drift fix) |
| C.6 | Legal | ✅ 14/14 |
| C.7a | Finance (big 3) | ✅ 14/14 (+ lifecycleEngine quoteIdent fix) |
| C.7b | Finance (small 7) | ⏸️ Deferred — simple CRUD, low priority |
| **C.8** | **Warehouse** | **🎯 This pack** |

**Cross-cutting wins:**
- Typed errors: `ValidationError` / `ConflictError` / `NotFoundError`
  / `ForbiddenError` / `IntegrationError` everywhere
- State machines: 30+ transition tables across all domains
- Delete guards: every "has dependents" scenario blocked with
  typed `ConflictError`
- Audit + event coverage: every PATCH / DELETE on the unified
  shape
- Shared layer fixes:
  - `dcc8a1b` — Fleet Test 11 + finance assertRole regression
  - `515192a/3fdde57` — employees.companyId/deletedAt FK drift
    in projects/fleet
  - `b70ac81` — property_buildings INSERT trim
  - `b7030e5` — lifecycleEngine quoteIdent + skipUpdatedAt option

**Remaining work for "Phase D":**
- Phase C.7b — audit the 7 small finance files (vendors, accounts,
  budget, collection, hardening, recurring, custodies)
- Phase 2 — Schema consolidation (pg-dump → committed bootstrap so
  fresh sandboxes can run the verification packs locally without
  schema drift)
- Phase 5 — Delete legacy patterns (the `requireRole` helper in the 7
  small finance files, the `validationError(res, ...)` function in
  errorHandler.ts)
- Phase 6 — Lint rules to enforce typed errors / state machines

If verification turns up ⚠️/❌, do NOT merge. Fix on the branch,
re-run the pack, merge only when 14/14.

