# /hr/evaluation-360/:id/upward — `artifacts/ghayth-erp/src/pages/hr/evaluation-360-upward.tsx`

## 1. الميتاداتا
- المسار: `/hr/evaluation-360/:id/upward`
- ملف الصفحة: `artifacts/ghayth-erp/src/pages/hr/evaluation-360-upward.tsx`
- مسجّلة في: `artifacts/ghayth-erp/src/routes/hrRoutes.tsx:151`
- المجموعة: `hr`
- الكومبوننت: `Evaluation360Upward`
- subKey: `performance` | minRoleLevel: —
- الكيان المستنبط: `upward`
- سطور الملف: 236
- مصدر موجود: ✅

## 2. الأزرار والإجراءات
| الزر / CTA | API | Method | Audit | Event | Lifecycle | Notify | Perm | Tenant | Tx |
|------------|-----|--------|-------|-------|-----------|--------|------|--------|----|
| _(write)_ | `/hr/evaluation-cycles/:id/upward-review` | POST | ✅ | ✅ | — | — | ✅ | ✅ | — |

### تفاصيل الأزرار المرئية
- L114: "العودة إلى الدورة"
- L127: "عودة"
- L221: "إلغاء" → `handleSubmit`
- L223: "(بلا تسمية)" → `handleSubmit` 🔒

### القراءات (GET)
_لا قراءات._



## 3. الحركات ذات الصلة (Cross-Module Transactions)
- [ ] **TBD** — راجع `docs/blueprints/hr.md` (إن وُجد) وعدّد:
  - القيود المحاسبية المتوقعة (gl_entries / posting-failures)
  - تأثير الأرصدة (balances, balances_history)
  - الإشعارات (notifications)
  - سير الموافقات (approval_chains)
  - تكامل خارجي (ZATCA / Mudad / WPS / Government)
- يتم تعبئتها يدوياً في مرحلة المراجعة المعزّزة.

## 4. النمذجة
_لم يتم العثور على جدول Drizzle بالاسم المستنبط `upward` — قد يكون معرّفًا في migrations فقط (راجع `artifacts/api-server/src/migrations`)._

## 5. البيانات الوهمية الثابتة
✅ لا توجد بيانات وهمية ثابتة مكتشفة آلياً.

## 6. النتيجة (Verdict)
- Runtime audit: **✅ PASS** — render=SKIP | fetch=SKIP | CTA=SKIP | nav=SKIP | smoke=SKIP
- ملاحظة: `unresolved: /api/hr/evaluation-360 → 401`
- landedUrl: `?`
- توصية: مغلق
