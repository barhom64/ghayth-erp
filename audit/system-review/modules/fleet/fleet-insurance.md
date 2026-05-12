# /fleet/insurance — `artifacts/ghayth-erp/src/pages/fleet/insurance.tsx`

## 1. الميتاداتا
- المسار: `/fleet/insurance`
- ملف الصفحة: `artifacts/ghayth-erp/src/pages/fleet/insurance.tsx`
- مسجّلة في: `artifacts/ghayth-erp/src/routes/fleetRoutes.tsx:45`
- المجموعة: `fleet`
- الكومبوننت: `Insurance`
- subKey: — | minRoleLevel: —
- الكيان المستنبط: `insurance`
- سطور الملف: 90
- مصدر موجود: ✅

## 2. الأزرار والإجراءات
_لا توجد طلبات كتابة من هذه الصفحة._

### تفاصيل الأزرار المرئية
_لم تُلتقط أزرار._

### القراءات (GET)
- GET `/fleet/insurance`



## 3. الحركات ذات الصلة (Cross-Module Transactions)
تأمين المركبات. يتطلّب accounting خاص (prepaid amortization).

| الحركة | الوحدة الهدف | مدخل API | مدخل DB | الحالة |
|--------|--------------|----------|---------|--------|
| إضافة وثيقة تأمين | fleet | `fleet.ts` POST `/insurance` | `vehicle_insurance` | ✅ |
| ربط بشركة التأمين (vendor) | finance/vendors | `insurance.insurerId` → `vendors` | ✅ |
| **قيد سداد الأقساط** | finance/GL | DR Prepaid Insurance / CR Cash | `gl_entries` | ✅ |
| **قيد amortization شهري** (cron) | finance/GL | DR Insurance Expense / CR Prepaid Insurance | `gl_entries` (monthly) | ⚠ تحقق إن مفعّل |
| إشعار قبل انتهاء التأمين (30/14/7 يوم) | comms | cron يفحص `expiringDate` | `notifications` | ✅ |
| تجديد تلقائي/يدوي | fleet | عند الانتهاء → فتح طلب تجديد | ⚠ |
| تسجيل المطالبات (claims) | fleet | `insurance_claims` (لو حادث) | ✅ |
| استرداد قيمة المطالبة | finance/GL | DR Cash / CR Insurance Claims Receivable | `gl_entries` | ⚠ يدوي |
| تأثير على TCO | fleet | aggregation | view | ✅ |
| ربط بحوادث/مخالفات (لو وُجدت) | fleet | `traffic_violations.insuranceClaimId` | ⚠ |
| Audit log | core | `auditMiddleware` لـ `/fleet/insurance` (إن مضافة) | `audit_logs` | ⚠ تحقق |

تحقق يدوي:
- [ ] هل القسط مدفوع مقدماً يُسجّل كـ Prepaid أم Expense مباشر؟
- [ ] هل التجديد قبل الانتهاء يولّد قيد إغلاق للوثيقة القديمة + قيد بدء للجديدة؟
- [ ] هل مطالبة بدون استلام تبقى في Receivable حتى متى (aging)؟

## 4. النمذجة
_لم يتم العثور على جدول Drizzle بالاسم المستنبط `insurance` — قد يكون معرّفًا في migrations فقط (راجع `artifacts/api-server/src/migrations`)._

## 5. البيانات الوهمية الثابتة
✅ لا توجد بيانات وهمية ثابتة مكتشفة آلياً.

## 6. النتيجة (Verdict)
- Runtime audit: **⚠ PARTIAL** — render=PASS | fetch=PASS | CTA=SKIP | nav=FAIL | smoke=PASS
- ملاحظة: `landed=/dashboard expected=/fleet/insurance`
- لقطة: `audit/screenshots/fleet_insurance.png`
- landedUrl: `http://localhost/dashboard`
- توصية: **يحتاج إصلاح**
