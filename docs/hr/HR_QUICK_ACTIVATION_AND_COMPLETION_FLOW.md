# HR-REV-3 — التفعيل السريع وخطة تفعيل الموظف الموزّعة

> **Issue:** [#2222](https://github.com/barhom64/ghayth-erp/issues/2222)
> **يبني على:** HR-REV-0 (§6 النموذج العملاق) · HR-REV-1 (دورة حياة الوصول) · يتقاطع مع HR-REV-4 (القوالب) و HR-REV-5 (الحقول)
> **الفرع:** `claude/wizardly-babbage-mgsv2i` · **التاريخ:** 2026-06-14
> **الحالة:** تصميم وتقرير flow (read-only). لا كود قبل الاعتماد.

**مفتاح:** ✅ مثبت من الكود · 🏛 قرار · 🔴 فجوة · 🚩 يخالف الغاية.

---

## 0. الملخص والحالة الراهنة (مثبتة)

| الحقيقة | الدليل | الأثر |
|---------|--------|-------|
| الموظف يُنشأ بحالة `active` فورًا | `schema/index.ts` (employees `status` default `"active"`) | 🚩 لا بوابة `pending_activation` |
| النموذج عملاق (46+ حقلًا، 5 خطوات) | `employees-create.tsx` (HR-REV-0 §6) | 🚩 عكس «HR يدخل الحد الأدنى» |
| مهام onboarding = 4 مهام hardcoded مسطّحة | `employees.ts:960` (`onboardingTasks = [...]`)، جدول `onboarding_tasks` | 🔴 لا خطة موزّعة بمالك/SLA |
| دورة الحياة (PR-8) لما بعد التعيين فقط | `employeeLifecycleEngine.ts` (active/probation/suspended/terminated/...) | 🔴 لا حالات اكتمال قبل التفعيل |

**الخلاصة:** الأساس موجود (lifecycle ledger + onboarding_tasks + wizard ذرّي) لكن **النموذج التشغيلي مقلوب**: HR يُجبر على ملء كل شيء، والموظف يصبح `active` فورًا. المطلوب **قلبه**: حد أدنى → `pending_activation` → اكتمال موزّع → `active`.

---

## 1. حالات التفعيل المقترحة (Activation State Machine)

تُضاف **قبل** حالات دورة الحياة الحالية (التي تبدأ من `active`):

```
draft
  → pending_activation              (حُفظ الحد الأدنى)
    → pending_employee_completion     (الموظف يكمل بياناته)
    → pending_department_completion   (مدير القسم يؤكد التشغيل)
    → pending_payroll_completion      (الرواتب: الراتب/البدلات/البنك)
    → pending_documents_verification  (الوثائق: عقد/هوية/إقامة/رخص)
    → pending_service_fulfillment     (المستودع/الأسطول/الصلاحيات)
    → ready_for_hr_review             (HR يراجع ويغلق)
      → active                        (مفعّل)
      → returned_for_correction       (يعود للجهة الناقصة)
      → rejected                      (يُلغى)
```

> الحالات الفرعية (employee/department/payroll/documents/service) **متوازية لا تسلسلية** — تُتابع عبر «خطة تفعيل» واحدة، والانتقال إلى `ready_for_hr_review` لا يحدث إلا باكتمال كل البنود الإلزامية للقالب (HR-REV-4).

🏛 **D:** هذه الحالات تُخزَّن كـ`activation_status` منفصل عن `employees.status` (الذي يبقى `pending_activation`/`active`)، ويُدار عبر `employee_lifecycle_events` نفسه (إعادة استخدام محرّك PR-8) لا محرّك جديد.

---

## 2. الحد الأدنى للتفعيل السريع (Quick Activation) — ما يدخله HR فقط

| الحقل | إلزامي | المصدر |
|------|:------:|--------|
| الاسم | ✅ | HR |
| الجوال/البريد | ✅ | HR |
| الفرع | ✅ | HR |
| الإدارة/القسم | ✅ | HR |
| المسمى الوظيفي | ✅ | HR (🏛 يعتمد ADR-HR-01) |
| تاريخ المباشرة | ✅ | HR |
| المدير المباشر | ✅ | HR |

⇒ يُحفظ الموظف بحالة `pending_activation`، ويُولّد النظام **خطة تفعيل** تلقائيًا. كل الحقول الأخرى (بنك/إقامة/PBX/عهدة/مركبة...) **تنتقل إلى مُلّاكها** (§3) بدل النموذج العملاق.

---

## 3. جدول ملكية الحقول (من يكمل ماذا) — مدخل HR-REV-5

| المجموعة | المالك | الحالة الفرعية |
|----------|--------|----------------|
| بيانات شخصية/بنكية ذاتية، صورة، طوارئ | **الموظف** | pending_employee_completion |
| المهام، موقع العمل، احتياجات التشغيل، تأكيد المباشرة | **مدير القسم** | pending_department_completion |
| الراتب، البدلات، الحساب البنكي، الاشتراك المالي | **الرواتب** | pending_payroll_completion |
| العقد، الهوية، الإقامة، الرخص، التحقق | **الوثائق** | pending_documents_verification |
| صرف العهد حسب سياسة الوظيفة | **المستودع** (خدمة) | pending_service_fulfillment |
| تخصيص مركبة عند الاستحقاق | **الأسطول** (خدمة) | pending_service_fulfillment |
| الحساب والصلاحيات حسب المسمى/النطاق | **مسؤول الصلاحيات** | pending_service_fulfillment |
| مراجعة وإغلاق التفعيل | **HR** | ready_for_hr_review |

> ✅ تطبيق مباشر للقاعدة الحاكمة (HR-REV-0 §2): العهدة/المركبة **خدمة خادمة تُطلب**، لا حقل يملكه HR.

---

## 4. توليد المهام حسب المسمى والفئة (يعتمد HR-REV-4)

بدل 4 مهام hardcoded، تُولَّد المهام من **Job Activation Profile** (HR-REV-4): كل مهمة لها **مالك + deadline + سبب + بند إلزامي/اختياري**.

| المثال | مهام مُولّدة (عيّنة) |
|--------|---------------------|
| **سائق** | رخصة قيادة (وثائق) · سياسة حضور GPS (HR) · طلب تخصيص مركبة (أسطول) · عهدة جهاز/شريحة (مستودع) · مركز تكلفة (الرواتب) |
| **محاسب** | صلاحية مالية مقيّدة (صلاحيات) · ربط مركز تكلفة · لا مركبة/لا GPS |
| **موظف إداري** | حساب + بريد (صلاحيات) · عقد/هوية (وثائق) · راتب (رواتب) |

🏛 يُمنع جعل العهدة/المركبة checkbox يدوي؛ تُولَّد من القالب كـ**طلب خدمة** بوثيقة صرف/استلام.

---

## 5. لوحة قيد التفعيل (Activation Board) — مدخل HR-REV-6

توحيد `employee-activation` + `onboarding-review` (HR-REV-2 §2.1) في لوحة واحدة تعرض لكل موظف قيد التفعيل:
- الناقص (أي بند/جهة)
- المسؤول الحالي
- منذ متى (عمر الحالة)
- هل تجاوز SLA؟

---

## 6. الإشعارات والتدقيق

- كل بند خطة يولّد **مهمة + إشعار** للجهة المالكة (إعادة استخدام `onboarding_tasks` + notifications + approval-inbox).
- كل انتقال حالة يُسجّل **audit + event** عبر `employee_lifecycle_events` (PR-8) — لا انتقال صامت.

---

## 7. نموذج البيانات المقترح (إعادة استخدام لا بناء جديد)

| الكيان | المصدر | التعديل |
|--------|--------|---------|
| `activation_status` | عمود جديد على `employees` أو حقل في lifecycle | إضافة |
| خطة التفعيل | `onboarding_tasks` (موجود) | إضافة أعمدة: `ownerRole`, `dueDate`(موجود), `reason`, `mandatory`, `serviceType` |
| الانتقالات | `employee_lifecycle_events` (موجود PR-8) | إضافة حالات pre-active |
| القالب | Job Activation Profile (HR-REV-4) | جديد (مهمة 4) |

---

## 8. endpoints المطلوبة (تقديري)

- `POST /employees/quick-activate` (الحد الأدنى → pending_activation + توليد الخطة)
- `GET /employees/:id/activation-plan` · `PATCH /activation-plan/:taskId` (إكمال بند)
- `POST /employees/:id/activation/submit-review` · `/approve` · `/return` · `/reject`
- `GET /hr/activation-board` (اللوحة + SLA)

---

## 9. القبول والممنوعات

- smoke: رحلة **موظف إداري** + **سائق** كاملة من الحد الأدنى إلى `active`.
- ✅ ممنوع إجبار HR على كل البيانات · ممنوع `active` قبل اكتمال الحد الأدنى المعتمد · ممنوع عهدة/مركبة كـcheckbox · ممنوع مهمة بلا مالك/deadline/سبب.

---

## 10. التبعيات

| التبعية | يحجب |
|---------|------|
| 🏛 ADR-HR-01 (canonical المسمى الوظيفي) | الحد الأدنى + توليد المهام |
| HR-REV-4 (Job Activation Profiles) | §4 توليد المهام |
| ADR-HR-12 (توحيد لوحتَي التفعيل) | §5 اللوحة |

— نهاية HR-REV-3 —
