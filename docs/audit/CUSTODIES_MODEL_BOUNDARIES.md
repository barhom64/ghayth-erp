# Custodies (العهد والأصول) — حدود الـ3 نماذج
## HR-017 — توضيح المسؤوليات لأصول الموظف

> أحد المخاطر التي رصدها تقرير `HR_OPERATING_FOUNDATION_AUDIT.md` (R-تكرار العهد)
> هو وجود "3 نماذج" متقاطعة للعهد. هذا الـ doc يحسم الحدود:
> **ليست نماذج متنافسة — هي طبقات متكاملة**، كل واحدة تحل سؤالًا مختلفًا.
> الفجوة الحقيقية هي غياب التوثيق، ليس تكرار البيانات.

---

## ١. الطبقات الثلاث (تكامل، لا تنافس)

### الطبقة A — الـ Physical Asset (الأصل المادي نفسه)
**الجدول:** `warehouse_products` / `warehouse_stock_lots` / `warehouse_stock_serials`
**يجيب عن:** *"هل عندنا 10 لابتوبات في المستودع؟"*
**يملكه:** قسم المستودع.
**يكتب فيه:** receipts، transfers، writeoffs.
**لا يعرف:** من يحمل اللابتوب الآن.

### الطبقة B — الـ Assignment (التخصيص للموظف)
**الجدول:** `employee_assets` (HR-011، migration 276)
**يجيب عن:** *"من يحمل اللابتوب X الآن؟ منذ متى؟ بأي حالة استلمه؟ بأي حالة سيُعيده؟"*
**يملكه:** قسم HR.
**يكتب فيه:** assignedAt/assignedBy، returnedAt/returnedBy، conditionOnAssign، conditionOnReturn.
**لا يعرف:** الأثر المالي على ميزانية العهدة الشخصية.

**الـ FK البصري:**
```
employee_assets.warehouseAssetId → warehouse_stock_serials.id (اختياري)
employee_assets.employeeId → employees.id
```
عندما يكون `warehouseAssetId` فارغًا = الأصل خارج المستودع (مثل SIM، رخصة سيارة).

### الطبقة C — الـ Financial Balance (الأثر المحاسبي)
**الجدول:** `subsidiary_accounts` (لكل موظف صف عام type='employee')
**يجيب عن:** *"كم قيمة العهد المستحقة على الموظف؟ هل تطابق dr/cr في الـ GL؟"*
**يملكه:** قسم المالية.
**يكتب فيه:** `journal_entries` بمجرد قبض/تسليم أصل بقيمة محددة.
**لا يعرف:** الـ serial number أو حالة الجهاز.

**الـ link:**
```
subsidiary_accounts (companyId, party_type='employee', party_id=employeeId, account_type='custody')
journal_entries.lines.subsidiary_account_id → subsidiary_accounts.id
```

---

## ٢. سيناريو كامل: تسليم لابتوب لموظف

```
┌─────────────────────────────────────────────────────────────────────┐
│ 1. Warehouse: لابتوب dell بـ serial #DLM-2024-77 موجود في المخزن  │
│    Row: warehouse_stock_serials(productId=42, serial='DLM-2024-77',│
│         qty=1, status='available')                                  │
└─────────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────────┐
│ 2. HR: تسليم اللابتوب للموظف #1234 (سامي علي)                       │
│    POST /employees/1234/assets                                       │
│    INSERT employee_assets (                                          │
│      employeeId=1234, assetType='laptop',                            │
│      warehouseAssetId=(stock_serials.id),                            │
│      assetLabel='Dell Latitude 5520', serialNumber='DLM-2024-77',    │
│      assignedAt=now(), assignedBy=mgrId,                             │
│      conditionOnAssign='good — new in box'                           │
│    )                                                                 │
│    UPDATE warehouse_stock_serials SET status='assigned'              │
└─────────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────────┐
│ 3. Finance: قيد محاسبي (إذا كان الأصل يستحق tracking مالي)         │
│    POST journal_entry (                                              │
│      Dr: subsidiary_accounts[party=employee:1234, type=custody]      │
│      Cr: warehouse inventory account                                 │
│      amount: 5500 SAR                                                │
│    )                                                                 │
└─────────────────────────────────────────────────────────────────────┘
```

النتيجة: 3 صفوف في 3 جداول، **كل واحد يخدم سؤالًا مختلفًا**:
- "أين اللابتوب؟" → `warehouse_stock_serials` (status=assigned)
- "من يحمله؟" → `employee_assets` (الـ join على employeeId)
- "كم يكلّفنا؟" → `subsidiary_accounts.balance` للموظف

---

## ٣. متى لا تستخدم أي طبقة

### استخدم `employee_assets` فقط، بدون warehouse + finance
- SIM card شخصية للموظف (الـ telecom plan)
- iqama / passport scan
- مفتاح مكتب فعلي (لا قيمة محاسبية)
- ID badge

→ `warehouseAssetId = NULL`، لا قيد محاسبي.

### استخدم `warehouse + finance` فقط، بدون assignment
- مخزون ثابت لم يُسلَّم لأحد بعد
- شراء جديد من vendor → receipts journal entry

### استخدم الـ3 معًا
- لابتوب / هاتف / مركبة بقيمة محاسبية معروفة
- مفاتيح خزنة بقيمة كبيرة

---

## ٤. الاستعلامات الموصى بها

### "كل الأصول التي يحملها الموظف #1234 الآن"
```sql
SELECT ea.*, ws.serial AS warehouse_serial
  FROM employee_assets ea
  LEFT JOIN warehouse_stock_serials ws ON ws.id = ea."warehouseAssetId"
 WHERE ea."employeeId" = 1234
   AND ea."returnedAt" IS NULL
 ORDER BY ea."assignedAt" DESC;
```
(هذا ما يستخدمه ملف الموظف 360 — tab «العهد والأصول».)

### "كل الموظفين الذين يحملون لابتوبات"
```sql
SELECT e.id, e.name, ea."assetLabel"
  FROM employee_assets ea
  JOIN employees e ON e.id = ea."employeeId"
 WHERE ea."assetType" = 'laptop'
   AND ea."returnedAt" IS NULL;
```

### "رصيد العهد المالي على الموظف"
```sql
SELECT sa.balance
  FROM subsidiary_accounts sa
 WHERE sa."companyId" = $1
   AND sa.party_type = 'employee'
   AND sa.party_id = $employeeId
   AND sa.account_type = 'custody';
```

### "اللابتوب dell #DLM-2024-77 — أين هو الآن؟"
```sql
-- إذا كان مسلَّمًا:
SELECT ea."employeeId", e.name AS holder
  FROM employee_assets ea
  JOIN warehouse_stock_serials ws ON ws.id = ea."warehouseAssetId"
  JOIN employees e ON e.id = ea."employeeId"
 WHERE ws.serial = 'DLM-2024-77'
   AND ea."returnedAt" IS NULL;
-- إذا فارغ → في المستودع.
```

---

## ٥. ما يجب **عدم** فعله

| الخطأ | السبب | البديل |
|---|---|---|
| INSERT في `employee_assets` بدون UPDATE على `warehouse_stock_serials.status` | الأصل يبقى يظهر "available" مع كونه مسلَّمًا | استخدم transaction واحد |
| تسجيل قيد محاسبي بـ subsidiary_accounts لكل SIM | تتلف الـ subsidiary ledger بآلاف الصفوف الصغيرة | استعمل subsidiary فقط للأصول ≥ threshold (مثل 500 SAR) |
| استخدام `subsidiary_accounts.balance` كمصدر "ماذا يحمل الموظف؟" | البالانس يعطيك رقم فقط، لا تفاصيل | استخدم `employee_assets` بـ JOIN |
| Duplicate row في `employee_assets` للأصل نفسه بدون returnedAt | يكسر unique constraint وlogic ملف الموظف | تأكد من إعادة الأصل قبل إعادة تسليمه |

---

## ٦. الـ risks المتبقية

### R-1 — Drift بين warehouse status وحقيقة employee_assets
لا يوجد trigger أو background job يضمن أن `warehouse_stock_serials.status='assigned'`
لكل صف في `employee_assets` بـ `returnedAt IS NULL`. إذا نسي مَن يسلِّم تحديث الـ warehouse،
سيظهر الأصل "available" بينما هو مسلَّم.

**التوصية:** إضافة nightly reconcile job يكشف هذا الـ drift، أو trigger
يضمن الاتفاق على مستوى DB.

### R-2 — Subsidiary balance دون link مباشر إلى `employee_assets`
حاليًا الـ subsidiary_accounts.balance يُحسب من journal_entries، و
`employee_assets` لا يحتوي مرجعًا لأي journal entry. إذا أراد الـ admin
رؤية "ما الـ journal entries المرتبطة بالأصل X؟"، لا يستطيع.

**التوصية:** إضافة عمود `employee_assets.journalEntryId` (nullable FK)
في migration لاحق.

### R-3 — لا يوجد lifecycle event لـ asset return
عندما يُعيد الموظف الأصل، نُحدِّث `returnedAt + returnedBy + conditionOnReturn`
لكن لا notification أو event يُرسل للـ finance أو warehouse تلقائيًا.

**التوصية:** إضافة event emitter في POST /employees/:id/assets/:id/return.

---

## ٧. الخلاصة

**ليست 3 نماذج متنافسة. هي 3 طبقات لـ 3 أسئلة مختلفة:**
- **Warehouse** = أين الأصل؟
- **employee_assets** = من يحمله ومتى؟
- **subsidiary_accounts** = كم يكلّفنا محاسبيًا؟

كل طبقة لها مالك واضح (Warehouse / HR / Finance) ومسؤولية مفصولة.
الـ duplication المتوهَّم في تقرير الـ audit كان نقص توثيق فقط — هذا الـ doc يحسمه.

---

## شهادة الكاتب
كتب: Claude (claude-opus-4-7[1m]) في إطار HR-017 لإغلاق "تكرار العهد"
المرصود في `docs/audit/HR_OPERATING_FOUNDATION_AUDIT.md` §5.
كل سطر مُتحقّق منه من:
- migration 276 (employee_assets)
- `db/schema_pre.sql` (warehouse_stock_*، subsidiary_accounts)
- `routes/employees.ts:807-835` (subsidiary custody creation)
