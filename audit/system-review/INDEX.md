# فهرس المراجعة الشاملة للنظام
# System-Wide Audit Index

> آخر تحديث: 2026-05-12 | الفرع: `claude/system-review-integration-ADPD8`
> منهجية: [methodology.md](./methodology.md) | خطة كاملة: `/root/.claude/plans/resilient-twirling-crab.md`

## الإحصاءات

- **إجمالي المسارات المسجّلة:** 379
- **مسارات بأوراق منشأة:** 162
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
| 2 | `fleet` | 26 | 0 | 15 | 8 | 0 |
| 2 | `legal` | 13 | 0 | 2 | 2 | 0 |
| 2 | `properties` | 30 | 0 | 50 | 5 | 13 |
| 2 | `store` | 6 | 0 | 4 | 4 | 0 |
| 2 | `umrah` | 27 | 0 | 6 | 4 | 0 |
| 3 | `communications` | 6 | 0 | 3 | 3 | 0 |
| 4 | `bi` | 9 | 0 | 0 | 0 | 0 |
| 4 | `documents` | 7 | 0 | 0 | 0 | 0 |
| 4 | `misc` | 62 | 0 | 62 | 18 | 0 |
| 4 | `requests` | 6 | 0 | 4 | 4 | 0 |
| 5 | `admin` | 16 | 0 | 1 | 1 | 0 |
| 5 | `settings` | 6 | 0 | 0 | 0 | 0 |
| — | `root` | 3 | 0 | 0 | 0 | 0 |

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