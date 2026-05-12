# /hr/overtime/create — `artifacts/ghayth-erp/src/pages/create/hr/overtime-create.tsx`

## 1. الميتاداتا
- المسار: `/hr/overtime/create`
- ملف الصفحة: `artifacts/ghayth-erp/src/pages/create/hr/overtime-create.tsx`
- مسجّلة في: `artifacts/ghayth-erp/src/routes/hrRoutes.tsx:126`
- المجموعة: `hr`
- الكومبوننت: `OvertimeCreate`
- subKey: `attendance` | minRoleLevel: —
- الكيان المستنبط: `create`
- سطور الملف: 247
- مصدر موجود: ✅

## 2. الأزرار والإجراءات
| الزر / CTA | API | Method | Audit | Event | Lifecycle | Notify | Perm | Tenant | Tx |
|------------|-----|--------|-------|-------|-----------|--------|------|--------|----|
| _(write)_ | `/hr/overtime` | POST | ✅ | ✅ | — | — | ✅ | ✅ | — |

### تفاصيل الأزرار المرئية
- L129: "مسح المسودة" → `clearDraft`
- L235: "(بلا تسمية)" 🔒
- L239: "(بلا تسمية)" → `() => setLocation("/hr/overtime")`

### القراءات (GET)
- GET `/employees?limit=500`



## 3. الحركات ذات الصلة (Cross-Module Transactions)
- [ ] **TBD** — راجع `docs/blueprints/hr.md` (إن وُجد) وعدّد:
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
- Runtime audit: **TBD** — راجع `audit/runtime-audit-results.json` (`/hr/overtime/create`)
- توصية: **TBD**
- المشاكل: 0 مدخل آلي. أضِفها إلى `audit/system-review/findings/FINDINGS.csv`.
