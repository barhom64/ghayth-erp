# /correspondence/:id — `artifacts/ghayth-erp/src/pages/details/correspondence-detail.tsx`

## 1. الميتاداتا
- المسار: `/correspondence/:id`
- ملف الصفحة: `artifacts/ghayth-erp/src/pages/details/correspondence-detail.tsx`
- مسجّلة في: `artifacts/ghayth-erp/src/routes/commsRoutes.tsx:16`
- المجموعة: `communications`
- الكومبوننت: `CorrespondenceDetail`
- subKey: — | minRoleLevel: —
- الكيان المستنبط: `:id`
- سطور الملف: 379
- مصدر موجود: ✅

## 2. الأزرار والإجراءات
_لا توجد طلبات كتابة من هذه الصفحة._

### تفاصيل الأزرار المرئية
_لم تُلتقط أزرار._

### القراءات (GET)
_لا قراءات._



## 3. الحركات ذات الصلة (Cross-Module Transactions)

تفاصيل مراسلة واحدة — view + actions + audit trail.

| الحركة | API | DB | الحالة |
|--------|-----|-----|--------|
| View details | GET `/correspondence/:id` | `correspondences` | ✅ |
| View thread (replies) | GET `/correspondence/:id/replies` | `correspondence_replies` | ⚠ |
| Reply | POST `/correspondence/:id/reply` | يولّد correspondence جديد مع `parentId` | ✅ |
| Forward | POST `/correspondence/:id/forward` | للـ recipient ثانٍ | ✅ |
| Acknowledge | PATCH `/correspondence/:id/ack` | timestamp + user | ✅ |
| Mark as completed | PATCH `/correspondence/:id/complete` | with outcome | ✅ |
| Cancel | PATCH `/correspondence/:id/cancel` | with reason — soft cancel فقط | ⚠ |
| Update confidentiality (re-classify) | PATCH | requires manager + audit | ⚠ critical |
| Add attachment | POST `/correspondence/:id/attachments` | راجع `documents.md` | ✅ |
| Remove attachment | guard | requires audit | ✅ |
| Workflow status | راجع `governance/workflows.md` | ✅ |
| Audit trail (full history) | GET `/correspondence/:id/audit` | `audit_logs` WHERE entity=correspondence | ✅ |
| Print | POST `/correspondence/:id/print` | راجع `print-templates` | ✅ |
| تكامل مع `legal.md` (لو قانوني) | linkage | ✅ |
| تكامل مع `documents-archive.md` (retention) | حسب نوع المراسلة | ✅ |
| **PDPL** — masking للـ confidential parts عند export | ✅ |
| RBAC | حسب confidentiality | راجع `admin-rbac-matrix.md` | ✅ critical |
| Notify على إجراءات | event=`correspondence_acknowledged/replied/completed` | راجع `notifications.md` | ✅ |
| Immutability بعد completed | guard | لا تعديل (إلا reopen by admin) | ✅ critical |

تحقق يدوي:
- [ ] هل reply يحافظ على الـ thread chain (parent linkage)؟
- [ ] هل الـ confidentiality re-classification audited بشكل صارم؟
- [ ] هل cancelled correspondence مرئية مع علامة واضحة (لا اختفاء)؟
- [ ] هل acknowledge بدون قراءة فعلية ممكن؟ (yes/no by design)

## 4. النمذجة
_لم يتم العثور على جدول Drizzle بالاسم المستنبط `:id` — قد يكون معرّفًا في migrations فقط (راجع `artifacts/api-server/src/migrations`)._

## 5. البيانات الوهمية الثابتة
✅ لا توجد بيانات وهمية ثابتة مكتشفة آلياً.

## 6. النتيجة (Verdict)
- Runtime audit: **✅ PASS** — render=SKIP | fetch=SKIP | CTA=SKIP | nav=SKIP | smoke=SKIP
- ملاحظة: `unresolved: no row in /api/correspondence`
- landedUrl: `?`
- توصية: مغلق
