# /properties/contracts — `artifacts/ghayth-erp/src/pages/properties-contracts.tsx`

## 1. الميتاداتا
- المسار: `/properties/contracts`
- ملف الصفحة: `artifacts/ghayth-erp/src/pages/properties-contracts.tsx`
- مسجّلة في: `artifacts/ghayth-erp/src/routes/propertyRoutes.tsx:48`
- المجموعة: `properties`
- الكومبوننت: `PropertiesContracts`
- subKey: — | minRoleLevel: —
- الكيان المستنبط: `contracts`
- سطور الملف: 373
- مصدر موجود: ✅

## 2. الأزرار والإجراءات
_لا توجد طلبات كتابة من هذه الصفحة._

### تفاصيل الأزرار المرئية
- L105: "تسجيل دفع"

### القراءات (GET)
_لا قراءات._



## 3. الحركات ذات الصلة (Cross-Module Transactions)
عقد إيجار. المرجع: `docs/blueprints/properties-ejar.md`.

| الحركة | الوحدة الهدف | مدخل API | مدخل DB | الحالة |
|--------|--------------|----------|---------|--------|
| إنشاء عقد + توليد جدول أقساط | properties | `properties.ts` POST `/contracts` → ينشئ N صفوف في `payments` بحسب `frequency` | `property_contracts`, `property_payments` | ✅ |
| ربط بـ Ejar (التسجيل الحكومي) | gov-integrations | `gov-integrations.ts` (إن مفعّل) | `ejar_submissions` (إن وُجد) | ⚠ يدوي/اختياري |
| قيد محاسبي عند كل دفعة | finance/GL | عند `POST /properties/contracts/:id/pay` → ينشئ `gl_entries` | `gl_entries`, `gl_lines` (DR Cash / CR Rental Revenue) | ✅ متوقع — تحقق من `accounting-mappings` |
| تحديث رصيد المستأجر | properties | جدول `property_tenants.balance` | ⚠ تحقق |
| تحديث الإشغال (`occupancy`) | properties | `property_units.status='occupied'` | `property_units` | ✅ |
| توليد فاتورة ZATCA (إن مطلوب) | finance-zatca | اختياري، يعتمد على `business_rules` | `invoices`, `zatca_documents` | ⚠ غير افتراضي |
| إشعار للمستأجر/المالك | comms | event=`contract_renewal\|payment_due` | `notifications` | ✅ |
| سير موافقة (للعقود الكبيرة) | governance/workflows | `business_rules.contract_approval` | `approval_chains` | ⚠ يعتمد |
| Audit log | core | `auditMiddleware` | `audit_logs` (entity=`property_contracts`) | ✅ |

تحقق يدوي:
- [ ] هل توليد جدول الأقساط ذرّي (transaction)؟ ما يحصل إن فشل بعد إنشاء العقد؟
- [ ] هل ينتهي العقد تلقائياً عند `endDate` ويغيّر `property_units.status` إلى `vacant`؟
- [ ] هل التأمين (`deposit`) يُحجز في حساب escrow أم في حساب المالك؟
- [ ] هل عند الإنهاء المبكر تتولد قيود عكسية وإشعار للمالك؟

## 4. النمذجة
_لم يتم العثور على جدول Drizzle بالاسم المستنبط `contracts` — قد يكون معرّفًا في migrations فقط (راجع `artifacts/api-server/src/migrations`)._

## 5. البيانات الوهمية الثابتة
✅ لا توجد بيانات وهمية ثابتة مكتشفة آلياً.

## 6. النتيجة (Verdict)
- Runtime audit: **⚠ PARTIAL** — render=PASS | fetch=PASS | CTA=SKIP | nav=FAIL | smoke=PASS
- ملاحظة: `landed=/dashboard expected=/properties/contracts`
- لقطة: `audit/screenshots/properties_contracts.png`
- landedUrl: `http://localhost/dashboard`
- توصية: **يحتاج إصلاح**
