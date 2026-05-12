# /support — `artifacts/ghayth-erp/src/pages/support.tsx`

## 1. الميتاداتا
- المسار: `/support`
- ملف الصفحة: `artifacts/ghayth-erp/src/pages/support.tsx`
- مسجّلة في: `artifacts/ghayth-erp/src/routes/miscRoutes.tsx:112`
- المجموعة: `support`
- الكومبوننت: `Support`
- subKey: — | minRoleLevel: —
- الكيان المستنبط: `support`
- سطور الملف: 463
- مصدر موجود: ✅

## 2. الأزرار والإجراءات
_لا توجد طلبات كتابة من هذه الصفحة._

### تفاصيل الأزرار المرئية
- L107: "(بلا تسمية)" → `() => setPreviewItem(t)`
- L316: "(بلا تسمية)" → `() => setShowNew(false)`

### القراءات (GET)
- GET `/support/stats`
- GET `/support/kb`
- GET `/support/csat`



## 3. الحركات ذات الصلة (Cross-Module Transactions)
تذاكر الدعم الفني.

| الحركة | الوحدة الهدف | مدخل API | مدخل DB | الحالة |
|--------|--------------|----------|---------|--------|
| فتح تذكرة | support | `support.ts` POST `/tickets` | `support_tickets` | ✅ |
| إسناد لفني | hr/employees | `tickets.assignedTo` → `employees.id` | ✅ |
| ربط بعميل (لو وُجد) | crm | `tickets.clientId` → `clients.id` | ✅ |
| ربط بعقد/أصل (إن مشكلة فنية) | متغيّر | `tickets.entityType/Id` (polymorphic) | ⚠ |
| ردود + KB articles | support | `support_replies`, `support_kb_articles` | ✅ |
| تصاعد SLA | governance | cron يقرأ `tickets.dueAt` + escalate | `notifications` | ✅ |
| قياس CSAT (رضا العميل) | bi | استبيان بعد إغلاق | `support_csat` | ⚠ |
| توليد فاتورة (للخدمات المدفوعة) | finance/invoices | عند إغلاق ticket بمدفوع | `invoices` | ⚠ |
| إشعارات (للعميل + الفني + المدير) | comms | event=`ticket_opened\|replied\|resolved\|escalated` | `notifications` | ✅ |
| تكامل WhatsApp/SMS | gov-integrations | اختياري | `messaging_log` | ⚠ |
| Audit log | core | `auditMiddleware` (`/support`) | `audit_logs` (entity=`support_ticket`) | ✅ |

تحقق يدوي:
- [ ] هل تذكرة تجاوزت SLA تنعكس على KPI الفني (تظهر في hr/performance)؟
- [ ] هل دمج تذاكر متطابقة (merge) يحافظ على تاريخ كلتيهما؟
- [ ] هل KB article مرتبط بتذاكر يحدّث counter مشاهدات؟

## 4. النمذجة
_لم يتم العثور على جدول Drizzle بالاسم المستنبط `support` — قد يكون معرّفًا في migrations فقط (راجع `artifacts/api-server/src/migrations`)._

## 5. البيانات الوهمية الثابتة
✅ لا توجد بيانات وهمية ثابتة مكتشفة آلياً.

## 6. النتيجة (Verdict)
- Runtime audit: **⚠ PARTIAL** — render=PASS | fetch=PASS | CTA=SKIP | nav=FAIL | smoke=PASS
- ملاحظة: `landed=/dashboard expected=/support`
- لقطة: `audit/screenshots/support.png`
- landedUrl: `http://localhost/dashboard`
- توصية: **يحتاج إصلاح**
