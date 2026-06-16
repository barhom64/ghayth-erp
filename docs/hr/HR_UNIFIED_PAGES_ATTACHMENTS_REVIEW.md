# HR-REV-9 — تجربة استعراض المرفقات والصفحات وفق النموذج الموحّد

> **Issue:** [#2243](https://github.com/barhom64/ghayth-erp/issues/2243)
> **يبني على:** HR-REV-0 (الجرد) · HR-REV-1 (الصلاحيات) · `HR_REFERENCE_MODEL.md`
> **الفرع:** `claude/wizardly-babbage-mgsv2i` · **التاريخ:** 2026-06-14 · **الحالة:** جرد امتثال (read-only).

**مفتاح:** ✅ مثبت · 🔴 فجوة · 🏛 قرار.

> ملاحظة: بعد مزامنة `main`، صار عدد صفحات `pages/hr/` = **65** (أضاف main `accruals-monthly`, `saudi-compliance/wps/settings`). الجرد أدناه على هذا الأساس.

---

## 0. الملخص — الأساس قويّ

✅ المرفقات تُخدَم عبر API لا روابط عامة، التنزيل محكوم ومُدقّق، وغالبية الصفحات على النموذج الموحّد. الفجوات: **7 صفحات بلا PageShell**، وتدقيق الصلاحية الدقيقة للمرفقات الحسّاسة (راتب/جزاء).

---

## 1. جرد الصفحات (النموذج الموحّد) — ✅

| المؤشر | القيمة | الدليل |
|--------|--------|--------|
| صفحات HR تستخدم PageShell/ListPage | **57 / 64** | `grep PageShell pages/hr/` |
| لا تستخدمها (🔴 مرشّحة للترقية) | **7** | — |
| النموذج المرجعي | PageShell + PageStatusBadge + useApiMutation + useApiQuery | `HR_REFERENCE_MODEL.md` |

🔴 **إجراء:** ترقية الـ7 صفحات الباقية إلى PageShell + DataTable الموحّد (لا جدول/فلترة خاص بلا مبرر).

---

## 2. جرد المرفقات — ✅ (الأساس آمن)

| المؤشر | الحالة | الدليل |
|--------|--------|--------|
| التخزين | object storage عبر `storageKey` | `documents.ts:418,471` |
| الخدمة | عبر API (`getObjectEntityFile`/`downloadObject`) — **لا raw public URL** | `documents.ts` |
| رفع | `POST /documents/upload` محكوم بـ`authorize(documents:create)` | `documents.ts:320` |
| تنزيل | `GET /:id/download` محكوم بـ`authorize(documents:export)` | `documents.ts:385` |
| **audit التنزيل** | ✅ صف access-log ('download') قبل الخدمة | `documents.ts:413` |
| معاينة inline | `Content-Disposition: inline` (PDF/صورة) | `documents.ts:439` |

🔴 **فجوات للتدقيق:**
1. المرفقات الحسّاسة (راتب/جزاء/هوية) محكومة بميزة `documents` العامة — 🏛 هل تحتاج صلاحية/نطاق أدقّ (per-entity) بدل `documents:*` الموحّد؟
2. `view`/`preview` — هل يُدقَّق مثل `download`؟ يحتاج تأكيدًا.
3. retention/privacy sensitivity لكل نوع مرفق غير مصنّف.

---

## 3. جدول أنواع المرفقات (linked entity → قواعد)

| نوع المرفق | الكيان | الأدوار | إجراءات | حسّاسية |
|-----------|--------|---------|---------|---------|
| عقد | contract | HR/الموظف | view/download/verify | عالية |
| هوية/إقامة/رخصة | employee docs | HR/الوثائق | view/upload/verify | عالية (privacy) |
| مرفق راتب | payroll | HR/الرواتب | view/download | **عالية جدًا** 🚩 |
| مرفق جزاء/محضر | discipline | HR/مدير | view/download | عالية 🚩 |
| سيرة/شهادات متقدم | applicant | HR/توظيف | view/download | متوسطة |
| إثبات مخالفة | violation | HR | view/upload | عالية |

---

## 4. قواعد الاستعراض (تأكيد #2243)

- ✅ لا direct public URL لمرفقات HR (الخدمة عبر API).
- ✅ كل download ينتج audit (`documents.ts:413`).
- 🔴 **يجب تعميم** تدقيق view/preview كـdownload.
- 🔴 المرفق الحسّاس لا يُعرض بلا صلاحية **ونطاق** (يرتبط بـ visible+403 — HR-REV-1): التحقّق أن مرفق راتب/جزاء لا يصله غير المصرّح.
- ✅ كل مرفق داخل سياقه (tab في 360) لا كملف عائم.

---

## 5. رحلات قبول المرفقات

| الرحلة | المتوقّع | جاهزية |
|--------|----------|:------:|
| عرض مرفق عقد | view + audit | 🟢 |
| عرض مرفق هوية | view محكوم بـprivacy | 🟡 |
| رفع مستند من الموظف + اعتماد HR | upload(self)→verify(HR) + audit | 🟡 |
| **وصول غير مصرّح لمرفق راتب/جزاء** | **403 + audit محاولة** | 🔴 تحقّق حرج |
| صفحة موظفين قائمة موحّدة | DataTable موحّد | 🟢 |
| Employee 360 يعرض المرفقات حسب الصلاحية | tab «الوثائق» محكوم | 🟢 |

---

## 6. مخرجات القبول والممنوعات

- تقرير الجرد ✅ + جدول gaps (§2/§4) + قائمة PRs (ترقية 7 صفحات، تدقيق view، صلاحية أدقّ للحسّاس).
- ممنوع: بناء مرفقات جديدة قبل الجرد · تجاوز مكتبات العرض · raw links للحسّاس · صفحة مرفقات عامة بلا سياق.

## 7. ADR
| # | القرار |
|---|--------|
| ADR-HR-15 | صلاحية/نطاق المرفقات الحسّاسة (per-entity مقابل `documents:*` العام) |

— نهاية HR-REV-9 —
