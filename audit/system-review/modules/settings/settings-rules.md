# /settings/rules — `artifacts/ghayth-erp/src/pages/settings-rules.tsx`

## 1. الميتاداتا
- المسار: `/settings/rules`
- ملف الصفحة: `artifacts/ghayth-erp/src/pages/settings-rules.tsx`
- مسجّلة في: `artifacts/ghayth-erp/src/routes/settingsRoutes.tsx:12`
- المجموعة: `settings`
- الكومبوننت: `SettingsRules`
- subKey: — | minRoleLevel: —
- الكيان المستنبط: `rules`
- سطور الملف: 476
- مصدر موجود: ✅

## 2. الأزرار والإجراءات
_لا توجد طلبات كتابة من هذه الصفحة._

### تفاصيل الأزرار المرئية
- L166: "(بلا تسمية)" → `() => setExpanded(!expanded)`

### القراءات (GET)
_لا قراءات._



## 3. الحركات ذات الصلة (Cross-Module Transactions)

قواعد النظام (Business Rules) — Configurable rules per company/module.

| الفئة | المثال |
|------|--------|
| Approval thresholds | "expenses > 5000 SAR requires CFO approval" |
| Discount limits | "max 20% per order, > 20% requires manager" |
| Leave policies | "annual leave 30 days post-5-years tenure" |
| Loan eligibility | "min 1 year tenure, max 6 months salary" |
| Pricing rules | "client tier A gets 10% off" |
| Tax rules | "0% VAT for exports" |
| Working hours | "Ramadan 6h/day per Saudi Labor Law" |
| SLA defaults | "urgent ticket 2h response" |
| Notification rules | "send email + SMS for critical" |
| Audit retention | "10 years for finance, 5 for HR" |

| الحركة | API | DB | الحالة |
|--------|-----|-----|--------|
| List rules | GET `/settings/rules` | `business_rules` | ✅ |
| Create rule | POST | with category + condition + action | ✅ |
| Edit rule | PATCH | with audit + version | ✅ critical |
| Test rule (dry-run) | POST `/rules/:id/test` | with mock data | ⚠ |
| Activate/Deactivate | toggle | ✅ |
| Version history | snapshots | ✅ critical |
| Rule conflicts detection | which fires first? | ⚠ |
| Audit log on rule changes | `audit_logs` | ✅ critical |
| تكامل مع `governance/approvals.md` (approval rules) | ✅ critical |
| تكامل مع `automation.md` (action rules) | ✅ |
| تكامل مع `hr-payroll.md` (compensation rules) | ✅ critical |
| تكامل مع `finance-tax.md` (tax rules) | ✅ critical |
| تكامل مع `finance-budget.md` (budget rules) | ✅ |
| تكامل مع `eventCatalog.ts` (rule triggers) | ✅ |
| RBAC | admin + finance + hr per scope | ✅ critical |

تحقق يدوي:
- [ ] هل rule changes effective-dated (لا retroactive without explicit flag)?
- [ ] هل conflict resolution between rules deterministic?
- [ ] هل dry-run truly side-effect-free?
- [ ] هل rule version history reviewable for audit purposes?
- [ ] هل rule conditions DSL secure (no code injection)?

## 4. النمذجة
_لم يتم العثور على جدول Drizzle بالاسم المستنبط `rules` — قد يكون معرّفًا في migrations فقط (راجع `artifacts/api-server/src/migrations`)._

## 5. البيانات الوهمية الثابتة
✅ لا توجد بيانات وهمية ثابتة مكتشفة آلياً.

## 6. النتيجة (Verdict)
- Runtime audit: **⚠ PARTIAL** — render=PASS | fetch=PASS | CTA=SKIP | nav=FAIL | smoke=PASS
- ملاحظة: `landed=/dashboard expected=/settings/rules`
- لقطة: `audit/screenshots/settings_rules.png`
- landedUrl: `http://localhost/dashboard`
- توصية: **يحتاج إصلاح**
