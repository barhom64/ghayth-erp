# /hr/public-holidays — `artifacts/ghayth-erp/src/pages/hr/public-holidays.tsx`

## 1. الميتاداتا
- المسار: `/hr/public-holidays`
- ملف الصفحة: `artifacts/ghayth-erp/src/pages/hr/public-holidays.tsx`
- مسجّلة في: `artifacts/ghayth-erp/src/routes/hrRoutes.tsx:153`
- المجموعة: `hr`
- الكومبوننت: `PublicHolidays`
- subKey: `leaves` | minRoleLevel: —
- الكيان المستنبط: `public-holidays`
- سطور الملف: 227
- مصدر موجود: ✅

## 2. الأزرار والإجراءات
_لا توجد طلبات كتابة من هذه الصفحة._

### تفاصيل الأزرار المرئية
- L142: "(بلا تسمية)" → `() => { setShowForm(false); setEditingId(null);`

### القراءات (GET)
_لا قراءات._



## 3. الحركات ذات الصلة (Cross-Module Transactions)
العطل الرسمية (Public Holidays). تأثير عرضي على كل وحدة جدولة.

| الوحدة المتأثرة | كيف تستخدم holidays |
|------------------|----------------------|
| hr/attendance | تستثني العطل من حساب الـ working days |
| hr/leaves | حساب أيام الإجازة لا يشمل العطل |
| hr/payroll | حساب الراتب الشهري كامل (no deduction) |
| hr/overtime | overtime ×2 (rate أعلى للعطلة) |
| hr/shifts | shifts النصب تعتبر العطل |
| fleet/trips | جدولة المهام تتجنب العطل |
| properties/contracts | حساب مدة العقد (لو يستخدم business days) |
| finance/recurring-journals | تأجيل التنفيذ لو العطلة تتزامن |
| misc/calendar | تظهر بلون مميّز |
| properties/maintenance | جدولة الصيانة |
| legal/sessions | المحاكم مغلقة في العطل الرسمية |

| الحركة | API | DB | الحالة |
|--------|-----|-----|--------|
| إدارة عطل سنوية | POST `/hr/public-holidays` | `public_holidays` | ✅ |
| استيراد من تقويم رسمي | gov-integrations | اختياري — Hijri calendar API | ⚠ |
| Multi-country support | per-country list | `holidays.country` | ⚠ تحقق |
| Override per branch | branch-specific holidays | `holidays.branchId` | ⚠ |
| Audit log | core | `auditMiddleware` لو مضاف | `audit_logs` | ⚠ |

تحقق يدوي:
- [ ] هل تعديل عطلة سابقة (لو أعلنت متأخراً) تعيد حساب payroll/overtime؟
- [ ] هل التقويم الهجري vs الميلادي محسوب صحيحاً للعطل الإسلامية؟
- [ ] هل عطل خاصة بكل دولة (multi-country company) مدعومة؟

## 4. النمذجة
_لم يتم العثور على جدول Drizzle بالاسم المستنبط `public-holidays` — قد يكون معرّفًا في migrations فقط (راجع `artifacts/api-server/src/migrations`)._

## 5. البيانات الوهمية الثابتة
✅ لا توجد بيانات وهمية ثابتة مكتشفة آلياً.

## 6. النتيجة (Verdict)
- Runtime audit: **⚠ PARTIAL** — render=PASS | fetch=PASS | CTA=SKIP | nav=FAIL | smoke=PASS
- ملاحظة: `landed=/dashboard expected=/hr/public-holidays`
- لقطة: `audit/screenshots/hr_public_holidays.png`
- landedUrl: `http://localhost/dashboard`
- توصية: **يحتاج إصلاح**
