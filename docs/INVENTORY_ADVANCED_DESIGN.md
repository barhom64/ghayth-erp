# Inventory Advanced — تصميم التكامل (lots / serials / valuation / cycle count)

> **النطاق**: ترقية الـ inventory الحالي من single-quantity tracking إلى enterprise-grade مع lot traceability، serial-per-unit، valuation methods (FIFO/LIFO/Average)، و cycle counting.
> **التاريخ**: 2026-05-09
> **الحالة**: تصميم — التنفيذ ~3-5 أسابيع.

## 1) الحالة الحالية

✅ **موجود**:
- `products` — منتجات بـ SKU، prices، unit
- `warehouses` — مستودعات
- `warehouse_stock_batches` — lots بسيطة `(productId, batchNumber, quantity, unitCost, expiryDate, receivedDate)`
- Stock movements (in/out)

❌ **مفقود**:
- **Lot lifecycle**: status (active / quarantine / recalled / expired / disposed)، supplier traceability، recall workflow
- **Serial-per-unit tracking**: لـ warranties، repairs، theft control
- **Valuation methods**: FIFO / LIFO / Weighted-Average (currently single `unitCost`)
- **Cycle count workflow**: scheduled counts، variance approval، GL reconciliation
- **ABC analysis**: تصنيف منتجات حسب قيمتها (A=top 80%، B=middle 15%، C=bottom 5%)
- **Multi-warehouse with bin/location**: rack/shelf/bin granularity
- **Reservations / pick lists**: held stock للـ pending orders

## 2) النموذج المُقترح

### 2.1 Lots (Batch Lifecycle)
كل دفعة تحمل lifecycle status + audit trail:
```
warehouse_stock_lots
  id, companyId, productId, warehouseId
  lotNumber (unique per product+warehouse)
  quantity, originalQuantity
  unitCost, currency
  receivedDate, expiryDate, manufactureDate
  supplierId, supplierLotRef
  status: active | quarantine | recalled | expired | disposed
  recallId, recalledAt, recalledBy, recallReason
  qualityControlStatus: pending | approved | rejected
```

Lot operations:
- **Receive**: insert lot، status='quarantine' إذا QC required
- **QC pass/fail**: status → active أو rejected
- **Pick (issue)**: decrement quantity، link to movement
- **Recall**: status='recalled'، block all future picks، notify customers who received from this lot
- **Expire**: cron at expiryDate → status='expired'، GL writeoff

### 2.2 Serials (Per-Unit)
For products marked `tracksSerials=true`:
```
warehouse_stock_serials
  id, companyId, productId, warehouseId, lotId
  serialNumber (unique)
  status: in_stock | reserved | sold | returned | warranty_repair | scrapped
  customerId (when sold)
  warrantyExpiresAt
  notes
```

### 2.3 Valuation Methods
```
product_valuation_settings
  productId
  method: fifo | lifo | average
  avgUnitCost (computed نتيجة weighted average)
  lastCostUpdate
```

**FIFO**: pick = oldest lots first
**LIFO**: pick = newest lots first
**Average**: pick = weighted avg cost across all on-hand lots

كل issue (sale/transfer/scrap) يستخدم الطريقة المُعدَّة. Inventory valuation report يستخدم نفس الطريقة لاحتساب closing inventory value.

### 2.4 Cycle Count
```
warehouse_cycle_counts
  id, companyId, warehouseId
  scheduledDate, status: pending | in_progress | reviewed | approved
  countedBy, reviewedBy, approvedBy

warehouse_cycle_count_lines
  cycleCountId, productId, lotId
  systemQuantity, countedQuantity
  variance, varianceValue
  reason, adjustmentJournalEntryId
```

### 2.5 ABC Analysis
```
product_abc_classification
  productId, period
  category: A | B | C
  pareto_value, pareto_share
  reviewedAt
```

## 3) Module Layout

```
artifacts/api-server/src/lib/inventory/
├── index.ts            — public API
├── types.ts            — Lot, Serial, ValuationMethod, CycleCount
├── valuation/
│   ├── fifo.ts         — pickFifo(lots, qty) — pure
│   ├── lifo.ts         — pickLifo(lots, qty) — pure
│   ├── average.ts      — computeWeightedAverage(lots) — pure
│   └── index.ts        — picker factory + types
├── lots.ts             — lot lifecycle helpers + recall workflow
├── serials.ts          — serial allocation + status transitions
├── cycle-count.ts      — schedule + variance posting
└── abc-analysis.ts     — top/middle/bottom classifier (pure)
```

## 4) خطة التنفيذ (3-5 أسابيع)

### الأسبوع 1: Lots + valuation (foundations) ✓ يبدأ هنا
- [ ] Migration 141 (stock_lots، stock_serials، valuation_settings، cycle_counts) ✓
- [ ] `lib/inventory/types.ts` ✓
- [ ] `lib/inventory/valuation/fifo.ts` + `lifo.ts` + `average.ts` (pure) ✓
- [ ] Tests ✓

### الأسبوع 2: Lot lifecycle + serial allocation
- [ ] `lots.ts`: receive، QC، pick (with valuation method)، recall
- [ ] `serials.ts`: allocate، transition، query by warranty
- [ ] Cron: daily expiry scan → status='expired' + GL writeoff trigger

### الأسبوع 3: Cycle count workflow
- [ ] `cycle-count.ts`: schedule، record، compute variance، post adjustment journal
- [ ] UI: count entry screen (mobile-friendly)

### الأسبوع 4: ABC + reporting
- [ ] `abc-analysis.ts`: monthly run، classify products
- [ ] Inventory valuation report (per-method)
- [ ] Recall report

### الأسبوع 5: UI
- [ ] Product detail: lots tab + serials tab
- [ ] Receive screen مع QC flow
- [ ] Cycle count workflow UI

## 5) RBAC

- `warehouse:lots:read` — عرض lots
- `warehouse:lots:receive` — استلام دفعات
- `warehouse:lots:qc` — جودة + approval
- `warehouse:lots:recall` — استدعاء (manager only)
- `warehouse:serials:read` — عرض serials
- `warehouse:cycle_count:run` — جرد دوري
- `warehouse:cycle_count:approve` — اعتماد variance

## 6) المخاطر

| المخاطر | التخفيف |
|---------|---------|
| FIFO/LIFO accuracy under concurrency | `SELECT … FOR UPDATE` على lots أثناء pick |
| Serial duplicates | UNIQUE constraint + ON CONFLICT detection |
| Recall scope drift (which customers got this lot?) | Foreign key from sales_lines → lot_id جديد |
| Average cost recalculation cost | Trigger-based update vs batch nightly — TBD per perf testing |
| Cycle count variance fraud | 4-eye approval (counted by ≠ approved by) |

## 7) Definition of Done

- [ ] Lots tracked from receive → pick → recall/expire
- [ ] Serials allocated 1:1 على products marked `tracksSerials`
- [ ] FIFO/LIFO/AVG valuation produces correct cost-of-goods-sold journal
- [ ] Cycle count produces approvable variance + auto-journal
- [ ] ABC monthly report
- [ ] Recall workflow notifies all affected customers
- [ ] All tests pass (40+ vitest cases)
- [ ] Documentation: SOP for receive، QC، cycle count

---

**هذا المستند مُرافق لـ**:
- Migration 141 (في PR الحالي) — schema لـ lots، serials، valuation، cycle counts
- `lib/inventory/valuation/` — FIFO/LIFO/AVG pure functions (في PR الحالي)
- `lib/inventory/types.ts` (في PR الحالي)
