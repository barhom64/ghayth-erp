# فهرس المراجعة الشاملة للنظام
# System-Wide Audit Index

> آخر تحديث: 2026-05-13 | الفرع: `claude/system-review-integration-ADPD8`
> منهجية: [methodology.md](./methodology.md) | خطة كاملة: `/root/.claude/plans/resilient-twirling-crab.md`

## الإحصاءات

- **إجمالي المسارات المسجّلة:** 383
- **مسارات بأوراق منشأة:** 383
- **إجمالي المشاكل الآلية:** 0
  - 🔴 high: 0
  - ⚠ medium: 0
  - ℹ low: 0

## الفئات الكبرى


## الوحدات

| الموجة | الوحدة | عدد الصفحات | منشأة | مشاكل | high | medium |
|--------|--------|------------|--------|--------|------|--------|
| 1 | [`finance`](./modules/finance/_module.md) | 67 | 67 | 0 | 0 | 0 |
| 1 | [`governance`](./modules/governance/_module.md) | 14 | 14 | 0 | 0 | 0 |
| 1 | [`hr`](./modules/hr/_module.md) | 81 | 81 | 0 | 0 | 0 |
| 2 | [`fleet`](./modules/fleet/_module.md) | 26 | 26 | 0 | 0 | 0 |
| 2 | [`legal`](./modules/legal/_module.md) | 13 | 13 | 0 | 0 | 0 |
| 2 | [`properties`](./modules/properties/_module.md) | 30 | 30 | 0 | 0 | 0 |
| 2 | [`store`](./modules/store/_module.md) | 6 | 6 | 0 | 0 | 0 |
| 2 | [`warehouse`](./modules/warehouse/_module.md) | 13 | 13 | 0 | 0 | 0 |
| 3 | [`communications`](./modules/communications/_module.md) | 6 | 6 | 0 | 0 | 0 |
| 3 | [`crm`](./modules/crm/_module.md) | 9 | 9 | 0 | 0 | 0 |
| 3 | [`support`](./modules/support/_module.md) | 5 | 5 | 0 | 0 | 0 |
| 4 | [`bi`](./modules/bi/_module.md) | 13 | 13 | 0 | 0 | 0 |
| 4 | [`documents`](./modules/documents/_module.md) | 7 | 7 | 0 | 0 | 0 |
| 4 | [`misc`](./modules/misc/_module.md) | 16 | 16 | 0 | 0 | 0 |
| 4 | [`requests`](./modules/requests/_module.md) | 6 | 6 | 0 | 0 | 0 |
| 5 | [`admin`](./modules/admin/_module.md) | 17 | 17 | 0 | 0 | 0 |
| 5 | [`settings`](./modules/settings/_module.md) | 6 | 6 | 0 | 0 | 0 |
| — | [`marketing`](./modules/marketing/_module.md) | 2 | 2 | 0 | 0 | 0 |
| — | [`operations`](./modules/operations/_module.md) | 43 | 43 | 0 | 0 | 0 |
| — | [`root`](./modules/root/_module.md) | 3 | 3 | 0 | 0 | 0 |

## النتائج الموحّدة

- [FINDINGS.csv](./findings/FINDINGS.csv) — كل المشاكل في صف واحد
- [hardcoded-data.md](./findings/hardcoded-data.md) — البيانات الوهمية الثابتة
- [orphan-buttons.md](./findings/orphan-buttons.md) — الأزرار بلا تأثير خلفي
- [broken-integrations.md](./findings/broken-integrations.md) — كتابات بلا endpoint مطابق
- [modeling-gaps.md](./findings/modeling-gaps.md) — ثغرات النمذجة + غياب audit/permission/tenant

## التشغيل

```bash
# توليد الموجة الأولى (افتراضي)
node audit/system-review/tooling/run-all.mjs

# توليد وحدة محددة
node audit/system-review/tooling/run-all.mjs --module=fleet

# توليد كل الوحدات
node audit/system-review/tooling/run-all.mjs --include-all

# تشغيل runtime audit الزمني
pnpm run audit:runtime
```

## حالة الموجات

| الموجة | الوحدات | الحالة |
|--------|---------|--------|
| Wave 1 — حرجة | finance, hr, governance | ✅ 162 ورقة مولّدة |
| Wave 2 — تشغيلية | properties, fleet, store, warehouse, legal, umrah | ✅ 88 ورقة + umrah ضمن operations |
| Wave 3 — العملاء | crm, support, communications, marketing | ✅ 22 ورقة |
| Wave 4 — تقارير | bi, documents, requests, misc | ✅ 42 ورقة |
| Wave 5 — إدارية | admin, settings | ✅ 23 ورقة |
| Portals | careers-portal, client-portal | ✅ مرجع لـ `PORTALS_TEST_MATRIX.md` |
| Cross-module | operations (يشمل projects + umrah), root | ✅ 42 ورقة |

## §3 المعزّز يدوياً (Cross-Module Transactions)

صفحات تم توثيق سلسلة حركاتها يدوياً (محفوظة عبر إعادات التوليد):
- [`finance/finance-invoices.md`](./modules/finance/finance-invoices.md) — GL + ZATCA + إشعار
- [`finance/finance-journal-create.md`](./modules/finance/finance-journal-create.md) — ذرّية + فترة محاسبية
- [`finance/finance-expenses.md`](./modules/finance/finance-expenses.md) — VAT + budget
- [`finance/finance-vouchers-create.md`](./modules/finance/finance-vouchers-create.md) — allocation + توافق بنكي
- [`finance/finance-payments.md`](./modules/finance/finance-payments.md) — AR Aging + بوابات الدفع
- [`finance/finance-fixed-assets.md`](./modules/finance/finance-fixed-assets.md) — إهلاك + التخلّص
- [`hr/hr-leaves.md`](./modules/hr/hr-leaves.md) — رصيد + راتب
- [`hr/hr-attendance.md`](./modules/hr/hr-attendance.md) — تأخير + تأديب
- [`hr/hr-payroll.md`](./modules/hr/hr-payroll.md) — WPS + GOSI + GL
- [`properties/properties-contracts.md`](./modules/properties/properties-contracts.md) — Ejar + إشغال
- [`warehouse/warehouse-movements.md`](./modules/warehouse/warehouse-movements.md) — FIFO/COGS + ربط شراء/بيع
- [`fleet/fleet.md`](./modules/fleet/fleet.md) — مركبة كأصل ثابت + وقود/صيانة
- [`legal/legal-cases.md`](./modules/legal/legal-cases.md) — جلسات + أتعاب + ناجز
- [`store/store-orders.md`](./modules/store/store-orders.md) — حجز/شحن + فاتورة ZATCA
