# المحاسبة التحليلية الديناميكية ومنع الترحيل على الحسابات الرئيسية

## Issue #2197 — القاعدة المعتمدة

> GL ثابت ونظيف + Subledger / Analytic Accounts ديناميكي + أبعاد تشغيلية إلزامية + فتح تلقائي + ربط لاحق + منع مطلق للترحيل على الحسابات الرئيسية.

---

## المبدأ الأساسي

نظام غيث **لا يطلب من المستخدم اختيار رقم حساب**. المستخدم يختار:
- مورد / عميل / وكيل / موظف / خزنة / بنك / فرع / موسم
- والنظام يترجم ذلك تلقائياً إلى الحساب الرقابي + الحساب التحليلي + القيد الصحيح.

---

## الطبقات

```
┌─────────────────────────────────────────────────────┐
│  UI / API                                           │
│  → يعرض فقط allowPosting=true في شاشات التشغيل    │
└──────────────────────┬──────────────────────────────┘
                       │
┌──────────────────────▼──────────────────────────────┐
│  resolveAccountCode / getAccountCodeFromMapping     │
│  → mapping → intent search → fallback              │
│  → JOIN يتحقق allowPosting=true                    │
│  → assertPostableAccount() قبل إنشاء القيد         │
└──────────────────────┬──────────────────────────────┘
                       │
┌──────────────────────▼──────────────────────────────┐
│  createJournalEntry / postJournalEntry              │
│  → يتحقق allowPosting قبل INSERT                   │
│  → يرفض أي حساب غير قابل بـ ValidationError       │
└──────────────────────┬──────────────────────────────┘
                       │
┌──────────────────────▼──────────────────────────────┐
│  analytic_accounts (جديد)                          │
│  → يُنشأ تلقائياً لكل عملية                       │
│  → needsLinking=true عند غياب الطرف               │
│  → مركز التصنيف يربطه لاحقاً                      │
└─────────────────────────────────────────────────────┘
```

---

## الحسابات الرقابية (GL) — ثابتة

| الغرض | المثال |
|--------|--------|
| ذمم العملاء | 1200 |
| ذمم الموردين | 2100 |
| تكلفة التأشيرات | 5xxx |
| رصيد مسبق لدى مزود | 1xxx |
| إيرادات العمرة | 4xxx |
| عهد الموظفين | 1xxx |

---

## الحسابات التحليلية — ديناميكية (جديد)

جدول `analytic_accounts` يحمل الأبعاد التشغيلية:

| البعد | الوصف |
|-------|--------|
| partyId + partyRole | مورد / وكيل / عميل / موظف |
| seasonId | موسم العمرة 1447 / 1448 |
| branchId | الفرع |
| employeeId | الموظف صاحب العهدة |
| custodyId | رقم العهدة |
| sourceModule | umrah / vendor / custody / payroll |
| importBatchId | ملف الاستيراد |
| needsLinking | يحتاج ربطاً لاحقاً |

---

## مسار العمرة

```
استيراد مشتريات تأشيرات من نسك
├── مورد معروف → يُنشأ analytic_account(partyId=نسك, seasonId=1447) [active]
└── مورد غير محدد → يُنشأ analytic_account(needsLinking=true) [needs_linking]
    └── مركز التصنيف يعرضه
        └── المستخدم يربطه بوكيل → يُحدَّث [active]
```

لا يتوقف النظام في الحالتين. القيد GL يُرحَّل على الحساب الرقابي الصحيح دائماً.

---

## منع الترحيل على الحسابات الرئيسية

**ثلاثة خطوط دفاع:**

1. **الواجهة**: قوائم الحسابات في شاشات التشغيل تعرض `allowPosting=true` فقط.

2. **المحرك**: `assertPostableAccount()` يُستدعى قبل بناء القيد.

3. **قاعدة البيانات**: `createJournalEntry` و `postJournalEntry` يتحققان من `allowPosting=true` داخل transaction قبل INSERT.

---

## مركز التصنيف والمطابقة

```
GET  /api/accounting/classification-center
GET  /api/accounting/classification-center/analytic-accounts?status=needs_linking
PATCH /api/accounting/classification-center/analytic-accounts/:id/link
GET  /api/accounting/classification-center/posting-failures?category=parent_account
POST /api/accounting/classification-center/posting-failures/:id/classify
GET  /api/accounting/assert-postable?code=XXXX
```

---

## الفروع والعهد

- حساب رقابي واحد للعهد (مثل `1xxx`)
- `analytic_accounts` يحمل `employeeId + branchId` لكل عهدة
- تقرير العهد يُجمّع بالأبعاد التحليلية لا بالـ GL

---

## CI Guards

- `tests/integration/parentAccountPostingGuard.dynamic.test.ts`
- `tests/integration/umrahAnalyticAccountAutoCreate.dynamic.test.ts`

تمنع الرجوع للمشكلة مستقبلاً عبر CI pipeline.
