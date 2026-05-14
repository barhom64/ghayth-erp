# /bi/dashboards/create — `artifacts/ghayth-erp/src/pages/create/bi/dashboards-create.tsx`

## 1. الميتاداتا
- المسار: `/bi/dashboards/create`
- ملف الصفحة: `artifacts/ghayth-erp/src/pages/create/bi/dashboards-create.tsx`
- مسجّلة في: `artifacts/ghayth-erp/src/routes/biRoutes.tsx:13`
- المجموعة: `bi`
- الكومبوننت: `DashboardsCreate`
- subKey: — | minRoleLevel: —
- الكيان المستنبط: `create`
- سطور الملف: 70
- مصدر موجود: ✅

## 2. الأزرار والإجراءات
_لا توجد طلبات كتابة من هذه الصفحة._

### تفاصيل الأزرار المرئية
- L43: "مسح المسودة" → `clearDraft`
- L63: "(بلا تسمية)" → `() => setLocation("/bi/dashboards")` 🔒
- L64: "(بلا تسمية)" → `handleSubmit` 🔒

### القراءات (GET)
_لا قراءات._



## 3. الحركات ذات الصلة (Cross-Module Transactions)

إنشاء لوحة تحكم (Dashboard) جديدة — Custom BI dashboard builder.

| المكوّن | الوصف |
|---------|------|
| Title | إجباري |
| Description | optional |
| Owner | creator | for sharing rules |
| Visibility | private/team/department/company | enum |
| Widgets | charts, tables, KPI cards | configurable |
| Data sources | views or queries | راجع `bi-kpis.md` |
| Refresh interval | real-time / hourly / daily | enum |
| Filters | global filters per dashboard |
| Drill-down config | navigate to source records |
| Layout | grid-based | drag-drop |
| Theme | light/dark | optional |

| الحركة | API | DB | الحالة |
|--------|-----|-----|--------|
| Create dashboard | POST `/bi/dashboards` | `bi_dashboards` | ✅ |
| Add widgets | POST `/bi/dashboards/:id/widgets` | `bi_widgets` | ✅ |
| Configure data source | server-side validation | sanitize SQL | ✅ critical |
| Validate widget query (no PII leak) | scope check | ✅ critical |
| Share with team/individuals | راجع `governance/sharing.md` | with audit | ⚠ |
| Clone existing dashboard | POST `/bi/dashboards/:id/clone` | ✅ |
| Set as default for role | راجع `admin-roles.md` | ⚠ |
| Schedule snapshot/export | راجع `reports-scheduled.md` | ✅ |
| Embed in external (lو applicable) | with token | ⚠ |
| تكامل مع `bi-kpis.md` (data sources) | ✅ |
| تكامل مع `bi-reports.md` (related reports) | ✅ |
| تكامل مع `governance/approvals.md` (sensitive dashboards) | ⚠ |
| تكامل مع `documents-archive.md` (snapshots retention) | ✅ |
| Audit log إجباري | `audit_logs` | ✅ |
| **PDPL** — masking based on viewer's role | ✅ critical |
| RBAC | scope based on visibility + viewer role | ✅ critical |

تحقق يدوي:
- [ ] هل query DSL sanitized (no SQL injection)?
- [ ] هل PII masking based on viewer's role enforced?
- [ ] هل shared dashboards re-evaluate access per viewer?
- [ ] هل embed tokens revocable + audited?
- [ ] هل dashboard performance OK with many widgets (caching)?

## 4. النمذجة
_لم يتم العثور على جدول Drizzle بالاسم المستنبط `create` — قد يكون معرّفًا في migrations فقط (راجع `artifacts/api-server/src/migrations`)._

## 5. البيانات الوهمية الثابتة
✅ لا توجد بيانات وهمية ثابتة مكتشفة آلياً.

## 6. النتيجة (Verdict)
- Runtime audit: **⚠ PARTIAL** — render=PASS | fetch=SKIP | CTA=PASS | nav=FAIL | smoke=PASS
- ملاحظة: `landed=/dashboard expected=/bi/dashboards/create; write POST /api/intelligence/activity → 200; consoleErr=2`
- لقطة: `audit/screenshots/bi_dashboards_create.png`
- landedUrl: `http://localhost/dashboard`
- توصية: **يحتاج إصلاح**
