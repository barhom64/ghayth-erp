# /bi/reports — `artifacts/ghayth-erp/src/pages/bi.tsx`

## 1. الميتاداتا
- المسار: `/bi/reports`
- ملف الصفحة: `artifacts/ghayth-erp/src/pages/bi.tsx`
- مسجّلة في: `artifacts/ghayth-erp/src/routes/biRoutes.tsx:16`
- المجموعة: `bi`
- الكومبوننت: `BI`
- subKey: — | minRoleLevel: —
- الكيان المستنبط: `reports`
- سطور الملف: 48
- مصدر موجود: ✅

## 2. الأزرار والإجراءات
_لا توجد طلبات كتابة من هذه الصفحة._

### تفاصيل الأزرار المرئية
_لم تُلتقط أزرار._

### القراءات (GET)
_لا قراءات._



## 3. الحركات ذات الصلة (Cross-Module Transactions)

BI Reports — تقارير مخصّصة قابلة للإنشاء + التصدير.

| النوع | المثال |
|------|--------|
| Standard reports | predefined (Income Statement, Balance Sheet, Trial Balance) |
| Custom reports | user-defined SQL queries |
| Scheduled reports | راجع `scheduled-reports.md` |
| Ad-hoc analysis | one-off explorations |
| Regulatory reports | ZATCA returns, GOSI summary |

| الحركة | API | DB | الحالة |
|--------|-----|-----|--------|
| إنشاء تقرير | POST `/bi/reports` | `bi_reports` (query + columns + filters) | ✅ |
| تنفيذ تقرير | POST `/bi/reports/:id/run` | يقرأ aggregations | ✅ |
| تصدير | CSV / PDF / Excel | راجع `export.ts` | ✅ |
| Scheduling | راجع `scheduled-reports.md` | ✅ |
| Sharing | RBAC على الـ report (owners + viewers) | `bi_report_shares` | ⚠ |
| Caching (للأداء) | per query + TTL | redis or in-memory | ⚠ |
| Version control | snapshots عند التعديل | `bi_report_versions` | ⚠ |
| Drill-down | navigate to source rows | ✅ |
| Embed in dashboards | راجع `bi-dashboards.md` | ✅ |
| SQL injection guard | parameterized queries فقط | guard | ✅ critical |
| Audit log إجباري للـ regulatory | core | `audit_logs` | ✅ |
| RBAC على البيانات الحساسة | راجع `maskFields()` (PR #481) | ✅ |

تحقق يدوي:
- [ ] هل user يستطيع كتابة SQL مباشر أم فقط query builder UI؟
- [ ] هل تقارير financial محصورة على CFO + accountants؟
- [ ] هل التصدير لـ PDF يحفظ snapshot للـ archive؟

## 4. النمذجة
_لم يتم العثور على جدول Drizzle بالاسم المستنبط `reports` — قد يكون معرّفًا في migrations فقط (راجع `artifacts/api-server/src/migrations`)._

## 5. البيانات الوهمية الثابتة
✅ لا توجد بيانات وهمية ثابتة مكتشفة آلياً.

## 6. النتيجة (Verdict)
- Runtime audit: **⚠ PARTIAL** — render=PASS | fetch=PASS | CTA=SKIP | nav=FAIL | smoke=PASS
- ملاحظة: `landed=/dashboard expected=/bi/reports`
- لقطة: `audit/screenshots/bi_reports.png`
- landedUrl: `http://localhost/dashboard`
- توصية: **يحتاج إصلاح**
