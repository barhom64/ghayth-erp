# /bi/admin-reports — `artifacts/ghayth-erp/src/pages/bi-admin-reports.tsx`

## 1. الميتاداتا
- المسار: `/bi/admin-reports`
- ملف الصفحة: `artifacts/ghayth-erp/src/pages/bi-admin-reports.tsx`
- مسجّلة في: `artifacts/ghayth-erp/src/routes/biRoutes.tsx:19`
- المجموعة: `bi`
- الكومبوننت: `BiAdminReports`
- subKey: — | minRoleLevel: —
- الكيان المستنبط: `admin-reports`
- سطور الملف: 375
- مصدر موجود: ✅

## 2. الأزرار والإجراءات
_لا توجد طلبات كتابة من هذه الصفحة._

### تفاصيل الأزرار المرئية
_لم تُلتقط أزرار._

### القراءات (GET)
- GET `/bi/admin-reports/weekly`
- GET `/bi/admin-reports/monthly`



## 3. الحركات ذات الصلة (Cross-Module Transactions)

Admin Reports — تقارير إدارية شهرية/فصلية/سنوية للـ exec leadership.

| نوع التقرير | الفترة | المحتوى |
|------------|--------|---------|
| Monthly Executive | شهري | finance + ops + hr + sales summary |
| Quarterly Board | فصلي | P&L + balance sheet + KPIs + initiatives |
| Annual Report | سنوي | comprehensive — للـ stakeholders |
| Department Performance | شهري | per department KPIs |
| Branch Performance | شهري | per branch P&L + ops |
| Audit Summary | فصلي | findings من governance/audits |
| Compliance Report | حسب الـ standard | راجع `governance-compliance.md` |
| Strategic Initiatives | فصلي | per initiative status |

| الحركة | API | DB | الحالة |
|--------|-----|-----|--------|
| List admin reports | GET `/bi/admin-reports` | `bi_admin_reports` | ✅ |
| Monthly report | GET `/bi/admin-reports/monthly` | aggregations لشهر معيّن | ✅ |
| Quarterly report | GET `/bi/admin-reports/quarterly` | ✅ |
| Annual report | GET `/bi/admin-reports/annual` | ✅ |
| Generate (async) | POST `/bi/admin-reports/generate` | job queue | ⚠ |
| Status check | GET `/bi/admin-reports/jobs/:id` | للـ progress | ⚠ |
| Download (PDF/Excel) | GET `/bi/admin-reports/:id/download` | with audit log | ✅ |
| Email distribute | POST `/bi/admin-reports/:id/distribute` | لقائمة exec | ⚠ |
| Schedule recurring | POST `/bi/admin-reports/schedule` | راجع `reports-scheduled.md` | ✅ |
| Version history | كل تقرير له نسخ | `report_versions` | ✅ |
| تكامل مع `bi-reports.md` (engine) | ✅ |
| تكامل مع `documents-archive.md` (للحفظ) | retention 7 سنوات للسنوي | ✅ critical |
| تكامل مع `governance-compliance.md` (regulatory) | ✅ |
| **PDPL** — أسماء employees مخفية في الـ board reports (إن أُصدرت للخارج) | masking | ⚠ |
| Audit log إجباري | كل generate + download + distribute | `audit_logs` | ✅ critical |
| RBAC | exec/board فقط | level≥80 | ✅ critical |

تحقق يدوي:
- [ ] هل التقارير المُصدرة للخارج (board) تمر بـ approval قبل التوزيع؟
- [ ] هل version history يحفظ snapshot أم يعيد إنشاء؟
- [ ] هل scheduled reports تخفق بأمان (retry + alert) لو فشلت؟
- [ ] هل download كبير (annual) لا يبطئ النظام (async + queue)؟

## 4. النمذجة
_لم يتم العثور على جدول Drizzle بالاسم المستنبط `admin-reports` — قد يكون معرّفًا في migrations فقط (راجع `artifacts/api-server/src/migrations`)._

## 5. البيانات الوهمية الثابتة
✅ لا توجد بيانات وهمية ثابتة مكتشفة آلياً.

## 6. النتيجة (Verdict)
- Runtime audit: **⚠ PARTIAL** — render=PASS | fetch=PASS | CTA=SKIP | nav=FAIL | smoke=PASS
- ملاحظة: `landed=/dashboard expected=/bi/admin-reports`
- لقطة: `audit/screenshots/bi_admin_reports.png`
- landedUrl: `http://localhost/dashboard`
- توصية: **يحتاج إصلاح**
