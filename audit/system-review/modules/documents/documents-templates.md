# /documents/templates — `artifacts/ghayth-erp/src/pages/documents/templates.tsx`

## 1. الميتاداتا
- المسار: `/documents/templates`
- ملف الصفحة: `artifacts/ghayth-erp/src/pages/documents/templates.tsx`
- مسجّلة في: `artifacts/ghayth-erp/src/routes/documentsRoutes.tsx:16`
- المجموعة: `documents`
- الكومبوننت: `DocumentsTemplates`
- subKey: — | minRoleLevel: —
- الكيان المستنبط: `templates`
- سطور الملف: 516
- مصدر موجود: ✅

## 2. الأزرار والإجراءات
| الزر / CTA | API | Method | Audit | Event | Lifecycle | Notify | Perm | Tenant | Tx |
|------------|-----|--------|-------|-------|-----------|--------|------|--------|----|
| _(write)_ | `/documents/templates` | POST | ✅ | ✅ | — | — | ✅ | ✅ | — |

### تفاصيل الأزرار المرئية
- L235: "(بلا تسمية)" → `() => { setViewMode("list"); setEditingId(null);`
- L241: "معاينة" → `handleLivePreview` 🔒
- L346: "(بلا تسمية)" → `() => removeVariable(i)`
- L477: "معاينة" → `() => handlePreview(t)`

### القراءات (GET)
- GET `/documents/templates`
- GET `/settings/branches`



## 3. الحركات ذات الصلة (Cross-Module Transactions)
قوالب المستندات (Contract Templates, Letter Templates, …).

| الحركة | الوحدة الهدف | مدخل API | مدخل DB | الحالة |
|--------|--------------|----------|---------|--------|
| إنشاء قالب | documents | `documents.ts` POST `/templates` | `document_templates` | ✅ |
| تعريف متغيرات (placeholders) | documents | حقل `variables` JSON | يستخدم لتعبئة من entity | ✅ |
| توليد مستند من قالب | documents | POST `/documents/from-template/:id` (مع entity binding) | `documents` row جديد | ✅ |
| ربط بـ entity (employee/contract/case) | متغيّر | `documents.entityType + entityId` | polymorphic FK | ✅ |
| تخزين الملف الناتج | storage | `documents.fileUrl` → object storage | `lib/object-storage-web` | ✅ |
| توقيع رقمي (إن مفعّل) | digital-signature | `digital-signature.ts` POST `/sign/:docId` | `digital_signatures` | ✅ موجود |
| نسخ الأرشيف (versions) | documents | كل تعديل ينشئ نسخة | `document_versions` | ✅ |
| إشعار الطرف المعني | comms | عند توليد المستند → `notifications` | actionUrl يفتح المستند | ✅ |
| طباعة / تصدير PDF | documents | عبر `lib/object-storage` + PDF lib | ✅ |
| ربط بـ HR/properties/legal | متغيّر | عقد عمل (hr) → `contracts`, عقد إيجار (properties) → `property_contracts`, مذكرة قانونية (legal) → `legal_cases` | ✅ |
| Audit log | core | `auditMiddleware` (`/documents`) | `audit_logs` | ✅ |

تحقق يدوي:
- [ ] هل القالب المُحدّث يطبق على المستندات الموجودة أم فقط الجديدة؟
- [ ] هل المتغيرات الإلزامية في القالب تُمنع توليد مستند ناقص؟
- [ ] هل توقيع المستند يُجمّد محتواه (immutable)؟
- [ ] هل القالب القانوني يستلزم موافقة مدير قانوني قبل التفعيل؟

## 4. النمذجة
_لم يتم العثور على جدول Drizzle بالاسم المستنبط `templates` — قد يكون معرّفًا في migrations فقط (راجع `artifacts/api-server/src/migrations`)._

## 5. البيانات الوهمية الثابتة
✅ لا توجد بيانات وهمية ثابتة مكتشفة آلياً.

## 6. النتيجة (Verdict)
- Runtime audit: **⚠ PARTIAL** — render=PASS | fetch=PASS | CTA=SKIP | nav=FAIL | smoke=PASS
- ملاحظة: `landed=/dashboard expected=/documents/templates`
- لقطة: `audit/screenshots/documents_templates.png`
- landedUrl: `http://localhost/dashboard`
- توصية: **يحتاج إصلاح**
