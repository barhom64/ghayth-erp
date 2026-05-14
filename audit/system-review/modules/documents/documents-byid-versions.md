# /documents/:docId/versions — `artifacts/ghayth-erp/src/pages/create/documents/version-upload.tsx`

## 1. الميتاداتا
- المسار: `/documents/:docId/versions`
- ملف الصفحة: `artifacts/ghayth-erp/src/pages/create/documents/version-upload.tsx`
- مسجّلة في: `artifacts/ghayth-erp/src/routes/documentsRoutes.tsx:13`
- المجموعة: `documents`
- الكومبوننت: `VersionUpload`
- subKey: — | minRoleLevel: —
- الكيان المستنبط: `versions`
- سطور الملف: 166
- مصدر موجود: ✅

## 2. الأزرار والإجراءات
_لا توجد طلبات كتابة من هذه الصفحة._

### تفاصيل الأزرار المرئية
- L106: "مسح المسودة" → `clearDraft`
- L133: "(بلا تسمية)" → `handleUploadVersion` 🔒

### القراءات (GET)
_لا قراءات._



## 3. الحركات ذات الصلة (Cross-Module Transactions)

إصدارات مستند (Document Versions) — Version control for documents.

| الحقل | الوصف |
|------|------|
| Version number | auto-increment | semantic versioning |
| Uploaded by | user | إجباري |
| Upload date | timestamp |
| File size + type | metadata |
| Storage location | S3/blob | encrypted at-rest |
| Hash (SHA-256) | for integrity | إجباري critical |
| Change description | optional |
| Status | draft/active/superseded/deleted |
| Linked approvals | راجع `governance/approvals.md` |

| الحركة | API | DB | الحالة |
|--------|-----|-----|--------|
| View versions | GET `/documents/:id/versions` | `document_versions` | ✅ |
| Upload new version | POST | with hash + audit | ✅ critical |
| Mark as current (activate) | PATCH `/versions/:vid/activate` | supersede previous | ✅ critical |
| Download specific version | GET `/versions/:vid/download` | with access log | ✅ critical |
| Compare versions | side-by-side or diff | ⚠ |
| Revert to previous | with audit | ⚠ critical |
| Delete version (soft) | guard if active | ✅ |
| Lock version (immutable) | for legal hold | راجع `documents-legal-hold.md` | ⚠ critical |
| Verify integrity (hash check) | server-side | ✅ critical |
| Watermark (for sensitive docs) | optional | per-download | ⚠ |
| تكامل مع `documents.md` (parent) | ✅ |
| تكامل مع `documents-archive.md` (retention per type) | ✅ critical |
| تكامل مع `governance/approvals.md` (sign-off per version) | ✅ |
| تكامل مع `legal.md` (لو evidence in cases) | ✅ |
| تكامل مع `governance-compliance.md` (regulator retention) | ✅ critical |
| Audit log إجباري | كل upload/activate/download/delete | `audit_logs` + `access_logs` | ✅ critical |
| **PDPL** — encryption + access scope | ✅ critical |
| RBAC | per document confidentiality + version state | ✅ critical |

تحقق يدوي:
- [ ] هل hash verification routine يكشف tampering?
- [ ] هل deleted versions truly soft-deleted (no data loss)?
- [ ] هل legal hold prevents deletion عبر RBAC + DB constraints?
- [ ] هل watermark applied to sensitive downloads?
- [ ] هل version control performance OK for large files (chunking)?

## 4. النمذجة
_لم يتم العثور على جدول Drizzle بالاسم المستنبط `versions` — قد يكون معرّفًا في migrations فقط (راجع `artifacts/api-server/src/migrations`)._

## 5. البيانات الوهمية الثابتة
✅ لا توجد بيانات وهمية ثابتة مكتشفة آلياً.

## 6. النتيجة (Verdict)
- Runtime audit: **⚠ PARTIAL** — render=PASS | fetch=PASS | CTA=SKIP | nav=FAIL | smoke=PASS
- ملاحظة: `landed=/dashboard expected=/documents/1/versions`
- لقطة: `audit/screenshots/documents_docId_versions.png`
- landedUrl: `http://localhost/dashboard`
- توصية: **يحتاج إصلاح**
