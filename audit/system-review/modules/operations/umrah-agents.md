# /umrah/agents — `artifacts/ghayth-erp/src/pages/umrah/agents.tsx`

## 1. الميتاداتا
- المسار: `/umrah/agents`
- ملف الصفحة: `artifacts/ghayth-erp/src/pages/umrah/agents.tsx`
- مسجّلة في: `artifacts/ghayth-erp/src/routes/umrahRoutes.tsx:52`
- المجموعة: `operations`
- الكومبوننت: `UmrahAgents`
- subKey: — | minRoleLevel: —
- الكيان المستنبط: `agents`
- سطور الملف: 238
- مصدر موجود: ✅

## 2. الأزرار والإجراءات
_لا توجد طلبات كتابة من هذه الصفحة._

### تفاصيل الأزرار المرئية
- L122: "(بلا تسمية)" → `() => openEdit(a)`
- L123: "(بلا تسمية)" → `() => setDeleteId(a.id)`
- L215: "إلغاء" → `closeDialog` 🔒
- L216: "(بلا تسمية)" → `handleSubmit` 🔒
- L228: "(بلا تسمية)" → `() => setDeleteId(null)` 🔒

### القراءات (GET)
- GET `/umrah/agents`



## 3. الحركات ذات الصلة (Cross-Module Transactions)

وكلاء العمرة — Umrah agents (typically external B2B partners).

| نوع الوكيل | الوصف |
|----------|------|
| Main agent (وكيل رئيسي) | direct B2B | with credit terms |
| Sub-agent | راجع `umrah-sub-agents.md` | reports to main |
| Inbound | foreign agents bringing pilgrims | Saudi MoHaj license |
| Outbound | local agents | within KSA |

| الحركة | API | DB | الحالة |
|--------|-----|-----|--------|
| List agents | GET `/umrah/agents` | `umrah_agents` | ✅ |
| Create agent | راجع `crm/clients.md` (as B2B client) + add MoHaj license | ✅ |
| MoHaj license tracking | mandatory for inbound | راجع `governance-compliance.md` | ✅ critical |
| License expiry alerts | راجع `notifications.md` | ✅ critical |
| Commission plan assignment | راجع `umrah-commission-plans.md` | ✅ |
| Credit limit per agent | راجع `crm/clients.md` for AR | ✅ critical |
| Active groups per agent | aggregate | راجع `umrah-groups.md` | ✅ |
| Pilgrim count YTD | KPI | ✅ |
| Revenue from agent | aggregate | ✅ |
| Commission paid YTD | aggregate | راجع `finance-payments.md` | ✅ |
| Outstanding AR | راجع `finance-ar-aging.md` | ✅ critical |
| Sub-agent network | راجع `umrah-sub-agents.md` | ⚠ |
| Performance rating | quality, on-time, complaints | ⚠ |
| Blacklist (لو issues) | guard | يمنع new groups | ✅ critical |
| Contract (B2B) | راجع `legal-contracts-byid.md` | ✅ |
| تكامل مع `umrah-groups.md` (assignment) | ✅ |
| تكامل مع `umrah-commission-plans.md` (compensation) | ✅ critical |
| تكامل مع `finance-invoices.md` (B2B invoicing) | ✅ critical |
| تكامل مع Saudi MoHaj (Nusuk platform) | external | راجع `admin-integrations.md` | ✅ critical |
| تكامل مع `crm/clients.md` (master record) | ✅ |
| Audit log إجباري | كل تعديل | `audit_logs` | ✅ critical |
| RBAC | umrah-manager + finance for credit | ✅ |

تحقق يدوي:
- [ ] هل MoHaj license expiry يمنع creating new groups بعد expiry؟
- [ ] هل credit limit enforced للـ B2B agents بدقة؟
- [ ] هل commission auto-calculated per group accurately?
- [ ] هل blacklist prevents kicked-off agents من العودة بأسماء أخرى (national ID/CR check)?
- [ ] هل Nusuk integration syncs agent licenses + pilgrim assignments بشكل صحيح?

## 4. النمذجة
_لم يتم العثور على جدول Drizzle بالاسم المستنبط `agents` — قد يكون معرّفًا في migrations فقط (راجع `artifacts/api-server/src/migrations`)._

## 5. البيانات الوهمية الثابتة
✅ لا توجد بيانات وهمية ثابتة مكتشفة آلياً.

## 6. النتيجة (Verdict)
- Runtime audit: **⚠ PARTIAL** — render=PASS | fetch=PASS | CTA=SKIP | nav=FAIL | smoke=PASS
- ملاحظة: `landed=/dashboard expected=/umrah/agents`
- لقطة: `audit/screenshots/umrah_agents.png`
- landedUrl: `http://localhost/dashboard`
- توصية: **يحتاج إصلاح**
