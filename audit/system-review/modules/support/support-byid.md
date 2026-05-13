# /support/:id — `artifacts/ghayth-erp/src/pages/details/ticket-detail.tsx`

## 1. الميتاداتا
- المسار: `/support/:id`
- ملف الصفحة: `artifacts/ghayth-erp/src/pages/details/ticket-detail.tsx`
- مسجّلة في: `artifacts/ghayth-erp/src/routes/miscRoutes.tsx:111`
- المجموعة: `support`
- الكومبوننت: `TicketDetail`
- subKey: — | minRoleLevel: —
- الكيان المستنبط: `:id`
- سطور الملف: 229
- مصدر موجود: ✅

## 2. الأزرار والإجراءات
_لا توجد طلبات كتابة من هذه الصفحة._

### تفاصيل الأزرار المرئية
- L124: "إرسال الرد" → `handleSendReply` 🔒
- L218: "تأكيد الحذف" → `handleDelete`
- L219: "(بلا تسمية)" → `() => setDeleting(false)`
- L222: "(بلا تسمية)" → `() => setDeleting(true)`

### القراءات (GET)
_لا قراءات._



## 3. الحركات ذات الصلة (Cross-Module Transactions)
تفاصيل تذكرة دعم — يكمّل `support.md` على مستوى الـ entity.

| المحتوى | الوصف |
|------|------|
| Conversation thread | كل الردود الزمنية | راجع `support-replies` |
| Assigned technician | hr/employees ربط |
| Linked client/entity | عرض history |
| Status flow | open → in_progress → resolved → closed |
| Priority | low/medium/high/urgent |
| SLA timer | بناءً على priority |
| Attachments | object storage |
| Tags | للتصنيف + reporting |

| الحركة | API | DB | الحالة |
|--------|-----|-----|--------|
| عرض التذكرة | GET `/support/tickets/:id` | aggregate replies + history | ✅ |
| إضافة رد | POST `/support/tickets/:id/replies` | `support_replies` | ✅ |
| تغيير الحالة | PATCH `/support/tickets/:id/status` | يطلق notifications | ✅ |
| إعادة فتح بعد إغلاق | لو reopened > 3 مرات → flag | لـ quality review | ⚠ |
| ربط بـ KB article | لو الحل شائع | `support_kb_articles` | ✅ |
| تقييم العميل (CSAT) | بعد الإغلاق → استبيان | `support_csat` | ⚠ |
| Escalation tag | manual أو auto-SLA breach | ✅ |
| تأثير على KPI الفني | aggregate | راجع `manager-board.md` | ✅ |
| Audit log | core | `auditMiddleware` (`/support`) | ✅ |
| تكامل WhatsApp/SMS للرد | راجع `communications.md` | ⚠ |

تحقق يدوي:
- [ ] هل التذكرة المُغلقة immutable للردود؟
- [ ] هل العميل يشاهد كل الـ replies أم بعضها internal فقط؟
- [ ] هل re-assignment لفني آخر يُرسل notification للسابق ويُحتفَظ بـ history الإسناد؟

## 4. النمذجة
_لم يتم العثور على جدول Drizzle بالاسم المستنبط `:id` — قد يكون معرّفًا في migrations فقط (راجع `artifacts/api-server/src/migrations`)._

## 5. البيانات الوهمية الثابتة
✅ لا توجد بيانات وهمية ثابتة مكتشفة آلياً.

## 6. النتيجة (Verdict)
- Runtime audit: **✅ PASS** — render=SKIP | fetch=SKIP | CTA=SKIP | nav=SKIP | smoke=SKIP
- ملاحظة: `unresolved: no id resolver for /support/:id`
- landedUrl: `?`
- توصية: مغلق
