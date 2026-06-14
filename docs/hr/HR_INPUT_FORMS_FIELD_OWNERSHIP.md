# HR-REV-5 — مراجعة نماذج الإدخال: ملكية الحقول

> **Issue:** [#2224](https://github.com/barhom64/ghayth-erp/issues/2224)
> **يبني على:** HR-REV-0 (§6) · HR-REV-3 (ملكية الحقول الموزّعة) · HR-REV-1 (visible-for)
> **الفرع:** `claude/wizardly-babbage-mgsv2i` · **التاريخ:** 2026-06-14
> **الحالة:** جرد ملكية حقول (read-only).

**مفتاح:** ✅ مثبت · 🚩 مشكلة · 🏛 قرار.

---

## 0. الملخص

20 نموذج `create/hr/*` + `employees-create`. الإشارات الحمراء الرئيسية (مثبتة HR-REV-0 §6): **4 نماذج كبيرة** بلا تجزئة، **حقول بمالك خاطئ** (بنك/إقامة/مركبة في إنشاء الموظف)، **لا «ملخص أثر قبل الحفظ»**، وتضارب `employeeId`↔`assignmentId`.

---

## 1. توصية لكل نموذج — ✅

| النموذج | حقول | حماية | التوصية |
|---------|:----:|:-----:|---------|
| `employees-create` | 46+ | ❌ | 🚩 **split** → wizard موزّع بالدور (HR-REV-3) |
| `leaves-create` | 9+8 | ❌ | **split**: طلب ذاتي ⟂ تفويض إداري |
| `training-create` | 15 | ❌ | **split**: ميتاداتا HR ⟂ محتوى LMS/تكلفة |
| `recruitment-create` | 14 | ❌ | **split**: ميتاداتا ⟂ محتوى تسويقي |
| `performance-create` | 11+6 | ❌ | **manager-owned** + كفاءات قابلة للإعداد |
| `violations-create` | 11 | ❌(خلفي) | **keep** (تصميم جيد Zod+مسودة) + إضافة perm ظاهر |
| `exit-create` | 9 | ✅ | **keep** (محمي جيدًا) |
| `loans-create` | 6–9 | ✅ | **payroll-owned** |
| `contracts-create` | 9 | ✅ | **keep** |
| `overtime-create` | 7–10 | ❌ | **manager-owned** |
| `payroll-create` | 4 | ❌ظاهر | **keep** (دفعة) + perm ظاهر |
| `evaluation-360-create` | 9+ | ❌ | **keep** |
| `applicants/attendance/excuse/shifts/*-edit` | صغيرة | ❌ | **keep** |

---

## 2. جدول ملكية الحقول — النماذج عالية الأثر

### 2.1 `employees-create` (🚩 الأهم) — أعمدة: حقل · مالك · مرئي لـ · إلزامي متى · مصدر افتراضي · أثر

| حقل | المالك الصحيح | مرئي لـ | إلزامي | الأثر |
|-----|---------------|---------|--------|-------|
| name/nationalId/nationality/phone | HR | HR | عند الإنشاء | إنشاء سجل |
| jobTitle/department/branch/manager | HR | HR | عند الإنشاء | تعيين + قالب (HR-REV-4) |
| positionId/categoryKey/team/project/costCenter | HR | HR | عند الإنشاء | ربط مؤسسي + سياسة حضور |
| salary/housing/transport | **الرواتب** 🚩 | الرواتب فقط | pending_payroll | قيد مالي |
| internalEmail/PBX | **الاتصالات** 🚩 | admin/comms | pending_service | توفير حساب |
| iqama/passport/visa/workPermit | **الوثائق** 🚩 | الوثائق | pending_documents | تحقق |
| bankName/account/iban | **المالية** 🚩 | المالية فقط | pending_payroll | حساب بنكي |
| vehicleId | **الأسطول** 🚩 (طلب) | عند استحقاق القالب | pending_service | طلب تخصيص |
| createCustodyAccount | **المستودع** 🚩 (طلب) | عند القالب | pending_service | طلب صرف |
| emergencyContact/phone | الموظف | self | pending_employee | — |

🚩 **خلاصة:** ~21 حقلًا يملكها غير HR ⇒ يُنقَل إلى التفعيل الموزّع (HR-REV-3). HR يحتفظ بالحد الأدنى فقط.

### 2.2 `leaves-create` — التفويض يخصّ الإدارة لا الموظف

| حقل | المالك | ملاحظة |
|-----|--------|--------|
| leaveTypeId/startDate/endDate/reason | الموظف (self) | طلب ذاتي |
| reliefOfficer/contactDuringLeave | الموظف | اختياري |
| **enableDelegation + delegFeatures** | 🚩 **مدير/HR** | تفويض صلاحيات = قرار إداري، يُفصَل |

### 2.3 `exit-create` (نموذج جيد مرجعي)
✅ يحمل `sensitivePerm="hr.exit:create"`، يعرض حساب مكافأة تقديري (مواد 84–85)، تحذير شرطي لـ«termination». **نموذج قدوة**: حماية + ملخص أثر + سياق.

---

## 3. قواعد UX الإلزامية (تأكيد #2224)

1. لا يظهر حقل لا يخصّ الدور الحالي (يرتبط بـ visible-for في HR-REV-1).
2. لا يظهر حقل لا يستطيع المستخدم حفظه (backend authority).
3. لا يكرّر النموذج حقلًا يملؤه الموظف/مدير القسم/الرواتب.
4. **كل نموذج له summary قبل الحفظ يبيّن الآثار** 🚩 (مفقود في الكبيرة).
5. كل submit يوضّح ما سيتغيّر وما سيُنشأ من مهام.

---

## 4. مشكلات مشتركة — ✅

- 🚩 **`employeeId` ↔ `assignmentId`**: النماذج تخزّن `employeeId` والخلفية تتوقّع `assignmentId` (Wave-1/B قيد التنفيذ) — يحتاج إغلاقًا موحّدًا.
- 🚩 **بنوك hardcoded** (11) في `employees-create` → جدول إعداد.
- 🚩 **كفاءات `performance-create` hardcoded** (6) → قابلة للإعداد.
- 🚩 **غياب «ملخص أثر»** في النماذج الكبيرة.

---

## 5. القبول والممنوعات
- جرد الحقول + توصية لكل نموذج (keep/split/wizard/self-service/manager-owned/payroll-owned) ✅ أعلاه.
- ممنوع: إضافة حقول قبل معرفة مالكها · حقول بلا أثر/سجل · حفظ حسّاس بلا audit · نموذج واحد يفعل كل شيء.

— نهاية HR-REV-5 —
