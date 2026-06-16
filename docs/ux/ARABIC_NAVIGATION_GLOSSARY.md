# ARABIC_NAVIGATION_GLOSSARY — قاموس التسميات المعتمدة للتنقّل

> **UX Navigation Governance wave — SLICE 1 (design catalog, not wired).**
> Branch: `claude/ux-nav-governance-inventory` · 2026-06-16
> Seeded from `docs/ux/NAVIGATION_DUPLICATE_INVENTORY.md`. Builds on (does not replace) `docs/ux/ARABIC_BUSINESS_TERMS.md`.

## القاعدة

كل دالة (function) في النظام لها:
- **اسم عربي رسمي واحد** يُعرض في القائمة + التبويب + عنوان الصفحة (نفس النص في الثلاثة).
- **مسار رسمي واحد** (route حيّ، غير redirect).
- **أسماء بديلة (aliases)** للبحث فقط — لا تُعرض في أي قائمة/تبويب/عنوان.

هذا القاموس هو نواة `navigation.canonical-map.ts` المقترحة (انظر §5.2 من تقرير الجرد). **لم يُربط بأي كود في هذه الشريحة.**

---

## 1. المالية — التسميات الإنجليزية التي يجب تعريبها (أولوية عالية)

| المسار | الاسم المعروض حالياً | الاسم العربي المعتمد | aliases (بحث فقط) |
|---|---|---|---|
| `/finance/reports/zatca` | ZATCA Reports Hub | **مركز تقارير ZATCA** | ZATCA, الفوترة الإلكترونية |
| `/finance/gl-health` | GL Health Score | **مؤشر صحة دفتر الأستاذ** | GL Health Score, صحة GL |
| `/finance/approvals-inbox` | Approvals Inbox | **صندوق الاعتمادات** | Approvals Inbox |
| `/finance/reports/gl-integrity-gaps` | GL Integrity Gaps | **فجوات سلامة دفتر الأستاذ** | GL Integrity Gaps |
| `/finance/reports/unmapped-lines` | Unmapped Lines | **بنود غير مُوجَّهة** | Unmapped Lines |
| `/finance/journal/activity` | Posting Activity | **نشاط الترحيل** | Posting Activity |
| `/finance/reports/is-vs-budget` | P&L مقابل الميزانية | **قائمة الدخل مقابل الموازنة** | P&L, IS vs budget |
| `/finance/reports/cogs-summary` | ملخص التكلفة (CoGS) | **ملخص تكلفة المبيعات** | CoGS, COGS |
| `/finance/dunning` | متابعة Dunning | **متابعة التذكير بالتحصيل** | Dunning |
| `/finance/cfo-cockpit` | لوحة المدير المالي *(عنوان الصفحة فيه «CFO Cockpit»)* | **لوحة المدير المالي** | CFO Cockpit |
| `/finance/entity-360` | ملف الجهة 360° *(عنوان الصفحة «Entity 360»)* | **ملف الجهة 360°** | Entity 360 |

## 2. الموارد البشرية

| المسار (canonical) | الاسم العربي المعتمد | aliases / مسارات redirect قديمة |
|---|---|---|
| `/hr/org-tree` | **الهيكل التنظيمي** | الهيكل · `/hr/organization` (redirect) · `/hr/organization/structure` (redirect) |
| `/hr/violations` | **المخالفات** | إدارة المخالفات · `/hr/violations/management` (redirect) |
| `/hr/leaves` | **طلبات الإجازة** | إدارة الإجازات · `/hr/leaves/management` (redirect) |
| `/hr/shifts` | **جدول الورديات** | إدارة الورديات · `/hr/shifts/management` (redirect) |
| `/hr/performance` | **تقييم الأداء** | تقييم متقدم · `/hr/performance/advanced` (redirect) |
| `/hr/training` | **البرامج التدريبية** | التدريب المتقدم · `/hr/training/advanced` (redirect) |
| `/hr/recruitment` | **وظائف التوظيف** | تحليلات متقدمة · `/hr/recruitment/advanced` (redirect) |
| `/hr/discipline/regulation` | **لائحة الانضباط** | — |

## 3. الأسطول والنقل

| المسار | الاسم العربي المعتمد | aliases |
|---|---|---|
| `/fleet/telematics/live-map` | **التتبع المباشر** | الخريطة المباشرة, Telematics |
| `/fleet/telematics/video-evidence` | **أدلة الفيديو** | جلسات الفيديو |
| `/fleet/telematics/devices` | **أجهزة التسجيل (MDVR)** | MDVR |
| `/fleet/telematics/settings` | **إعدادات الكاميرات (CMSV6)** | CMSV6 |
| `/fleet/transport/dispatch` | **الإرسال** | Dispatch |
| `/fleet/transport/rules` | **قواعد استقبال النقل** | قواعد الاستقبال |
| `/fleet/transport/service-lines` | **طابور تسعير بنود النقل** | أوامر الفوترة |
| `/fleet/reports` | **التقارير والتكاليف** | التقارير, TCO |

## 4. العقارات

| المسار | الاسم العربي المعتمد | aliases |
|---|---|---|
| `/properties` | **الوحدات العقارية** | الوحدات |
| `/properties/sales` | **المبيعات العقارية** | بيع العقارات |
| `/properties/dashboard` | **نظرة عامة على الأملاك** | لوحة العقارات |

## 5. المخزون / الموردين

| المسار | الاسم العربي المعتمد | aliases | ملاحظة |
|---|---|---|---|
| `/finance/vendors` | **الموردون (المالية)** | الموردين | توحيد الإملاء على «الموردون» |
| `/warehouse/suppliers` | **الموردون (المستودع)** | الموردين | نفس المفهوم — قرار مالك: دمج أو إبقاء namespace |
| `/finance/inventory-costing` | **تكلفة المخزون** | تقييم المخزون | تمييز عن تقرير التقييم أدناه |
| `/finance/reports/inventory-valuation` | **تقرير تقييم المخزون** | تقييم المخزون | — |

## 6. تسميات عامة متكررة (تحتاج توضيح/تخصيص)

| الاسم العام | المشكلة | التوصية |
|---|---|---|
| **لوحة التحكم** | ٦ مسارات مختلفة تحملها (`/dashboard` + ٥ لوحات وحدات) | احجز «لوحة التحكم» لـ`/dashboard` فقط؛ خصّص الباقي: «لوحة الأسطول»، «لوحة المخزون»، «لوحة المتجر»، «لوحة العملاء»، «لوحة الدعم». |
| **التقارير** | ٦+ مسارات | اترك «التقارير» كعنوان مجموعة، وميّز الورقة الأولى باسم المجال. |
| **نظرة عامة** | legal/governance/properties/bi | مقبول داخل سياق المجموعة. |
| **سجل المراجعة** | `/admin/logs` و`/settings/audit-log` | قرار مالك: أيهما الرسمي. |
| **استيراد البيانات** | `/umrah/import` و`/admin/data-import` | ميّز: «استيراد المعتمرين» مقابل «استيراد بيانات النظام». |

---

## مرجع
- جرد كامل بالأسطر والشدّة: `docs/ux/NAVIGATION_DUPLICATE_INVENTORY.md`
- قاموس مصطلحات الأعمال (تقني→عربي): `docs/ux/ARABIC_BUSINESS_TERMS.md`
- مصدر الحقيقة للقائمة: `artifacts/ghayth-erp/src/components/layout/navigation.registry.ts`
