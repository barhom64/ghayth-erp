# Umrah Import — تعليمات إصلاح الثغرات العملية

> توثيق للثغرات الستة في تدفق استيراد نسك (NUSK) وخطوات الإصلاح المحددة.
> مرجع المراجعة العميقة: محادثة `session_01WF3oKK4pXQKGBZzHVBNPNj`.

## الموجود فعليًا الآن (main HEAD)

| الطبقة | الملف | الحالة |
|---|---|---|
| Parser ملفات نسك | `artifacts/api-server/src/lib/umrahImportEngine.ts` | ✅ يعمل (Excel + CSV، mutamers + vouchers) |
| Preview + Confirm | نفس الملف | ✅ UPSERT + batch tracking |
| Auto-resolve وكيل/وكيل فرعي | `umrahImportEngine.ts:768` | ⚠️ ينجح أو يضع `null` بصمت |
| JE المشتريات (AP) | `umrahImportEngine.ts:688-762` | ✅ DR تكلفة / CR مستحقات نسك |
| فاتورة المبيعات | `umrahInvoicingEngine.ts:generateSalesInvoice` | ⚠️ يفترض pricing مسبق + VAT خاطئ |

## الستة ثغرات + خطة الإصلاح

### Gap #1 — فاتورة مشتريات حقيقية مفقودة

**الحالة:** `confirmVouchersImport` ينشئ JE فقط، ويحفظ `je.id` في `umrah_nusk_invoices.purchaseInvoiceId`. لا row في جدول `purchase_invoices` المالي.

**الأثر:** فاتورة نسك لا تظهر في:
- صفحة المشتريات/الموردين
- تقرير AP aging
- مدفوعات الموردين

**خطوات الإصلاح:**
1. أضف helper `createPurchaseInvoiceFromNusk(scope, nuskRow)` في `umrahImportEngine.ts` ينشئ row في `purchase_invoices` مع line items من breakdown نسك (visa, ground services, hotel, transport, …).
2. عدّل `umrah_nusk_invoices.purchaseInvoiceId` ليشير إلى ID الفاتورة الحقيقية (لا الـ JE).
3. أضف عمود `umrah_nusk_invoices.journalEntryId` (موجود فعلاً) للـ JE id فقط.
4. اربط الـ JE بـ purchase_invoice (عبر `sourceType='purchase_invoices'`).

**حجم العمل:** متوسط (~150 سطر + migration واحدة لإضافة supplier_id default للـ NUSK كـ "Saudi NUSK Platform").

---

### Gap #2 — اختيار الخزنة (`treasuryId`) مفقود

**الحالة:** `ImportScope` يحتوي على `{ companyId, branchId, userId, seasonId }` فقط. الـ JE لا يربط بخزنة. الـ UI wizard (`import-wizard.tsx`) بلا dropdown للخزنة.

**خطوات الإصلاح:**
1. أضف `treasuryId?: number` لـ `ImportScope` في `umrahImportEngine.ts`.
2. أضف dropdown في `import-wizard.tsx` يقرأ من `/api/treasuries?branchId=<X>`.
3. مرّر `treasuryId` في endpoint `/umrah/import/vouchers`.
4. عند إنشاء الـ purchase_invoice (بعد إصلاح gap #1)، اربط `treasuryId` على الفاتورة.

**حجم العمل:** صغير (~50 سطر).

---

### Gap #3 — اختيار حساب المشتريات في الـ UI

**الحالة:** `getAccountCodeFromMapping(companyId, "umrah_nusk_cost", "debit", "5201")` يستخدم default `5201`. لا UI للتخصيص.

**خطوات الإصلاح:**
1. dropdown في `import-wizard.tsx` يقرأ `/api/account-mappings?key=umrah_nusk_cost`.
2. يُعرض الحساب الافتراضي + خيار "تغيير".
3. لو غيّر المستخدم، يُمرر `purchaseAccountCode` في الـ payload.

**حجم العمل:** صغير (~30 سطر).

---

### Gap #4 — VAT على إجمالي البيع، يجب أن يكون على الهامش

**الحالة (`umrahInvoicingEngine.ts:179-181`):**
```ts
const vatRate = vatSetting ? Number(vatSetting.value) : 0;
const vatAmount = roundTo2(subtotal * (vatRate / 100));  // ❌ على كامل subtotal
const total = subtotal + penaltiesTotal + vatAmount;
```

**الصحيح (margin scheme لخدمات العمرة):** VAT = (sale - cost) × rate.

**خطوات الإصلاح:**
1. أضف helper `calculateCostBasis(scope, groupIds)` يجمع `totalAmount` من `umrah_nusk_invoices` المرتبطة بنفس groupIds.
2. عدّل `generateSalesInvoice`:
   ```ts
   const costBasis = await calculateCostBasis(scope, groupIds);
   const margin = Math.max(0, subtotal - costBasis);
   const vatAmount = roundTo2(margin * (vatRate / 100));
   ```
3. أضف عمودين على `umrah_sales_invoices`: `costBasis numeric(12,2)`, `marginBase numeric(12,2)`.
4. أضف اختبار `umrahMarginVatSmoke.test.ts` يتحقق:
   - subtotal=1000, cost=600 → margin=400, vat@15%=60 (وليس 150).

**حجم العمل:** متوسط (~80 سطر + migration + اختبار).

---

### Gap #5 — تنبيهات auto-link الصامتة

**الحالة (`umrahImportEngine.ts:768`):** لو فشل `resolveAgent` لكل من `nuskAgentNumber` و `agentName`، يرجع `null` بدون تنبيه.

**خطوات الإصلاح:**
1. عدّل `previewMutamersImport` ليُحسب counter `unlinkedAgentCount` للسطور بلا agent match.
2. في `umrah_import_changes` log entry جديد type=`warning`.
3. في الـ UI step 2 (preview)، عرض banner أصفر: "X صفًا لم يتم ربطه بوكيل — راجع".
4. أضف صفحة `/umrah/import/<batchId>/unlinked` لربط يدوي بعد الاستيراد.

**حجم العمل:** متوسط (~120 سطر، يتضمن صفحة UI صغيرة).

---

### Gap #6 — تدفق "تحديد سعر البيع يدوي لكل مجموعة"

**الحالة:** `generateSalesInvoice` يعتمد على `umrah_pricing` table (CRUD على `/umrah/pricing`). لا تدفق "هنا المجموعات المستوردة، أدخل سعر يدوي".

**خطوات الإصلاح:**
1. أضف صفحة جديدة `/umrah/sales-invoice-wizard` تعرض:
   - المجموعات المستوردة حديثًا (status='imported', salesInvoiceId IS NULL).
   - input لكل مجموعة: سعر البيع للمعتمر (أو إجمالي المجموعة).
   - يحسب تلقائيًا: total = price × mutamerCount.
2. زر "إنشاء فواتير المبيعات" يستدعي endpoint جديد `/umrah/sales-invoices/batch-generate` بـ:
   ```json
   { "groups": [ { "id": 1, "pricePerMutamer": 5000 }, ... ] }
   ```
3. الـ endpoint يستخدم نفس `generateSalesInvoice` لكن يمرر الـ pricing يدويًا (بدلاً من lookup في `umrah_pricing`).
4. اختياريًا: زر "حفظ كقاعدة تسعير" يضيف row في `umrah_pricing` لاستخدام مستقبلي.

**حجم العمل:** كبير (~250 سطر، صفحة UI جديدة + endpoint + تعديل engine).

---

## ترتيب التنفيذ الموصى به

| الأولوية | Gap | السبب |
|---|---|---|
| 1️⃣ | **#4 VAT-on-margin** | bug ضريبي حقيقي (overcharge صريح للعميل)؛ صغير وحاسم |
| 2️⃣ | **#5 auto-link warnings** | منع فقدان بيانات صامت؛ صغير |
| 3️⃣ | **#2 treasuryId field** | foundation للـ #1؛ صغير |
| 4️⃣ | **#3 purchase account picker** | تكميلي للـ #2؛ صغير |
| 5️⃣ | **#1 real purchase invoices** | يفتح بقية تدفق المشتريات؛ متوسط |
| 6️⃣ | **#6 manual per-group pricing UI** | الحالة العملية الفعلية؛ كبير |

## ملفات سيتم تعديلها (إجمالًا)

```
artifacts/api-server/src/lib/umrahImportEngine.ts        (gaps #1, #2, #5)
artifacts/api-server/src/lib/umrahInvoicingEngine.ts     (gap #4, #6)
artifacts/api-server/src/routes/umrah.ts                 (gap #6 endpoint)
artifacts/api-server/src/migrations/                     (gap #1, #2, #4)
artifacts/ghayth-erp/src/pages/umrah/import-wizard.tsx   (gaps #2, #3, #5)
artifacts/ghayth-erp/src/pages/umrah/sales-invoice-wizard.tsx  (NEW — gap #6)
artifacts/api-server/tests/unit/umrahMarginVatSmoke.test.ts    (NEW — gap #4)
```

## اختبارات قبولية لكل gap

- **#4:** `pnpm vitest umrahMarginVatSmoke` → margin=400, vat@15%=60 (وليس 150)
- **#5:** preview بـ 10 صفوف غير مربوطة → `unlinkedAgentCount=10`، banner يظهر
- **#2:** import بـ `treasuryId=5` → row في purchase_invoices مربوط بـ treasuryId=5
- **#1:** بعد import نسك، صفحة `/finance/purchase-invoices` تعرض فاتورة جديدة type='umrah_nusk'
- **#6:** wizard يعرض المجموعات الجديدة، إدخال سعر، الـ POST ينجح، فاتورة مبيعات تظهر في `/umrah/invoices`
