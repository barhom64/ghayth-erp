# /properties/tenants — `artifacts/ghayth-erp/src/pages/properties-tenants.tsx`

## 1. الميتاداتا
- المسار: `/properties/tenants`
- ملف الصفحة: `artifacts/ghayth-erp/src/pages/properties-tenants.tsx`
- مسجّلة في: `artifacts/ghayth-erp/src/routes/propertyRoutes.tsx:40`
- المجموعة: `properties`
- الكومبوننت: `PropertiesTenants`
- subKey: — | minRoleLevel: —
- الكيان المستنبط: `tenants`
- سطور الملف: 214
- مصدر موجود: ✅

## 2. الأزرار والإجراءات
_لا توجد طلبات كتابة من هذه الصفحة._

### تفاصيل الأزرار المرئية
- L110: "ملف"

### القراءات (GET)
_لا قراءات._



## 3. الحركات ذات الصلة (Cross-Module Transactions)
المستأجرون.

| الحركة | الوحدة الهدف | مدخل API | مدخل DB | الحالة |
|--------|--------------|----------|---------|--------|
| تسجيل مستأجر | properties | `properties.ts` POST `/tenants` | `property_tenants` | ✅ |
| نسخ بيانات الهوية + التحقق | properties | tenants.idNumber + idCopy → object storage | ✅ |
| ربط بعقد إيجار (واحد أو أكثر) | properties | `property_contracts.tenantId` | ✅ |
| رصيد المستأجر (مستحقات) | properties | aggregation من `property_payments` | view | ✅ |
| تذكير بانتهاء العقد (60 يوم قبل) | comms | cron يفحص `property_contracts.endDate` | `notifications` | ✅ |
| إخلاء (eviction) | properties | عند `contract.status='terminated'` → فتح طلب إخلاء | `eviction_requests` (إن وُجد) | ⚠ تحقق |
| استرداد تأمين الإخلاء | finance/GL | DR Tenant Deposits Liability / CR Cash | راجع `properties-payments.md` | ⚠ |
| تقييم المستأجر (history) | crm-like | rate, late_payment_count | يستخدم في فرص عقود مستقبلية | ⚠ |
| تكامل بـ Ejar (تسجيل حكومي) | gov-integrations | اختياري | ⚠ |
| إشعارات شهرية (إيصال) | comms | event=`tenant_payment_due\|received\|overdue` | `notifications` | ✅ |
| Audit log | core | `auditMiddleware` (`/properties`) | `audit_logs` | ✅ |

تحقق يدوي:
- [ ] هل بيانات المستأجر (PII) محمية بـ RBAC + masked في تقارير عامة؟
- [ ] هل مستأجر متعدد الوحدات يظهر له ملف موحّد بكل عقوده ودفعاته؟
- [ ] هل تاريخ التأخر السابق ينعكس على شروط العقد التالي (deposit أعلى)؟

## 4. النمذجة
_لم يتم العثور على جدول Drizzle بالاسم المستنبط `tenants` — قد يكون معرّفًا في migrations فقط (راجع `artifacts/api-server/src/migrations`)._

## 5. البيانات الوهمية الثابتة
✅ لا توجد بيانات وهمية ثابتة مكتشفة آلياً.

## 6. النتيجة (Verdict)
- Runtime audit: **⚠ PARTIAL** — render=PASS | fetch=PASS | CTA=SKIP | nav=FAIL | smoke=PASS
- ملاحظة: `landed=/dashboard expected=/properties/tenants`
- لقطة: `audit/screenshots/properties_tenants.png`
- landedUrl: `http://localhost/dashboard`
- توصية: **يحتاج إصلاح**
