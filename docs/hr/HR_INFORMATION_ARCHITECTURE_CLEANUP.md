# HR-REV-2 — تنظيف هيكل الموارد البشرية ومنع الصفحات المكررة

> **Issue:** [#2221](https://github.com/barhom64/ghayth-erp/issues/2221)
> **يبني على:** HR-REV-0 (§3 جرد المسارات، §8.8 التكرارات، §9 مصفوفة التصنيف) + HR-REV-1 (§4 visible+403)
> **الفرع:** `claude/wizardly-babbage-mgsv2i` · **التاريخ:** 2026-06-14
> **الحالة:** تقرير IA (read-only). لا حذف/دمج/redirect قبل اعتماد القرارات.

**مفتاح:** ✅ مثبت · 🏛 قرار معماري · 🚩 تكرار/خلل.

---

## 0. الملخص

مسار HR يحوي **63 صفحة + 20 نموذج** موزّعة على 9 مجموعات قائمة. التحليل يثبت **6 عناقيد تكرار** و**3 «أصداف متقدمة»** و**صفحتَي تفعيل متداخلتين**. الهدف: تعيين **canonical** لكل وظيفة، وتحويل المكرّر إلى merge/redirect/tab/deep-link **بلا حذف أعمى**.

---

## 1. خريطة HR Navigation المقترحة (canonical IA)

إعادة تنظيم الـ9 مجموعات الحالية إلى بنية وظيفية واضحة:

| القسم | المحتوى canonical | يستوعب (دمج) |
|------|-------------------|---------------|
| **1. مركز HR** | `/hr` (Command Center) + `/hr/services` | — |
| **2. الموظفون** | `/employees` + ملف 360 (`/employees/:id`) | يمتص أغلب «صفحات tab» (انظر HR-REV-6) |
| **3. التفعيل والاكتمال** | لوحة تفعيل موحّدة | `employee-activation` + `onboarding-review` 🚩 |
| **4. الحضور والانضباط** | `/hr/attendance` + الورديات + الأعذار + الوقت الإضافي | `shifts`+`shifts/management` 🚩 |
| **5. الإجازات** | `/hr/leaves` + سلاسل الموافقات + العطل | `leaves`+`leaves/management` 🚩 |
| **6. الرواتب والتكلفة** | `/hr/payroll` + المكونات + السلف + المكافأة + WPS + الاستحقاقات | — |
| **7. السياسات والامتثال** | مركز موحّد (HR-REV-7) | `violations`+`management`+`escalation`+`auto-detection`+`regulation` 🚩 |
| **8. الحركات الوظيفية** | `transfers` + `exit` + المنصب/الترقية | — |
| **9. الأدوار والصلاحيات البشرية** | تبويب 360 «الأدوار» + لوحة وصول (HR-REV-1) | — |
| **10. التقارير** | turnover + attendance/reports + analytics | إزالة ازدواج «تقارير الحضور» |
| **11. الإعدادات** | سياسة الحضور + الفئات + العطل + الهيكل + الأوزان | `organization`+`structure`+`org-tree` 🚩 |

---

## 2. جدول الصفحات الحالية والقرار — ✅ مثبت

(القرارات النهائية محجوزة خلف ADRs؛ هذا الترشيح المبني على الكود. `M`=merge `R`=redirect `D`=deep-link-only `K`=keep)

### 2.1 عناقيد التكرار (أولوية الإغلاق)

| العنقود | الصفحات | canonical | القرار | ملاحظة |
|---------|---------|-----------|--------|--------|
| **الهيكل** 🚩 | `organization` · `organization/structure` · `org-tree` | **`org-tree`** (PR-7 «الموحّد») | الأخريان → `R`/tab | ADR-HR-02 |
| **المخالفات** 🚩 | `violations` · `violations/management` · `penalty-escalation` · `auto-detection` · `discipline/regulation` | **مركز امتثال** (HR-REV-7) | management→`M`؛ escalation/auto-detection→tab؛ regulation→`K`(سياسة) | ADR-HR-06 |
| **التفعيل** 🚩 | `employee-activation` · `onboarding-review` | **لوحة تفعيل واحدة** | onboarding→`M` كـtab/مرحلة | ADR لـHR-REV-3 |
| **الورديات** 🚩 | `shifts` · `shifts/management` | `shifts` | management→`M` | — |
| **الإجازات** 🚩 | `leaves` · `leaves/management` | `leaves` | management→`M` | — |
| **الأصداف المتقدمة** 🚩 | `performance/advanced` · `recruitment/advanced` · `training/advanced` | الصفحة الأساسية | →`M` كـtab أو إزالة (remove-candidate بعد تأكيد عدم الاستخدام) | recruitment/advanced مصنّفة خطأً تحت «التقارير» |

### 2.2 الصفحات القانونية (keep)

`/hr` · `/hr/services` · `/employees` · `/employees/:id` · `/hr/approvals` · `payroll` (+components/loans/gratuity/wps/accruals/salary-components) · `leaves` · `attendance` (+reports/field-tracking/qr-scanner/policy) · `overtime` · `excuse-requests` · `contracts` · `transfers` · `exit` · `recruitment` (+applications) · `training` · `performance` · `evaluation-360` · `idp` · `public-holidays` · `delegations` · `official-letters` · `expiring-documents` · `turnover-report` · `saudization` · `saudi-compliance` · `discipline/regulation`

### 2.3 redirect/back-compat (نفس المكوّن من مسارين)

| المسار | الهدف |
|--------|-------|
| `/hr/attendance-categories` | = `/admin/attendance-categories` |
| `/hr/scoring-weights` | ↔ `/admin/scoring-weights` |

### 2.4 deep-link-only (صحيح — لا تظهر في القائمة)

كل `*/create`، `*/edit`، `*/:id` (detail)، `discipline/memos/:id`، `employees/:id/score`، `evaluation-360/:id/{peer,upward}`، `evaluation-360/history/:employeeId`. **لا إجراء** سوى ضمان بقائها خارج القائمة.

### 2.5 صفحات «شكلية» مرشّحة للتحويل إلى tab (HR-REV-6)

`expiring-documents` (→ لوحة نواقص)، `delegations` (→ tab في الإجازات/360)، `accruals` (→ tab في الرواتب). **لا حذف**؛ تحويل عرضي فقط إن لم يكن لها تشغيل جماعي.

---

## 3. قاعدة منع التكرار (Anti-Duplication Rules)

1. **وظيفة تشغيلية واحدة ⇒ صفحة canonical واحدة.** أي صفحة ثانية لنفس الوظيفة تصبح redirect أو tab.
2. **إن كانت الخدمة جزءًا من ملف الموظف (360) ولا تشغيل جماعي لها ⇒ لا صفحة قائمة مستقلة** (تصبح tab/deep-link).
3. **السياسة ≠ الواقعة ≠ الجزاء** ⇒ لا تُدمج في صفحة واحدة لمجرد التشابه (HR-REV-7).
4. **كل عنصر قائمة يجب أن يفتح ويضيف قرارًا/عرضًا مستقلًا** — لا روابط تؤدي لنفس المحتوى.
5. **«صدفة متقدمة» ليست وظيفة** — تُدمج كـtab «متقدم» داخل الصفحة الأساسية أو تُزال.
6. **لا تشابه اسم = نفس الوظيفة:** `saudization` (نطاقات) ≠ `saudi-compliance` (WPS/مدد) ⇒ تبقيان منفصلتين.

---

## 4. قائمة الـPRs العلاجية الصغيرة المقترحة

> ترتيب التنفيذ بعد اعتماد ADRs. كل PR: redirect قبل أي إزالة + smoke.

1. **الهيكل** (ADR-HR-02): اعتماد `org-tree` canonical؛ `organization`+`structure` → redirect إليه أو دمج كـtabs. smoke: المسارات القديمة تُعيد التوجيه (لا 404).
2. **الورديات/الإجازات**: دمج `*/management` في الصفحة الأساسية كـtab؛ redirect المسار القديم.
3. **الأصداف المتقدمة**: دمج `performance/advanced`·`recruitment/advanced`·`training/advanced` كـtab «متقدم»؛ تصحيح تصنيف recruitment/advanced خارج «التقارير».
4. **التفعيل**: توحيد `employee-activation`+`onboarding-review` (منسّق مع HR-REV-3).
5. **المخالفات** (مع HR-REV-7): دمج `management`؛ تحويل `escalation`/`auto-detection` إلى tabs في مركز الامتثال.
6. **إزالة ازدواج عرض «تقارير الحضور»** بين مجموعتَي الحضور والتقارير.

---

## 5. قواعد القبول والممنوعات (تأكيد #2221)

- ✅ **لا حذف route بلا redirect** إن كان مستخدمًا/مرجعيًا (bookmark/print/notification deep-link).
- ✅ **لا دمج وظيفتين مختلفتين** لتشابه الاسم.
- ✅ **لا إبقاء صفحة لمجرد وجودها** — كل بقاء له مبرر تشغيلي.
- ✅ **لا بناء صفحات جديدة** قبل إغلاق التكرار القائم.
- smoke لكل دمج/redirect/تحويل يثبت السلوك.

---

## 6. ADRs المرتبطة

| # | القرار | الحالة |
|---|--------|--------|
| ADR-HR-02 | canonical الهيكل = `org-tree` ومالكه | 🟡 جزئي: القائمة وُحّدت (مدخل واحد→org-tree، 2026-06-14). متابعة: org-tree لا يغطّي «المناصب» (organization) و«العلاقات» (organization-structure) — تُنقَل كتبويبات قبل retire الصفحتين (تبقيان deep-link حاليًا). |
| ADR-HR-06 | نموذج مركز الامتثال (HR-REV-7) | مفتوح |
| ADR-HR-11 | مصير «الأصداف المتقدمة» (دمج/إزالة) | مفتوح |
| ADR-HR-12 | توحيد لوحتَي التفعيل (HR-REV-3) | مفتوح |

— نهاية HR-REV-2 —
