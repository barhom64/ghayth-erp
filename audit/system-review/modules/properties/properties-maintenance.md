# /properties/maintenance — `artifacts/ghayth-erp/src/pages/properties-maintenance.tsx`

## 1. الميتاداتا
- المسار: `/properties/maintenance`
- ملف الصفحة: `artifacts/ghayth-erp/src/pages/properties-maintenance.tsx`
- مسجّلة في: `artifacts/ghayth-erp/src/routes/propertyRoutes.tsx:54`
- المجموعة: `properties`
- الكومبوننت: `PropertiesMaintenance`
- subKey: — | minRoleLevel: —
- الكيان المستنبط: `maintenance`
- سطور الملف: 112
- مصدر موجود: ✅

## 2. الأزرار والإجراءات
_لا توجد طلبات كتابة من هذه الصفحة._

### تفاصيل الأزرار المرئية
_لم تُلتقط أزرار._

### القراءات (GET)
- GET `/properties/maintenance-requests`



## 3. الحركات ذات الصلة (Cross-Module Transactions)
طلبات الصيانة للعقارات.

| الحركة | الوحدة الهدف | مدخل API | مدخل DB | الحالة |
|--------|--------------|----------|---------|--------|
| تقديم طلب (من المستأجر/المالك/إدارة) | properties | `properties.ts` POST `/maintenance-requests` | `maintenance_requests` | ✅ |
| إسناد لمقاول/فني | properties | `requests.assignedTo` (vendor أو employee) | ✅ |
| تقدير التكلفة | properties | يدوي عبر `requests.estimatedCost` | ⚠ |
| سير موافقة (للتكلفة > حد) | governance/workflows | `business_rules.maintenance_approval_threshold` | `approval_chains` | ✅ |
| تنفيذ + رفع صور (before/after) | properties + storage | `requests.attachments[]` → object storage | ✅ |
| فاتورة المقاول | finance/expenses | عند الإغلاق → POST `/finance/expenses` مع ربط | `expenses`, `gl_entries` | ✅ |
| **قيد محاسبي** | finance/GL | DR Maintenance Expense / CR Cash أو AP | `gl_entries`, `gl_lines` | ✅ |
| تأثير على ميزانية العقار | finance/budget | `budgets.spent` للقسم/المبنى | ⚠ تحقق |
| ربط بفحص دوري (inspection) | properties | عند `inspection.findings` → ينشئ maintenance_request تلقائياً | ✅ |
| تغيير حالة الوحدة (إن out of service) | properties | `property_units.status='maintenance'` خلال الفترة | يعكس على occupancy_rate | ✅ |
| إشعارات (المستأجر + المقاول + المالك) | comms | event=`maintenance_requested\|assigned\|completed` | `notifications` | ✅ |
| Audit log | core | `auditMiddleware` (`/properties`) | `audit_logs` | ✅ |

تحقق يدوي:
- [ ] هل صيانة متكررة على نفس الوحدة تطلق تنبيه "وحدة مشكلة"؟
- [ ] هل التكلفة المتجاوزة للتقدير الأولي بنسبة >20% تطلب موافقة إضافية؟
- [ ] هل تقييم المقاول (rating) ينعكس على فرص الإسناد المستقبلية؟
- [ ] هل الصيانة الطارئة تتخطى سير الموافقة (emergency override)؟

## 4. النمذجة
_لم يتم العثور على جدول Drizzle بالاسم المستنبط `maintenance` — قد يكون معرّفًا في migrations فقط (راجع `artifacts/api-server/src/migrations`)._

## 5. البيانات الوهمية الثابتة
✅ لا توجد بيانات وهمية ثابتة مكتشفة آلياً.

## 6. النتيجة (Verdict)
- Runtime audit: **⚠ PARTIAL** — render=PASS | fetch=PASS | CTA=SKIP | nav=FAIL | smoke=PASS
- ملاحظة: `landed=/dashboard expected=/properties/maintenance`
- لقطة: `audit/screenshots/properties_maintenance.png`
- landedUrl: `http://localhost/dashboard`
- توصية: **يحتاج إصلاح**
