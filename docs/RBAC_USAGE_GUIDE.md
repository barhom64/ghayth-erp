# RBAC v2 — دليل الاستخدام العملي (Usage Guide)

> دليل خطوة بخطوة لاستخدام نظام الصلاحيات الطبقي. يشمل سيناريوهات واقعية، API calls، والـUI الإداري.

## الفهرس

1. [البدء — هيكلة شركة جديدة في 5 دقائق](#1-البدء)
2. [إنشاء أدوار مخصّصة](#2-إنشاء-أدوار-مخصّصة)
3. [إخفاء الحقول الحساسة](#3-إخفاء-الحقول-الحساسة)
4. [تطبيق سقوف اعتماد مالية](#4-تطبيق-سقوف-اعتماد-مالية)
5. [قواعد فصل المهام (SoD)](#5-قواعد-فصل-المهام-sod)
6. [شروط ABAC الديناميكية](#6-شروط-abac-الديناميكية)
7. [JIT — صلاحية مؤقتة بطلب موافقة](#7-jit-elevation)
8. [تشخيص رفض طلب](#8-تشخيص-رفض-طلب)
9. [مرجع API](#9-مرجع-api)

---

## 1. البدء

### السيناريو
شركة سعودية جديدة "مؤسسة النخيل" تنضمّ إلى النظام. المسؤول يفتح `/admin` لأول مرة.

### الخطوة 1 — التحقق أن الـauto-migration نجح

عند أول إقلاع، النظام يُترجم الـ14 دور القديم إلى v2 تلقائياً.

```bash
# Backend logs at boot:
[INFO] RBAC v2: feature catalog synced (107 features)
[INFO] RBAC v2: legacy roles auto-migrated (14 roles, 1100+ grants, 50 users bound)
```

### الخطوة 2 — افتح "الصلاحيات الطبقية" tab

```
/admin → الصلاحيات الطبقية
```

**ما تراه:**
- قائمة 14 دور (المالك، المدير العام، مدير الموارد، ... الموظف)
- شجرة 107 ميزة (HR.الإجازات، Finance.الفواتير، Properties.المستأجرون، ...)

### الخطوة 3 — تطبيق قالب جاهز (الأسرع)

```
[قوالب] → اختر "كاتب موارد بشرية" → 
  المفتاح: hr_clerk
  الاسم: كاتب HR
[تطبيق القالب]
```

✅ تم إنشاء دور جاهز: 6 صلاحيات + 8 سياسات حقول (الراتب مخفي، الهوية مُقنَّعة).

### الخطوة 4 — إسناده لموظف

```
[إسناد v2] → ابحث عن "سارة" → اختر "كاتب HR" → [إسناد]
```

✅ سارة تستطيع الآن دخول نظام HR برؤية محدودة.

---

## 2. إنشاء أدوار مخصّصة

### السيناريو
نريد دور "مشرف فرع" يرى موظفي الفرع، يعتمد إجازاتهم، يطّلع على المالية بدون اعتماد.

### الخطوة 1 — إنشاء الدور

```bash
POST /api/rbac/v2/roles
{
  "roleKey": "branch_supervisor",
  "labelAr": "مشرف فرع",
  "level": 60,
  "color": "#7c3aed"
}
→ 201 { "id": 27 }
```

### الخطوة 2 — تحديد الصلاحيات

في الـUI: اختر الدور من القائمة الجانبية، ثم في tab "الصلاحيات":

| الميزة | الإجراءات | النطاق |
|---|---|---|
| `hr.employees` | view, list | branch |
| `hr.leaves` | view, list, approve | branch |
| `hr.attendance` | view, list | branch |
| `finance.invoices` | view, list | branch |
| `finance.reports` | view, list, export | branch |

```bash
PUT /api/rbac/v2/roles/27/grants
{
  "grants": [
    { "featureKey": "hr.employees", "actions": ["view","list"], "scope": "branch" },
    { "featureKey": "hr.leaves", "actions": ["view","list","approve"], "scope": "branch" },
    { "featureKey": "hr.attendance", "actions": ["view","list"], "scope": "branch" },
    { "featureKey": "finance.invoices", "actions": ["view","list"], "scope": "branch" },
    { "featureKey": "finance.reports", "actions": ["view","list","export"], "scope": "branch" }
  ]
}
```

✅ المشرف يرى فرعه فقط، يعتمد إجازات موظفيه، يطّلع على المالية لكن لا يعدّل.

---

## 3. إخفاء الحقول الحساسة

### السيناريو
"كاتب HR" يجب ألا يرى الراتب أو IBAN، ويرى الهوية مُقنَّعة فقط (10****12).

### الإعداد

```bash
PUT /api/rbac/v2/roles/27/field-policies
{
  "policies": [
    { "featureKey": "hr.employees", "fieldName": "salary",      "mode": "hidden"   },
    { "featureKey": "hr.employees", "fieldName": "bankAccount", "mode": "hidden"   },
    { "featureKey": "hr.employees", "fieldName": "iban",        "mode": "hidden"   },
    { "featureKey": "hr.employees", "fieldName": "nationalId",  "mode": "masked"   },
    { "featureKey": "hr.employees", "fieldName": "phone",       "mode": "masked"   }
  ]
}
```

### النتيجة

**كاتب HR يطلب موظف:**
```json
GET /api/employees/45 →
{
  "name": "أحمد محمد",
  "phone": "05****56",
  "nationalId": "10****12"
  // salary, bankAccount, iban: غير موجودة
}
```

**المدير المالي يطلب نفس الموظف:**
```json
{
  "name": "أحمد محمد",
  "phone": "0501234556",
  "nationalId": "1012345612",
  "salary": 12000,
  "bankAccount": "SA1234...",
  "iban": "SA1234..."
}
```

**نفس الـEndpoint، نتائج مختلفة حسب الدور.**

### Modes المتاحة

| Mode | الوصف |
|---|---|
| `visible` (افتراضي) | الحقل ظاهر بقيمته |
| `masked` | يرى `12***34` |
| `hidden` | الحقل غير موجود في الـJSON |
| `readonly` | يرى لكن لا يستطيع تعديل |
| `editable` | (override) يستطيع تعديل حتى لو الحقل readonly في طبقة أخرى |

---

## 4. تطبيق سقوف اعتماد مالية

### السيناريو
- محاسب فرع: يعتمد فواتير حتى 10,000 ر.س
- مدير فرع: يعتمد حتى 50,000 ر.س
- المدير المالي: حتى 500,000 ر.س مع dual-control
- المالك: بلا حد

### الإعداد

```bash
PUT /api/rbac/v2/roles/{branch_accountant}/approval-limits
{
  "limits": [
    { "featureKey": "finance.invoices", "action": "approve",
      "currency": "SAR", "maxAmount": 10000,
      "requiresDualControl": false }
  ]
}
```

### تجربة الاعتماد

**فاتورة 8,000 ر.س:**
```bash
POST /api/finance/invoices/445/approve
→ 200 OK ✓
```

**فاتورة 15,000 ر.س:**
```bash
POST /api/finance/invoices/446/approve
→ 403
{
  "error": "المبلغ (15000 SAR) يتجاوز سقف اعتمادك (10000 SAR)",
  "code": "APPROVAL_LIMIT_EXCEEDED",
  "fix": "اطلب من مدير أعلى",
  "meta": { "approvalLimit": { "max": 10000, "currency": "SAR" } }
}
```

### الـDual Control

```bash
"requiresDualControl": true
```

عند الاعتماد، يُطلب توقيع شخصين قبل أن تنتقل الفاتورة إلى "approved". (هذا يُطبَّق في الـworkflow layer، الـRBAC يُمرّر العلامة فقط.)

---

## 5. قواعد فصل المهام (SoD)

### القواعد المُسبَقة (Seeded)

```
finance_journal_create_approve  : finance.journal:create ↔ finance.journal:approve  (critical)
finance_invoice_create_approve  : finance.invoices:create ↔ finance.invoices:approve (high)
finance_purchase_create_approve : finance.purchase:create ↔ finance.purchase:approve (high)
hr_payroll_calculate_approve    : hr.payroll.runs:create ↔ hr.payroll.runs:approve  (critical)
hr_employee_create_self_approve : hr.employees:create ↔ hr.employees:approve         (medium)
```

### السلوك في الإنتاج

**سعد محاسب لديه `finance.journal:create` و `finance.journal:approve`:**

```bash
# الخطوة 1
POST /api/finance/expenses
{ "description": "صيانة", "amount": 3500 }
→ 201 { "id": 77, "createdBy": سعد }

# الخطوة 2 — يحاول اعتماد ما أنشأه
POST /api/finance/expenses/77/approve
→ 403
{
  "error": "قاعدة فصل المهام (فصل صلاحية إنشاء واعتماد القيد المحاسبي)
            تمنع نفس الشخص من create و approve على نفس السجل",
  "code": "SOD_VIOLATION",
  "fix": "لا يمكن لمنشئ السجل إجراء \"approve\" عليه — اطلب من شخص آخر"
}

# الخطوة 3 — زميله أحمد يعتمد قيداً سعد أنشأه
[أحمد] POST /api/finance/expenses/77/approve
→ 200 OK ✓ (الاعتماد بشخص ثاني = ما تريده SoD)
```

### قاعدة SoD مخصّصة

```bash
POST /api/rbac/v2/sod
{
  "ruleKey": "vendor_setup_payment",
  "labelAr": "فصل إعداد المورد عن الدفع",
  "featureA": "finance.vendors", "actionA": "create",
  "featureB": "finance.invoices", "actionB": "approve",
  "severity": "critical"
}
```

---

## 6. شروط ABAC الديناميكية

### السيناريو 1 — المدير لا يعتمد إلا الفواتير في حالة "draft"

```bash
PUT /api/rbac/v2/roles/27/grants
{
  "grants": [{
    "featureKey": "finance.invoices",
    "actions": ["approve"],
    "scope": "branch",
    "conditions": { "statusIn": ["draft"] }
  }]
}
```

**النتيجة:**
```bash
# فاتورة status="draft"
POST /approve → 200 ✓

# فاتورة status="submitted"
POST /approve → 403
{ "code": "STATUS_NOT_ALLOWED",
  "error": "حالة السجل (submitted) خارج الحالات المسموحة (draft)" }
```

### السيناريو 2 — الاعتماد فقط في ساعات الدوام

```jsonc
"conditions": {
  "businessHours": { "from": 8, "to": 17 },
  "daysOfWeek": [0, 1, 2, 3, 4]   // أحد..خميس
}
```

**النتيجة:**
- الجمعة 14:00 → 403 `WRONG_DAY_OF_WEEK`
- الأحد 19:00 → 403 `OUTSIDE_BUSINESS_HOURS`
- الأحد 10:00 → ✅

### السيناريو 3 — قفل الطوارئ

```jsonc
"conditions": { "emergencyDisabled": true }
```

عند نشاط `emergency=true` على مستوى النظام، كل الإجراءات بهذا الشرط تُجمَّد فوراً.

### السيناريو 4 — مزج عدة شروط

```jsonc
"conditions": {
  "statusIn": ["pending"],
  "amountMax": 50000,
  "ownDepartment": true,
  "businessHours": { "from": 8, "to": 18 }
}
```

كل الشروط AND-combined — أي شرط يفشل → الـgrant يُرفض.

---

## 7. JIT Elevation

### السيناريو
مهندس مشاريع يحتاج عاجلاً رؤية ميزانية مشروع لساعة واحدة.

### الخطوة 1 — الموظف يطلب

```bash
POST /api/rbac/v2/jit/request
{
  "featureKey": "finance.budget",
  "action": "view",
  "scope": "company",
  "justification": "أحتاج مراجعة ميزانية مشروع الواحة لإعداد تقرير الأداء",
  "requestedMinutes": 60
}
→ 201 { "id": 12, "status": "pending" }
```

**حالياً الموظف لا يستطيع:**
```bash
GET /api/finance/budget → 403 FORBIDDEN
```

### الخطوة 2 — المدير يراجع

```bash
GET /api/rbac/v2/jit/pending →
[
  {
    "id": 12, "userId": 5, "userName": "سامي",
    "feature_key": "finance.budget", "action": "view",
    "justification": "أحتاج مراجعة ميزانية مشروع الواحة...",
    "requested_minutes": 60, "createdAt": "2026-05-09T10:00:00Z"
  }
]
```

### الخطوة 3 — اعتماد

```bash
POST /api/rbac/v2/jit/12/approve
{ "reason": "موافق - تقرير الأداء الربع الثاني" }
→ 200 { "ok": true }
```

**ما حدث في DB:**
```sql
INSERT INTO rbac_user_grants (
  userId=5, companyId=1,
  feature_key='finance.budget', action='view',
  scope='company', type='grant',
  expires_at=NOW() + 60 minutes,
  reason='JIT #12: أحتاج مراجعة...',
  grantedBy=99
);

UPDATE rbac_jit_requests SET status='approved', expires_at=... WHERE id=12;
```

### الخطوة 4 — الموظف يستخدم الصلاحية

```bash
GET /api/finance/budget → 200 OK ✓
```

### الخطوة 5 — بعد ساعة

- الـgrant لا يزال في DB لكن `expires_at` قد مرّ
- المحرّك يستثنيه تلقائياً (`expires_at IS NULL OR expires_at > NOW()`)
- بعد 7 أيام: cron `rbac_v2_expired_grants_cleanup` يحذفه ويُحدّث JIT status إلى `expired`

```bash
GET /api/finance/budget → 403 FORBIDDEN (انتهت الصلاحية المؤقتة)
```

### الـUser يلغي طلبه قبل الاعتماد

```bash
POST /api/rbac/v2/jit/12/cancel → 200 OK
```

---

## 8. تشخيص رفض طلب

### الموظف يقول "النظام لا يسمح لي"

افتح `/admin` → "الصلاحيات الطبقية" → [محاكاة]:

```
رقم المستخدم: 5
الميزة: hr.payroll.runs
الإجراء: view
[تشغيل المحاكاة]
```

**النتيجة:**
```json
{
  "target": { "userName": "سامي", "role": "employee" },
  "result": {
    "allowed": false,
    "reasonAr": "لا تملك صلاحية العرض على تشغيلات الرواتب",
    "code": "FORBIDDEN",
    "diagnostics": {
      "matchedRoleIds": [],
      "grantedActions": [],
      "requiredFix": "اطلب من المسؤول منح دورك صلاحية hr.payroll.runs:view"
    }
  }
}
```

### عرض كل الصلاحيات الفعّالة

في نفس الـDialog، tab "الصلاحيات الفعّالة الكاملة":

```
رقم المستخدم: 5
[عرض الصلاحيات]
```

**النتيجة:**
```
الأدوار: ★ موظف
الصلاحيات (12):
  hr.attendance.checkin    [create]              [self]    موظف
  hr.leaves.my             [view,list,create]    [self]    موظف
  hr.payroll.my_payslip    [view,list,export]    [self]    موظف
  ... إلخ
```

### الـsecurity_log لكل الرفض

```sql
SELECT path, method, "requiredPerms", reason, "createdAt"
FROM security_log
WHERE "userId" = 5
ORDER BY "createdAt" DESC
LIMIT 20;
```

كل denied request مسجَّل: المسار، الصلاحية الناقصة، السبب، الـIP، الوقت.

---

## 9. مرجع API

### Roles
```
GET    /api/rbac/v2/features              قائمة كل الميزات
GET    /api/rbac/v2/roles                 أدوار الشركة + القوالب
POST   /api/rbac/v2/roles                 إنشاء دور
PATCH  /api/rbac/v2/roles/:id             تعديل metadata
DELETE /api/rbac/v2/roles/:id             حذف دور
GET    /api/rbac/v2/roles/:id/grants      صلاحيات الدور
PUT    /api/rbac/v2/roles/:id/grants      استبدال الصلاحيات
GET    /api/rbac/v2/roles/:id/field-policies
PUT    /api/rbac/v2/roles/:id/field-policies
GET    /api/rbac/v2/roles/:id/approval-limits
PUT    /api/rbac/v2/roles/:id/approval-limits
GET    /api/rbac/v2/roles/:id/history     سجل التغييرات
POST   /api/rbac/v2/roles/:id/clone       نسخ دور
```

### Templates
```
GET    /api/rbac/v2/templates             قوالب جاهزة
POST   /api/rbac/v2/templates/:id/apply   تطبيق على شركتك
```

### Users + Assignment
```
GET    /api/rbac/v2/users?q=...           بحث المستخدمين
GET    /api/rbac/v2/users/:id/roles       أدوار المستخدم
POST   /api/rbac/v2/users/:id/roles       إسناد دور
DELETE /api/rbac/v2/users/:id/roles/:roleId
GET    /api/rbac/v2/users/:id/effective   صلاحياته الفعّالة الكاملة
```

### Simulation
```
POST   /api/rbac/v2/simulate
       { userId, feature, action }
```

### SoD
```
GET    /api/rbac/v2/sod                   قواعد + انتهاكات
POST   /api/rbac/v2/sod                   قاعدة جديدة
PATCH  /api/rbac/v2/sod/:id               تعديل / تفعيل
DELETE /api/rbac/v2/sod/:id
```

### JIT
```
POST   /api/rbac/v2/jit/request           طلب موظف
GET    /api/rbac/v2/jit/my                طلباتي
GET    /api/rbac/v2/jit/pending           قائمة المراجعة
POST   /api/rbac/v2/jit/:id/approve
POST   /api/rbac/v2/jit/:id/reject
POST   /api/rbac/v2/jit/:id/cancel
```

---

## كل الـError codes

| Code | السبب | الحل |
|---|---|---|
| `AUTH_MISSING` | لا توكن | تسجيل الدخول |
| `AUTH_EXPIRED` | الجلسة منتهية | إعادة تسجيل |
| `FORBIDDEN` | لا توجد صلاحية | اطلب الصلاحية من الـadmin |
| `OUT_OF_SCOPE` | السجل خارج نطاق دورك | الدور `branch` لا يصل لفرع آخر |
| `STATUS_NOT_ALLOWED` | حالة السجل خارج statusIn | راجع الـconditions |
| `STATUS_BLOCKED` | الحالة في statusNotIn | السجل مغلق |
| `AMOUNT_EXCEEDS_CONDITION` | تجاوز amountMax | تجاوز الشرط على الميزانية |
| `APPROVAL_LIMIT_EXCEEDED` | تجاوز سقف الاعتماد | اطلب من مدير أعلى |
| `SOD_VIOLATION` | انتهاك فصل المهام | لا تعتمد ما أنشأت |
| `OUTSIDE_BUSINESS_HOURS` | خارج ساعات الدوام | جرّب في وقت العمل |
| `WRONG_DAY_OF_WEEK` | يوم غير مسموح | الجمعة/السبت ممنوعان |
| `IP_NOT_ALLOWED` | IP خارج الشبكة | استخدم شبكة المكتب |
| `EMERGENCY_LOCK` | النظام في حالة طوارئ | راجع المدير |
| `CONDITION_FAILED` | شرط ABAC فشل | راجع الـconditions في الدور |
| `UNKNOWN_FEATURE` | خطأ مطوّر | الـfeature غير في الكاتلوج |
| `UNKNOWN_ACTION` | خطأ مطوّر | الـaction غير متاح للميزة |

---

## نصائح للممارسة الجيدة

1. **ابدأ بالقوالب**: استنسخ قالباً وعدّله بدلاً من البناء من صفر.
2. **scope الأقل أفضل**: لا تمنح `company` إذا كانت `branch` تكفي.
3. **مَن يُنشئ لا يَعتمد**: كل approve action يستحق قاعدة SoD.
4. **JIT للحالات الاستثنائية**: لا تمنح صلاحية دائمة لشخص يحتاجها مرة في الشهر.
5. **راجع `security_log` أسبوعياً**: نمط الرفض يكشف الأدوار التي تحتاج تعديل.
6. **استخدم المحاكاة قبل التغيير**: "اعرض كـ مستخدم X" يكشف نتيجة التغيير قبل تطبيقه.
7. **لا تحذف الأدوار النظامية**: عطّلها بدلاً من ذلك (`isActive=false`).
8. **بدّل بانتظام**: time-bound grants لمَن يعمل على عقد محدد.
