# /settings/companies — `artifacts/ghayth-erp/src/pages/settings.tsx`

## 1. الميتاداتا
- المسار: `/settings/companies`
- ملف الصفحة: `artifacts/ghayth-erp/src/pages/settings.tsx`
- مسجّلة في: `artifacts/ghayth-erp/src/routes/settingsRoutes.tsx:10`
- المجموعة: `settings`
- الكومبوننت: `Settings`
- subKey: — | minRoleLevel: —
- الكيان المستنبط: `companies`
- سطور الملف: 402
- مصدر موجود: ✅

## 2. الأزرار والإجراءات
_لا توجد طلبات كتابة من هذه الصفحة._

### تفاصيل الأزرار المرئية
- L243: "(بلا تسمية)" → `handleSave` 🔒
- L255: "تعديل" → `() => handleEdit(item)` 🔒
- L256: "حذف" → `() => setDeletingItem({ id: item.id, label: (fields[0] && item[fields[0].name]) ` 🔒

### القراءات (GET)
- GET `/settings/resolved`
- GET `/settings/audit-log`



## 3. الحركات ذات الصلة (Cross-Module Transactions)

إعدادات الشركات (Companies) — Multi-company setup (tenancy + legal entities).

| الحقل | المتطلب |
|------|--------|
| Legal name | إجباري |
| Commercial Register (CR) | إجباري — unique |
| VAT Number | per ZATCA | إجباري للـ tax registration |
| Logo | branding | optional |
| Address | إجباري |
| Industry | enum | optional |
| Currency | base | إجباري |
| Fiscal year start | for accounting | إجباري |
| Time zone | for shifts/reports | إجباري |
| Language(s) | i18n | enum |
| ZATCA EGS credentials | encrypted | for e-invoicing | راجع `admin-integrations.md` |
| Saudi Saudization quota | for compliance | راجع `governance-compliance.md` |

| الحركة | API | DB | الحالة |
|--------|-----|-----|--------|
| List companies | GET `/settings/companies` | `companies` | ✅ |
| Create company | POST | with full registration | ✅ critical |
| Update info | PATCH | with audit | ✅ critical |
| Add branches | راجع `settings-branches.md` | nested | ✅ |
| Set as active | flag | for tenancy switching | ✅ |
| Deactivate (no delete) | guard | if any GL entries exist | ✅ critical |
| Upload logo | راجع `documents.md` | for invoices/letters | ✅ |
| Configure VAT settings | راجع `finance-tax.md` | ✅ critical |
| Connect to ZATCA | external | راجع `admin-integrations.md` | ✅ critical |
| تكامل مع كل المعاملات | tenant scope | every record per company | ✅ critical |
| تكامل مع `finance-chart-of-accounts.md` (per company) | ✅ critical |
| تكامل مع `governance-compliance.md` (Saudi requirements) | ✅ critical |
| Audit log إجباري | كل تعديل | `audit_logs` | ✅ critical |
| RBAC | superadmin فقط | level=100 | ✅ critical |

تحقق يدوي:
- [ ] هل CR + VAT uniqueness enforced at DB?
- [ ] هل ZATCA EGS credentials encrypted (sensitive secrets)?
- [ ] هل tenancy enforced on every read/write (لا cross-company leak)?
- [ ] هل company deactivation preserves historical data?
- [ ] هل Saudization quota tracked + reported?

## 4. النمذجة
- الجدول: `companies` (export: `companies`, 13 عمود)
- tenant col: — | createdBy: — | createdAt: ✅ | updatedAt: — | softDelete: — | lifecycle col: ✅

## 5. البيانات الوهمية الثابتة
✅ لا توجد بيانات وهمية ثابتة مكتشفة آلياً.

## 6. النتيجة (Verdict)
- Runtime audit: **⚠ PARTIAL** — render=PASS | fetch=PASS | CTA=SKIP | nav=FAIL | smoke=PASS
- ملاحظة: `landed=/dashboard expected=/settings/companies`
- لقطة: `audit/screenshots/settings_companies.png`
- landedUrl: `http://localhost/dashboard`
- توصية: **يحتاج إصلاح**
