# /properties/inspections — `artifacts/ghayth-erp/src/pages/properties/inspections.tsx`

## 1. الميتاداتا
- المسار: `/properties/inspections`
- ملف الصفحة: `artifacts/ghayth-erp/src/pages/properties/inspections.tsx`
- مسجّلة في: `artifacts/ghayth-erp/src/routes/propertyRoutes.tsx:56`
- المجموعة: `properties`
- الكومبوننت: `PropertyInspections`
- subKey: — | minRoleLevel: —
- الكيان المستنبط: `inspections`
- سطور الملف: 312
- مصدر موجود: ✅

## 2. الأزرار والإجراءات
_لا توجد طلبات كتابة من هذه الصفحة._

### تفاصيل الأزرار المرئية
- L149: "(بلا تسمية)" → `() => setShowForm(false)`
- L188: "(بلا تسمية)" → `() => setStatusFilter(s)`
- L289: "إلغاء" → `props.onClose`

### القراءات (GET)
- GET `/properties/units?limit=200`



## 3. الحركات ذات الصلة (Cross-Module Transactions)
فحوصات العقارات (دورية + لتوقيع/إخلاء العقود).

| الحركة | الوحدة الهدف | مدخل API | مدخل DB | الحالة |
|--------|--------------|----------|---------|--------|
| جدولة فحص (دوري) | properties | cron + POST `/inspections` | `property_inspections` (per unit per quarter) | ✅ |
| فحص move-in / move-out | properties | POST `/inspections` linked to contract event | يربط `inspections.contractId`, `phase='move-in\|out'` | ✅ |
| التقاط صور قبل/بعد | storage | `inspection_photos[]` → object storage | ✅ |
| checklist + findings | properties | `inspection_findings` (per item, severity) | ✅ |
| **توليد طلب صيانة تلقائي** | properties | عند `severity='high'` → ينشئ `maintenance_requests` | راجع `properties-maintenance.md` | ✅ |
| ربط بتأمين الإخلاء (للأضرار) | properties/deposits | findings تُحدّد deduction amount لـ deposit | راجع `properties-deposits.md` | ⚠ |
| تقرير ربع سنوي للملاك | comms + bi | aggregation per building → `notifications` للمالك | ✅ |
| تقييم العقار العام (condition score) | properties | aggregate findings → `property_units.conditionScore` | ⚠ |
| تأثير على insurance premium | finance/insurance | لو العقار مرتفع المخاطر | ⚠ |
| سير موافقة (لـ findings الكبرى) | governance/workflows | اختياري | ⚠ |
| Audit log | core | `auditMiddleware` (`/properties`) | `audit_logs` | ✅ |

تحقق يدوي:
- [ ] هل فحص نظري بدون صور يُمنع/يُحذّر منه؟
- [ ] هل findings متكررة على نفس الوحدة تطلق "وحدة حرجة" status؟
- [ ] هل الفحص قبل الإخلاء إلزامي قبل إرجاع التأمين؟
- [ ] هل توقيع المستأجر على تقرير الفحص شرط لقبوله؟

## 4. النمذجة
_لم يتم العثور على جدول Drizzle بالاسم المستنبط `inspections` — قد يكون معرّفًا في migrations فقط (راجع `artifacts/api-server/src/migrations`)._

## 5. البيانات الوهمية الثابتة
✅ لا توجد بيانات وهمية ثابتة مكتشفة آلياً.

## 6. النتيجة (Verdict)
- Runtime audit: **⚠ PARTIAL** — render=PASS | fetch=PASS | CTA=SKIP | nav=FAIL | smoke=PASS
- ملاحظة: `landed=/dashboard expected=/properties/inspections`
- لقطة: `audit/screenshots/properties_inspections.png`
- landedUrl: `http://localhost/dashboard`
- توصية: **يحتاج إصلاح**
