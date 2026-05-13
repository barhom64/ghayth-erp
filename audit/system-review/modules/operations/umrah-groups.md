# /umrah/groups — `artifacts/ghayth-erp/src/pages/umrah/groups.tsx`

## 1. الميتاداتا
- المسار: `/umrah/groups`
- ملف الصفحة: `artifacts/ghayth-erp/src/pages/umrah/groups.tsx`
- مسجّلة في: `artifacts/ghayth-erp/src/routes/umrahRoutes.tsx:79`
- المجموعة: `operations`
- الكومبوننت: `UmrahGroups`
- subKey: — | minRoleLevel: —
- الكيان المستنبط: `groups`
- سطور الملف: 313
- مصدر موجود: ✅

## 2. الأزرار والإجراءات
_لا توجد طلبات كتابة من هذه الصفحة._

### تفاصيل الأزرار المرئية
- L160: "(بلا تسمية)"

### القراءات (GET)
_لا قراءات._



## 3. الحركات ذات الصلة (Cross-Module Transactions)

مجموعات العمرة — Umrah groups (typically per agent or per package).

| نوع المجموعة | الوصف |
|------------|------|
| Domestic | سعودي محلي | from inside KSA |
| International | من الخارج | with visa coordination |
| VIP | premium package | high-end |
| Standard | عادي |
| Economy | اقتصادي |
| Specialized | مرضى/كبار سن | with extra care |

| الحركة | API | DB | الحالة |
|--------|-----|-----|--------|
| List groups | GET `/umrah/groups` | `umrah_groups` | ✅ |
| Create group | per season + agent | راجع `umrah-seasons.md` + `umrah-agents.md` | ✅ |
| Set capacity | max pilgrims | ✅ |
| Assign pilgrims | راجع `umrah-pilgrims.md` | ✅ |
| Assign sub-agent (لو B2B2C) | راجع `umrah-sub-agents.md` | ⚠ |
| Set price per group/per pilgrim | راجع `umrah-pricing.md` | ✅ |
| Visa processing (للـ international) | external | Saudi MoFA + e-visa | راجع `admin-integrations.md` | ✅ critical |
| Hotel booking (Makkah/Madinah) | external integration | راجع `umrah-hotels.md` | ✅ |
| Transport (راجع `umrah-transport.md`) | bus + airport pickup | ✅ |
| Meals plan (لو included) | per package | ⚠ |
| Religious guide (مرشد ديني) | per group | ✅ |
| Schedule (programs) | day-by-day | ✅ |
| Track expenses per group | راجع `finance-expenses.md` | ✅ critical |
| Revenue per group | راجع `finance-invoices.md` | ✅ critical |
| Profitability per group | KPI | راجع `bi-operations.md` | ✅ |
| Commission to agent/sub-agent | راجع `umrah-commission-plans-byid.md` | ✅ critical |
| Penalties (لو cancelled) | راجع `umrah-penalties.md` | ⚠ |
| Pilgrim violations tracking | راجع `umrah-violations.md` | ⚠ |
| تكامل مع `umrah-invoices.md` (per pilgrim or per group) | ✅ critical |
| تكامل مع `finance-zatca.md` (ZATCA invoice) | ✅ critical |
| تكامل مع `umrah-seasons.md` (parent) | ✅ |
| تكامل مع `governance-compliance.md` (Saudi MoHaj + MoFA) | ✅ critical |
| Audit log إجباري | كل تعديل | `audit_logs` | ✅ critical |
| **PDPL** — pilgrim PII (passport, etc.) | encrypted + restricted access | ✅ critical |
| RBAC | umrah-manager + agent (scope) | ✅ |

تحقق يدوي:
- [ ] هل visa processing per pilgrim tracked + blocks group departure لو visa missing؟
- [ ] هل profitability per group accurate (cost allocations + commission)?
- [ ] هل cancellation penalties applied per contract clause بدقة؟
- [ ] هل pilgrim PII encrypted + access logs maintained؟
- [ ] هل Saudi MoHaj reporting requirements met (pre-arrival manifests, etc.)?

## 4. النمذجة
_لم يتم العثور على جدول Drizzle بالاسم المستنبط `groups` — قد يكون معرّفًا في migrations فقط (راجع `artifacts/api-server/src/migrations`)._

## 5. البيانات الوهمية الثابتة
✅ لا توجد بيانات وهمية ثابتة مكتشفة آلياً.

## 6. النتيجة (Verdict)
- Runtime audit: **N/A** — لم يُشغّل بعد لهذا المسار.
- توصية: **TBD**
