# /documents/archive — `artifacts/ghayth-erp/src/pages/documents/archive.tsx`

## 1. الميتاداتا
- المسار: `/documents/archive`
- ملف الصفحة: `artifacts/ghayth-erp/src/pages/documents/archive.tsx`
- مسجّلة في: `artifacts/ghayth-erp/src/routes/documentsRoutes.tsx:17`
- المجموعة: `documents`
- الكومبوننت: `DocumentsArchive`
- subKey: — | minRoleLevel: —
- الكيان المستنبط: `archive`
- سطور الملف: 85
- مصدر موجود: ✅

## 2. الأزرار والإجراءات
_لا توجد طلبات كتابة من هذه الصفحة._

### تفاصيل الأزرار المرئية
_لم تُلتقط أزرار._

### القراءات (GET)
- GET `/documents`



## 3. الحركات ذات الصلة (Cross-Module Transactions)
أرشيف الوثائق. مستندات إلى التقادم/الإغلاق أو لـ retention القانوني.

| الحركة | الوحدة الهدف | مدخل API | مدخل DB | الحالة |
|--------|--------------|----------|---------|--------|
| نقل من active إلى archive | documents | PATCH `/documents/:id/archive` | `documents.archived=true`, `archivedAt` | ✅ |
| تلقائي بعد X سنة | documents | cron يقرأ retention policy per entityType | يُحدّث `archived=true` تلقائياً | ⚠ |
| ربط بـ PDPL retention rules | core | كل `entityType` له مدة retention مختلفة | `pdpl_retention_policies` | ✅ راجع `docs/SAUDI_COMPLIANCE_DESIGN.md` |
| نقل لـ cold storage (object storage class) | storage | lifecycle policy على S3/Azure | تقليل تكلفة التخزين | ⚠ |
| استرجاع من الأرشيف | documents | POST `/documents/:id/unarchive` (يحتاج موافقة) | إعادة `archived=false` | ✅ |
| حذف نهائي (PDPL right to be forgotten) | documents | DELETE `/documents/:id/permanent` | `documents.deletedAt + content scrubbed` | ✅ |
| سجل قانوني (للقضايا المنتهية) | legal | بعد إغلاق قضية → ترحيل تلقائي | `legal_archive` | ⚠ |
| سجل المراسلات المنتهية | communications | مراسلات قديمة → أرشيف | ✅ |
| تأثير على البحث | documents | الأرشيف لا يظهر في البحث الافتراضي | ✅ |
| تأثير على التقارير المالية | finance/reports | يحفظ الـ snapshot لو entity مالي | ✅ |
| إشعار عند archive تلقائي | comms | event=`document_archived` | `notifications` | ⚠ |
| Audit log | core | إجباري لأي عملية archive/restore/delete | `audit_logs` | ✅ |

تحقق يدوي:
- [ ] هل سياسة retention مختلفة لـ legal vs HR vs finance؟ (مثلاً سنة لـ marketing، 10 سنوات لـ finance، forever لـ legal)
- [ ] هل المستخدم العادي يستطيع رؤية وثيقة مؤرشفة (read-only) أم محظور كلياً؟
- [ ] هل right-to-be-forgotten يطبق على PDPL data subject request workflow؟
- [ ] هل audit_logs للوثائق المحذوفة محفوظ حتى لو الوثيقة نفسها محذوفة؟

## 4. النمذجة
_لم يتم العثور على جدول Drizzle بالاسم المستنبط `archive` — قد يكون معرّفًا في migrations فقط (راجع `artifacts/api-server/src/migrations`)._

## 5. البيانات الوهمية الثابتة
✅ لا توجد بيانات وهمية ثابتة مكتشفة آلياً.

## 6. النتيجة (Verdict)
- Runtime audit: **⚠ PARTIAL** — render=PASS | fetch=PASS | CTA=SKIP | nav=FAIL | smoke=PASS
- ملاحظة: `landed=/dashboard expected=/documents/archive`
- لقطة: `audit/screenshots/documents_archive.png`
- landedUrl: `http://localhost/dashboard`
- توصية: **يحتاج إصلاح**
