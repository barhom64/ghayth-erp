# /bi/reports/create — `artifacts/ghayth-erp/src/pages/create/bi/reports-create.tsx`

## 1. الميتاداتا
- المسار: `/bi/reports/create`
- ملف الصفحة: `artifacts/ghayth-erp/src/pages/create/bi/reports-create.tsx`
- مسجّلة في: `artifacts/ghayth-erp/src/routes/biRoutes.tsx:17`
- المجموعة: `bi`
- الكومبوننت: `BiReportsCreate`
- subKey: — | minRoleLevel: —
- الكيان المستنبط: `create`
- سطور الملف: 101
- مصدر موجود: ✅

## 2. الأزرار والإجراءات
_لا توجد طلبات كتابة من هذه الصفحة._

### تفاصيل الأزرار المرئية
- L47: "مسح المسودة" → `clearDraft`
- L94: "(بلا تسمية)" → `() => setLocation("/bi/reports")` 🔒
- L95: "(بلا تسمية)" → `handleSubmit` 🔒

### القراءات (GET)
_لا قراءات._



## 3. الحركات ذات الصلة (Cross-Module Transactions)

إنشاء تقرير مخصّص — Custom report builder.

| الحقل | المتطلب |
|------|--------|
| Name | إجباري |
| Category | enum (finance/HR/sales/ops/compliance) |
| Data source | view or curated query | إجباري |
| Filters | parameters | flexible |
| Columns / fields | selected | from data source schema |
| Aggregations | sum/avg/count/min/max | per column |
| Sort/Group | configuration |
| Format | table/chart/PDF | enum |
| Schedule (لو recurring) | راجع `reports-scheduled.md` |
| Recipients (لو email) | راجع `notifications.md` |

| الحركة | API | DB | الحالة |
|--------|-----|-----|--------|
| Create report | POST `/bi/reports` | `bi_reports` | ✅ |
| Validate query | sanitize | no SQL injection | ✅ critical |
| Validate access (no PII leak) | RBAC scope on data | ✅ critical |
| Test run | POST `/bi/reports/:id/test` | sample output | ⚠ |
| Save as template | clone-able | ✅ |
| Schedule recurring | راجع `reports-scheduled.md` | ✅ |
| Export formats: PDF/Excel/CSV/HTML | راجع `print-templates` | ✅ |
| Linked dashboard | راجع `bi-dashboards-create.md` | optional | ✅ |
| ZATCA-compliant reports (لو regulatory) | راجع `governance-compliance.md` | ✅ critical |
| تكامل مع `documents-archive.md` (snapshots) | retention per regulation | ✅ critical |
| تكامل مع `audit_logs` (per generation) | ✅ |
| **PDPL** — column-level masking | per viewer role | ✅ critical |
| RBAC | report creator + admin + audience | ✅ critical |

تحقق يدوي:
- [ ] هل query sanitization صارم (no raw SQL injection)?
- [ ] هل PII columns auto-masked based on viewer role?
- [ ] هل scheduled reports survive failures (retry + alert)?
- [ ] هل regulatory reports validate against ZATCA/GOSI formats?
- [ ] هل export performance acceptable for large datasets (async + queue)?

## 4. النمذجة
_لم يتم العثور على جدول Drizzle بالاسم المستنبط `create` — قد يكون معرّفًا في migrations فقط (راجع `artifacts/api-server/src/migrations`)._

## 5. البيانات الوهمية الثابتة
✅ لا توجد بيانات وهمية ثابتة مكتشفة آلياً.

## 6. النتيجة (Verdict)
- Runtime audit: **⚠ PARTIAL** — render=PASS | fetch=SKIP | CTA=PASS | nav=FAIL | smoke=PASS
- ملاحظة: `landed=/dashboard expected=/bi/reports/create; write POST /api/intelligence/activity → 200`
- لقطة: `audit/screenshots/bi_reports_create.png`
- landedUrl: `http://localhost/dashboard`
- توصية: **يحتاج إصلاح**
