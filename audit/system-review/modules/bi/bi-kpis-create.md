# /bi/kpis/create — `artifacts/ghayth-erp/src/pages/create/bi/kpis-create.tsx`

## 1. الميتاداتا
- المسار: `/bi/kpis/create`
- ملف الصفحة: `artifacts/ghayth-erp/src/pages/create/bi/kpis-create.tsx`
- مسجّلة في: `artifacts/ghayth-erp/src/routes/biRoutes.tsx:15`
- المجموعة: `bi`
- الكومبوننت: `KpisCreate`
- subKey: — | minRoleLevel: —
- الكيان المستنبط: `create`
- سطور الملف: 101
- مصدر موجود: ✅

## 2. الأزرار والإجراءات
_لا توجد طلبات كتابة من هذه الصفحة._

### تفاصيل الأزرار المرئية
- L52: "مسح المسودة" → `clearDraft`
- L94: "(بلا تسمية)" → `() => setLocation("/bi/kpis")` 🔒
- L95: "(بلا تسمية)" → `handleSubmit` 🔒

### القراءات (GET)
_لا قراءات._



## 3. الحركات ذات الصلة (Cross-Module Transactions)

إنشاء KPI جديد — Custom KPI definition.

| الحقل | المتطلب |
|------|--------|
| Name | إجباري |
| Category | enum (financial/operational/HR/sales/customer/compliance/sustainability) |
| Definition | formula / SQL query | إجباري |
| Unit | currency/%/count/days/hours |
| Frequency | daily/weekly/monthly/quarterly/annual |
| Target value | per period |
| Threshold (green/yellow/red) | for alerting |
| Direction | higher-is-better / lower-is-better | enum |
| Owner | accountable person | إجباري |
| Data source | view or table | إجباري |
| Drill-down config | navigate to source records |

| الحركة | API | DB | الحالة |
|--------|-----|-----|--------|
| Create KPI | POST `/bi/kpis` | `bi_kpis` | ✅ |
| Validate formula | server-side | sanitize SQL | ✅ critical |
| Test calculation | dry-run | sample period | ⚠ |
| Schedule recalculation | راجع `automation.md` | per frequency | ✅ |
| Trigger alerts on threshold breach | event=`kpi_threshold_breached` | راجع `notifications.md` | ✅ critical |
| Track historical values | for trend analysis | `kpi_values_history` | ✅ |
| Add to dashboard | راجع `bi-dashboards.md` | ✅ |
| Set as KPI for role/department | راجع `admin-roles.md` | ⚠ |
| Compare actual vs target | aggregate | ✅ |
| Period comparison (this vs last) | derived | ✅ |
| تكامل مع `bi-dashboards.md` (display) | ✅ |
| تكامل مع `intelligence.md` (executive alerts) | ✅ critical |
| تكامل مع `automation.md` (action on threshold) | ✅ |
| تكامل مع `bi-reports.md` (KPI reports) | ✅ |
| تكامل مع `governance-compliance.md` (compliance KPIs) | ✅ |
| Audit log إجباري | `audit_logs` | ✅ |
| RBAC | analytics lead + admin | ✅ |

تحقق يدوي:
- [ ] هل formula sanitization صارم (no SQL injection)?
- [ ] هل threshold breach alerts deduplicated (لا spam)?
- [ ] هل historical retention period adequate (e.g., 3 years)?
- [ ] هل cross-KPI dependencies tracked (e.g., revenue depends on AR)?
- [ ] هل drill-down navigation works للـ underlying transactions?

## 4. النمذجة
_لم يتم العثور على جدول Drizzle بالاسم المستنبط `create` — قد يكون معرّفًا في migrations فقط (راجع `artifacts/api-server/src/migrations`)._

## 5. البيانات الوهمية الثابتة
✅ لا توجد بيانات وهمية ثابتة مكتشفة آلياً.

## 6. النتيجة (Verdict)
- Runtime audit: **⚠ PARTIAL** — render=PASS | fetch=SKIP | CTA=PASS | nav=FAIL | smoke=PASS
- ملاحظة: `landed=/dashboard expected=/bi/kpis/create; write POST /api/intelligence/activity → 200`
- لقطة: `audit/screenshots/bi_kpis_create.png`
- landedUrl: `http://localhost/dashboard`
- توصية: **يحتاج إصلاح**
