# /admin/posting-failures — `artifacts/ghayth-erp/src/pages/admin-posting-failures.tsx`

## 1. الميتاداتا
- المسار: `/admin/posting-failures`
- ملف الصفحة: `artifacts/ghayth-erp/src/pages/admin-posting-failures.tsx`
- مسجّلة في: `artifacts/ghayth-erp/src/routes/adminRoutes.tsx:32`
- المجموعة: `admin`
- الكومبوننت: `AdminPostingFailures`
- subKey: — | minRoleLevel: —
- الكيان المستنبط: `posting-failures`
- سطور الملف: 121
- مصدر موجود: ✅

## 2. الأزرار والإجراءات
_لا توجد طلبات كتابة من هذه الصفحة._

### تفاصيل الأزرار المرئية
- L60: "(بلا تسمية)" → `() => setShowResolved(!showResolved)`
- L67: "(بلا تسمية)" → `() => refetch()`

### القراءات (GET)
_لا قراءات._



## 3. الحركات ذات الصلة (Cross-Module Transactions)
Posting Failures — مركز معالجة القيود المالية الفاشلة. **حرج جداً** للسلامة المالية.

| السبب | كيف يحدث | كيف يُعالَج |
|------|---------|--------------|
| Fiscal period closed | محاولة post في فترة مغلقة | إعادة فتح الفترة (admin only) أو نقل للفترة المفتوحة |
| Account not found | accountCode غير موجود في `chart_of_accounts` | إضافة الحساب ثم retry |
| Balance constraint | DR ≠ CR | تصحيح يدوي للقيد |
| Tenant scope mismatch | companyId mismatch | إصلاح يدوي + audit |
| FX rate missing | عملة جديدة بدون rate | تحديث `fx_rates` ثم retry |
| Network/DB error | transient infrastructure | retry تلقائي 3 مرات ثم DLQ |

| الحركة | API | DB | الحالة |
|--------|-----|-----|--------|
| تسجيل الفشل | `accounting-engine.ts` يلتقط الـ exception ويكتب row | `posting_failures` | ✅ |
| عرض queue | GET `/admin/posting-failures` | ORDER BY createdAt | ✅ |
| Retry يدوي | POST `/admin/posting-failures/:id/retry` | يعيد محاولة `postJournal()` | ✅ |
| Resolve manually | PATCH (سبب الحل + المراجع) | `failure.resolvedAt` | ✅ |
| إشعار للـ Finance Manager | event=`posting_failure_critical` | `notifications` | ✅ critical |
| Auto-retry policy | cron retries up to 3× | ✅ |
| تأثير على فترة الإقفال | يجب صفر failures قبل closing الفترة | guard | ✅ |
| Audit log إجباري | كل retry/resolve يُسجَّل | `audit_logs` | ✅ critical |

تحقق يدوي:
- [ ] هل وجود فشل > 24h يطلق إشعار escalation لـ CFO؟
- [ ] هل auto-retry يتجنب نفس النوع من الفشل (smart backoff)؟
- [ ] هل DLQ events قابلة لإعادة المعالجة بعد إصلاح السبب الجذري؟

## 4. النمذجة
_لم يتم العثور على جدول Drizzle بالاسم المستنبط `posting-failures` — قد يكون معرّفًا في migrations فقط (راجع `artifacts/api-server/src/migrations`)._

## 5. البيانات الوهمية الثابتة
✅ لا توجد بيانات وهمية ثابتة مكتشفة آلياً.

## 6. النتيجة (Verdict)
- Runtime audit: **⚠ PARTIAL** — render=PASS | fetch=PASS | CTA=SKIP | nav=FAIL | smoke=PASS
- ملاحظة: `landed=/dashboard expected=/admin/posting-failures`
- لقطة: `audit/screenshots/admin_posting_failures.png`
- landedUrl: `http://localhost/dashboard`
- توصية: **يحتاج إصلاح**
