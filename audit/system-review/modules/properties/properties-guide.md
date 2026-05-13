# /properties/guide — `artifacts/ghayth-erp/src/pages/properties-guide.tsx`

## 1. الميتاداتا
- المسار: `/properties/guide`
- ملف الصفحة: `artifacts/ghayth-erp/src/pages/properties-guide.tsx`
- مسجّلة في: `artifacts/ghayth-erp/src/routes/propertyRoutes.tsx:60`
- المجموعة: `properties`
- الكومبوننت: `PropertiesGuide`
- subKey: — | minRoleLevel: —
- الكيان المستنبط: `guide`
- سطور الملف: 1430
- مصدر موجود: ✅

## 2. الأزرار والإجراءات
_لا توجد طلبات كتابة من هذه الصفحة._

### تفاصيل الأزرار المرئية
- L1273: "العودة للنظام"

### القراءات (GET)
_لا قراءات._



## 3. الحركات ذات الصلة (Cross-Module Transactions)
صفحة الـ Guide — onboarding tutorial. **مستخدمة فقط للعرض** — لا حركات backend.

| الجانب | التفاصيل |
|------|---------|
| الغرض | شرح وحدة العقارات للمستخدمين الجدد |
| البيانات المعروضة | placeholders (`"المستأجر ١ (مثال)"`, `05X-XXX-XX01`) | راجع `properties-guide.tsx` |
| PII safety | ✅ تم استبدال جميع الأسماء/الأرقام الحقيقية بـ placeholders (PR #445) |
| Backend reads | لا — كل البيانات mock داخل المكوّن |
| Backend writes | لا — تعليمي فقط |
| RBAC | متاح للجميع بدور property |
| Audit log | لا — read-only static |

| الإشكاليات السابقة | الحل |
|--------------------|-----|
| 🔴 PII حقيقية (6 أسماء + 10 هواتف + 6 IDs) | ✅ مُعالج في PR #445 |
| 🟡 الـ scanner كان يكشفها كـ hardcoded-dummy | ✅ scanner refined لـ placeholder filter |
| 🟢 الحالة الآن | آمنة بالكامل |

تحقق يدوي:
- [ ] هل البيانات الديموية واضحة بأنها أمثلة (وليست بيانات عملاء)؟
- [ ] هل صور screenshots/diagrams بدون PII حقيقية؟
- [ ] هل التحديث الديموي يحفظ التزامن مع التغييرات في وحدة العقارات؟

## 4. النمذجة
_لم يتم العثور على جدول Drizzle بالاسم المستنبط `guide` — قد يكون معرّفًا في migrations فقط (راجع `artifacts/api-server/src/migrations`)._

## 5. البيانات الوهمية الثابتة
✅ لا توجد بيانات وهمية ثابتة مكتشفة آلياً.

## 6. النتيجة (Verdict)
- Runtime audit: **⚠ PARTIAL** — render=PASS | fetch=PASS | CTA=SKIP | nav=FAIL | smoke=PASS
- ملاحظة: `landed=/dashboard expected=/properties/guide`
- لقطة: `audit/screenshots/properties_guide.png`
- landedUrl: `http://localhost/dashboard`
- توصية: **يحتاج إصلاح**
