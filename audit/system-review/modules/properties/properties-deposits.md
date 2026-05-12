# /properties/deposits — `artifacts/ghayth-erp/src/pages/properties/deposits.tsx`

## 1. الميتاداتا
- المسار: `/properties/deposits`
- ملف الصفحة: `artifacts/ghayth-erp/src/pages/properties/deposits.tsx`
- مسجّلة في: `artifacts/ghayth-erp/src/routes/propertyRoutes.tsx:57`
- المجموعة: `properties`
- الكومبوننت: `PropertyDeposits`
- subKey: — | minRoleLevel: —
- الكيان المستنبط: `deposits`
- سطور الملف: 293
- مصدر موجود: ✅

## 2. الأزرار والإجراءات
_لا توجد طلبات كتابة من هذه الصفحة._

### تفاصيل الأزرار المرئية
- L141: "(بلا تسمية)" → `() => setShowForm(false)`
- L173: "(بلا تسمية)" → `() => setStatusFilter(v)`
- L267: "إلغاء" → `props.onClose`

### القراءات (GET)
- GET `/properties/contracts?status=active&limit=200`



## 3. الحركات ذات الصلة (Cross-Module Transactions)
ضمانات/تأمينات المستأجرين (security deposits).

| الحركة | الوحدة الهدف | مدخل API | مدخل DB | الحالة |
|--------|--------------|----------|---------|--------|
| استلام تأمين عند توقيع العقد | properties | تلقائي مع `/properties/contracts` POST | `property_deposits` row | ✅ |
| **قيد محاسبي عند الاستلام** | finance/GL | DR Cash / CR Tenant Deposits Liability | `gl_entries`, `gl_lines` | ✅ |
| **الحساب escrow** (منفصل عن إيراد المالك) | finance | `chart_of_accounts` حساب مخصص (liability) | لا يحتسب كإيرادات | ✅ |
| تحديث رصيد المستأجر | properties | `property_tenants.depositBalance` | ⚠ |
| استرداد عند انتهاء العقد | properties | POST `/deposits/:id/refund` | `property_deposits.refundedAt` | ✅ |
| خصم من التأمين (lattic damages, late fees) | properties | POST `/deposits/:id/deduction` | `deposit_deductions` (with reason + amount) | ⚠ |
| قيد محاسبي عند الخصم | finance/GL | DR Tenant Deposits Liability / CR Revenue (damages recovery) | ✅ |
| قيد محاسبي عند الإرجاع | finance/GL | DR Tenant Deposits Liability / CR Cash | ✅ |
| تقرير liability ageing | finance/reports | aggregation per tenant per period | view | ✅ |
| تأثير على cash flow forecast | finance | deposits متوقع إرجاعها = outflow مستقبلي | view | ⚠ |
| إشعار للمستأجر بقيمة الاسترداد | comms | event=`deposit_refund_processed\|deduction_applied` | `notifications` | ⚠ |
| فاتورة ZATCA (لخصومات الأضرار) | finance-zatca | اختياري | ⚠ |
| Audit log | core | `auditMiddleware` (`/properties`) | `audit_logs` | ✅ |

تحقق يدوي:
- [ ] هل التأمين محفوظ في حساب escrow حقيقي بنكي أم accounting only؟
- [ ] هل النزاع على خصم تأمين يفتح workflow approval؟
- [ ] هل عند إخلاء مفاجئ بدون فحص، يُمنع الإرجاع تلقائياً حتى يتم الفحص؟
- [ ] هل الفوائد المتراكمة على التأمين (لو موجودة) تذهب للمالك أم المستأجر؟

## 4. النمذجة
_لم يتم العثور على جدول Drizzle بالاسم المستنبط `deposits` — قد يكون معرّفًا في migrations فقط (راجع `artifacts/api-server/src/migrations`)._

## 5. البيانات الوهمية الثابتة
✅ لا توجد بيانات وهمية ثابتة مكتشفة آلياً.

## 6. النتيجة (Verdict)
- Runtime audit: **⚠ PARTIAL** — render=PASS | fetch=PASS | CTA=SKIP | nav=FAIL | smoke=PASS
- ملاحظة: `landed=/dashboard expected=/properties/deposits`
- لقطة: `audit/screenshots/properties_deposits.png`
- landedUrl: `http://localhost/dashboard`
- توصية: **يحتاج إصلاح**
