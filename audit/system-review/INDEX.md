# فهرس المراجعة الشاملة للنظام
# System-Wide Audit Index

> آخر تحديث: 2026-05-12 | الفرع: `claude/system-review-integration-ADPD8`
> منهجية: [methodology.md](./methodology.md) | خطة كاملة: `/root/.claude/plans/resilient-twirling-crab.md`

## الإحصاءات

- **إجمالي المسارات المسجّلة:** 379
- **مسارات بأوراق منشأة:** 379
- **إجمالي المشاكل الآلية:** 268
  - 🔴 high: 123
  - ⚠ medium: 27
  - ℹ low: 118

## الفئات الكبرى

- orphan-button: **118**
- hardcoded-inline-data-array: **61**
- broken-integration: **58**
- modeling-no-createdAt: **14**
- hardcoded-dummy-phone: **10**
- modeling-no-tenant: **4**
- hardcoded-dummy-iban: **2**
- hardcoded-dummy-name: **1**

## الوحدات

| الموجة | الوحدة | عدد الصفحات | منشأة | مشاكل | high | medium |
|--------|--------|------------|--------|--------|------|--------|
| 1 | [`finance`](./modules/finance/_module.md) | 67 | 67 | 33 | 21 | 0 |
| 1 | [`governance`](./modules/governance/_module.md) | 14 | 14 | 1 | 1 | 0 |
| 1 | [`hr`](./modules/hr/_module.md) | 81 | 81 | 69 | 48 | 0 |
| 2 | [`fleet`](./modules/fleet/_module.md) | 26 | 26 | 15 | 8 | 0 |
| 2 | [`legal`](./modules/legal/_module.md) | 13 | 13 | 2 | 2 | 0 |
| 2 | [`properties`](./modules/properties/_module.md) | 30 | 30 | 50 | 5 | 13 |
| 2 | [`store`](./modules/store/_module.md) | 6 | 6 | 4 | 4 | 0 |
| 2 | [`warehouse`](./modules/warehouse/_module.md) | 13 | 13 | 28 | 4 | 0 |
| 3 | [`communications`](./modules/communications/_module.md) | 6 | 6 | 3 | 3 | 0 |
| 3 | [`crm`](./modules/crm/_module.md) | 9 | 9 | 3 | 2 | 0 |
| 3 | [`support`](./modules/support/_module.md) | 5 | 5 | 1 | 1 | 0 |
| 4 | [`bi`](./modules/bi/_module.md) | 13 | 13 | 1 | 1 | 0 |
| 4 | [`documents`](./modules/documents/_module.md) | 7 | 7 | 0 | 0 | 0 |
| 4 | [`misc`](./modules/misc/_module.md) | 8 | 8 | 2 | 2 | 0 |
| 4 | [`requests`](./modules/requests/_module.md) | 6 | 6 | 4 | 4 | 0 |
| 5 | [`admin`](./modules/admin/_module.md) | 17 | 17 | 1 | 1 | 0 |
| 5 | [`settings`](./modules/settings/_module.md) | 6 | 6 | 0 | 0 | 0 |
| — | [`marketing`](./modules/marketing/_module.md) | 2 | 2 | 1 | 1 | 0 |
| — | [`operations`](./modules/operations/_module.md) | 47 | 47 | 32 | 11 | 0 |
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

## الموجات القادمة

- Wave 2 (🟠): properties, fleet, store, warehouse, legal, umrah
- Wave 3 (🟡): crm, projects, support, communications
- Wave 4 (🟢): bi, documents, requests, my-space, misc
- Wave 5 (🟣): admin, settings, careers-portal, client-portal