# /umrah/violations/create — `artifacts/ghayth-erp/src/pages/umrah/violation-create.tsx`

## 1. الميتاداتا
- المسار: `/umrah/violations/create`
- ملف الصفحة: `artifacts/ghayth-erp/src/pages/umrah/violation-create.tsx`
- مسجّلة في: `artifacts/ghayth-erp/src/routes/umrahRoutes.tsx:72`
- المجموعة: `operations`
- الكومبوننت: `UmrahViolationCreate`
- subKey: — | minRoleLevel: —
- الكيان المستنبط: `create`
- سطور الملف: 316
- مصدر موجود: ✅

## 2. الأزرار والإجراءات
| الزر / CTA | API | Method | Audit | Event | Lifecycle | Notify | Perm | Tenant | Tx |
|------------|-----|--------|-------|-------|-----------|--------|------|--------|----|
| _(write)_ | `/umrah/violations` | POST | ✅ | ✅ | — | — | ✅ | ✅ | — |

### تفاصيل الأزرار المرئية
- L98: "(بلا تسمية)"
- L219: "(بلا تسمية)" → `() => setLocation("/umrah/violations")`

### القراءات (GET)
_لا قراءات._



## 3. الحركات ذات الصلة (Cross-Module Transactions)
- [ ] **TBD** — راجع `docs/blueprints/operations.md` (إن وُجد) وعدّد:
  - القيود المحاسبية المتوقعة (gl_entries / posting-failures)
  - تأثير الأرصدة (balances, balances_history)
  - الإشعارات (notifications)
  - سير الموافقات (approval_chains)
  - تكامل خارجي (ZATCA / Mudad / WPS / Government)
- يتم تعبئتها يدوياً في مرحلة المراجعة المعزّزة.

## 4. النمذجة
_لم يتم العثور على جدول Drizzle بالاسم المستنبط `create` — قد يكون معرّفًا في migrations فقط (راجع `artifacts/api-server/src/migrations`)._

## 5. البيانات الوهمية الثابتة
✅ لا توجد بيانات وهمية ثابتة مكتشفة آلياً.

## 6. النتيجة (Verdict)
- Runtime audit: **N/A** — لم يُشغّل بعد لهذا المسار.
- توصية: **TBD**
