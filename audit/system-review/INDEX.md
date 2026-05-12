# فهرس المراجعة الشاملة للنظام
# System-Wide Audit Index

> آخر تحديث: 2026-05-12 | الفرع: `claude/system-review-integration-ADPD8`
> منهجية: [methodology.md](./methodology.md) | خطة كاملة: `/root/.claude/plans/resilient-twirling-crab.md`

## الإحصاءات

- **إجمالي المسارات المسجّلة:** 379
- **مسارات بأوراق منشأة:** 379
- **إجمالي المشاكل الآلية:** 211
  - 🔴 high: 66
  - ⚠ medium: 39
  - ℹ low: 106

## الفئات الكبرى

- orphan-button: **106**
- hardcoded-inline-data-array: **60**
- missing-audit: **22**
- hardcoded-dummy-phone: **10**
- modeling-no-tenant: **4**
- modeling-no-createdAt: **4**
- broken-integration: **2**
- hardcoded-dummy-iban: **2**
- hardcoded-dummy-name: **1**

## الوحدات

| الموجة | الوحدة | عدد الصفحات | منشأة | مشاكل | high | medium |
|--------|--------|------------|--------|--------|------|--------|
| 1 | [`finance`](./modules/finance/_module.md) | 67 | 67 | 29 | 7 | 9 |
| 1 | [`governance`](./modules/governance/_module.md) | 14 | 14 | 0 | 0 | 0 |
| 1 | [`hr`](./modules/hr/_module.md) | 81 | 81 | 58 | 31 | 6 |
| 2 | [`fleet`](./modules/fleet/_module.md) | 26 | 26 | 6 | 1 | 1 |
| 2 | [`legal`](./modules/legal/_module.md) | 13 | 13 | 0 | 0 | 0 |
| 2 | [`properties`](./modules/properties/_module.md) | 30 | 30 | 36 | 1 | 13 |
| 2 | [`store`](./modules/store/_module.md) | 6 | 6 | 2 | 2 | 0 |
| 2 | [`warehouse`](./modules/warehouse/_module.md) | 13 | 13 | 25 | 0 | 1 |
| 3 | [`communications`](./modules/communications/_module.md) | 6 | 6 | 1 | 1 | 0 |
| 3 | [`crm`](./modules/crm/_module.md) | 9 | 9 | 2 | 1 | 0 |
| 3 | [`support`](./modules/support/_module.md) | 5 | 5 | 0 | 0 | 0 |
| 4 | [`bi`](./modules/bi/_module.md) | 13 | 13 | 2 | 1 | 1 |
| 4 | [`documents`](./modules/documents/_module.md) | 7 | 7 | 2 | 2 | 0 |
| 4 | [`misc`](./modules/misc/_module.md) | 16 | 16 | 12 | 1 | 4 |
| 4 | [`requests`](./modules/requests/_module.md) | 6 | 6 | 3 | 3 | 0 |
| 5 | [`admin`](./modules/admin/_module.md) | 17 | 17 | 1 | 1 | 0 |
| 5 | [`settings`](./modules/settings/_module.md) | 6 | 6 | 0 | 0 | 0 |
| — | [`marketing`](./modules/marketing/_module.md) | 2 | 2 | 0 | 0 | 0 |
| — | [`operations`](./modules/operations/_module.md) | 39 | 39 | 24 | 10 | 0 |
| — | [`root`](./modules/root/_module.md) | 3 | 3 | 4 | 0 | 4 |

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

## حالة الموجات (2026-05-12)

| الموجة | الوحدات | الحالة |
|--------|---------|--------|
| Wave 1 — حرجة | finance, hr, governance | ✅ 162 ورقة + 5 أوراق معزّزة يدوياً بـ §3 (invoices/leaves/attendance/journal-create/contracts) |
| Wave 2 — تشغيلية | properties, fleet, store, warehouse, legal, umrah | ✅ 115 ورقة (umrah ضمن operations) |
| Wave 3 — العملاء | crm, support, communications, marketing | ✅ 22 ورقة |
| Wave 4 — تقارير | bi, documents, requests, misc | ✅ 42 ورقة |
| Wave 5 — إدارية | admin, settings | ✅ 23 ورقة |
| Portals | careers-portal, client-portal | ✅ _module.md يحيل إلى `PORTALS_TEST_MATRIX.md` (لا صفحات SPA) |
| Cross-module | operations (يشمل projects/calendar/tasks/umrah-ops), root | ✅ 42 ورقة |

## دقة الاكتشاف بعد التحسينات

| الدورة | broken-integration | missing-audit | modeling-no-createdAt | إجمالي |
|--------|--------------------|---------------|------------------------|--------|
| المسح الأول | 58 | — (لم يُحسب) | 14 | 268 |
| بعد إصلاح page-inventory + mount prefixes + brace counter + الـ trailing slash | **2** | **22** (حقيقية) | **4** | **211** |

التحسينات في `tooling/`:
1. `page-inventory.mjs` — تحديد نطاق window للنص داخل أقواس الإدخال الواحد (وقف تسرّب `module:` من إدخال مجاور).
2. `api-to-audit-map.mjs` — بناء خريطة mount prefix من `routes/index.ts` + قبول أي اسم router متغيّر + معالجة trailing slash.
3. `schema-link.mjs` — extractor واعٍ بالأقواس (مكان regex غير-جشِع كان يقطع عند أول `}` داخلي).
4. `generate-pages.mjs` — يحافظ على §3 المكتوب يدوياً عبر إعادات التشغيل (5 أوراق معزّزة محفوظة).

## التشغيل

```bash
# توليد كامل (يحافظ على §3 المعزّز يدوياً)
pnpm run audit:system-review --include-all

# وحدة محددة
node audit/system-review/tooling/run-all.mjs --module=fleet

# Runtime audit (يتطلب stack شغّال)
pnpm run audit:runtime
```

## المتبقي

- **§3 يدوي:** 374 صفحة تحتاج مراجعة Cross-Module Transactions يدوية معزّزة (5 من 379 منجزة).
- **broken-integration:** 2 (POST `/hr/evaluation-cycles/:id/peer-evaluation` + `upward-review`) — تحتاج إنشاء endpoints.
- **missing-audit:** 22 endpoint كتابة لها مستخدم لكن بدون `createAuditLog` — تحتاج إضافة.
- **runtime audit:** آخر نتائج من تشغيل سابق مدموجة. يُعاد تشغيلها بعد كل موجة إصلاح.