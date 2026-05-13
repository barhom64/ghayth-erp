# /finance/gl-posting-queue — `artifacts/ghayth-erp/src/pages/finance/gl-posting-queue.tsx`

## 1. الميتاداتا
- المسار: `/finance/gl-posting-queue`
- ملف الصفحة: `artifacts/ghayth-erp/src/pages/finance/gl-posting-queue.tsx`
- مسجّلة في: `artifacts/ghayth-erp/src/routes/financeRoutes.tsx:133`
- المجموعة: `finance`
- الكومبوننت: `GLPostingQueue`
- subKey: — | minRoleLevel: —
- الكيان المستنبط: `gl-posting-queue`
- سطور الملف: 634
- مصدر موجود: ✅

## 2. الأزرار والإجراءات
_لا توجد طلبات كتابة من هذه الصفحة._

### تفاصيل الأزرار المرئية
_لم تُلتقط أزرار._

### القراءات (GET)
_لا قراءات._



## 3. الحركات ذات الصلة (Cross-Module Transactions)
GL Posting Queue — قيود تنتظر الترحيل (pending posting).

| الحالة | الوصف |
|--------|------|
| `pending` | منتظر — لاعتماد أو فترة مفتوحة |
| `approved` | اعتُمد لكن لم يُرحَّل |
| `posting` | جاري الترحيل (lock) |
| `posted` | مُرحَّل في `gl_lines` |
| `failed` | فشل — راجع `admin-posting-failures.md` |
| `held` | معلَّق يدوياً (CFO override) |

| الحركة | API | DB | الحالة |
|--------|-----|-----|--------|
| Enqueue قيد | كل عملية مالية تدفع للـ queue | `gl_posting_queue` | ✅ |
| فحص فترة مالية | راجع `finance-fiscal-periods.md` | guard | ✅ |
| فحص توازن (DR=CR) | inside `withTransaction` | rollback | ✅ |
| Bulk posting (نهاية اليوم) | راجع `daily-close.md` | cron 23:00 | ✅ |
| Reverse posted entry | counter entry فقط، لا حذف | ✅ |
| Block period close | guard | ✅ |
| إشعار CFO عند held > 24h | event=`gl_posting_held` | `notifications` | ⚠ |
| Audit log إجباري | كل تغيير | `audit_logs` | ✅ critical |

تحقق يدوي:
- [ ] هل reverse فقط لتصحيح القيود (لا delete)?
- [ ] هل القيود pending > N أيام تطلق escalation؟
- [ ] هل re-try يعمل آلياً عند فتح فترة مغلقة؟

## 4. النمذجة
_لم يتم العثور على جدول Drizzle بالاسم المستنبط `gl-posting-queue` — قد يكون معرّفًا في migrations فقط (راجع `artifacts/api-server/src/migrations`)._

## 5. البيانات الوهمية الثابتة
✅ لا توجد بيانات وهمية ثابتة مكتشفة آلياً.

## 6. النتيجة (Verdict)
- Runtime audit: **N/A** — لم يُشغّل بعد لهذا المسار.
- توصية: **TBD**
